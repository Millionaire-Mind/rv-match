"use server";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/server/db/client";
import { consumerProfiles, inventory, savedInventory, swipeDecisions } from "@/server/db/schema";
import { getOrCreateConsumerProfileId } from "@/server/auth/anonymous";
import { getDiscoveryBatch, scoreOneInventory } from "@/server/recommendation/engine";
import { loadRecommendationWeights } from "@/server/recommendation/config";
import {
  applyPreferenceDelta,
  updatePreferencesForSwipe,
  updatePreferencesForEvent,
  weightForSwipeDecision,
} from "@/server/recommendation/preferences";
import { trackEvent, type BehavioralEventType } from "@/server/analytics/track";
import { checkRateLimit } from "@/server/security/rate-limit";
import { hydrateScoredInventory } from "./hydrate";
import type { DiscoveryCardDTO } from "./dto";
import { swipeDecisionSchema } from "@/server/validation/enums";
import { z } from "zod";

export async function fetchDiscoveryBatch(limit = 8): Promise<DiscoveryCardDTO[]> {
  const consumerProfileId = await getOrCreateConsumerProfileId();
  const scored = await getDiscoveryBatch(consumerProfileId, limit);
  return hydrateScoredInventory(scored);
}

export async function startDiscoverySession(): Promise<void> {
  const consumerProfileId = await getOrCreateConsumerProfileId();
  await trackEvent({ consumerProfileId, eventType: "discovery_started" });
}

const swipeInputSchema = z.object({
  inventoryId: z.uuid(),
  decision: swipeDecisionSchema,
  swipeDurationMs: z.number().int().nonnegative().nullable(),
});

/**
 * Records a swipe decision exactly once as a real signal. A card is only
 * ever swiped once in the normal UI flow (swiped inventory is excluded
 * from future batches), but this must still be safe against a double-tap
 * or a retried request re-delivering the identical decision - without this
 * check, every resubmission would re-apply the full preference weight and
 * re-increment decisionsCount, letting a client farm preference scores (or
 * fast-forward past the 10/20-decision ZIP-prompt/Match-unlock thresholds)
 * just by resubmitting the same swipe repeatedly. `for("update")` locks
 * any existing row for this (consumer, inventory) pair before deciding, so
 * two near-simultaneous duplicate submissions can't both see "no existing
 * row" and both apply the full delta.
 */
export async function submitSwipeDecision(input: z.infer<typeof swipeInputSchema>): Promise<{
  decisionsCount: number;
}> {
  const parsed = swipeInputSchema.parse(input);
  const consumerProfileId = await getOrCreateConsumerProfileId();

  const [rv] = await db.select().from(inventory).where(eq(inventory.id, parsed.inventoryId)).limit(1);
  if (!rv) throw new Error("This RV is no longer available.");

  const weights = await loadRecommendationWeights();

  const result = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ decision: swipeDecisions.decision })
      .from(swipeDecisions)
      .where(and(eq(swipeDecisions.consumerProfileId, consumerProfileId), eq(swipeDecisions.inventoryId, parsed.inventoryId)))
      .for("update");

    if (existing?.decision === parsed.decision) {
      // Identical resubmission - no new signal. Return the current count
      // unchanged rather than re-counting it as another decision.
      const [profile] = await tx
        .select({ decisionsCount: consumerProfiles.decisionsCount })
        .from(consumerProfiles)
        .where(eq(consumerProfiles.id, consumerProfileId))
        .limit(1);
      return { decisionsCount: profile?.decisionsCount ?? 0, isNewDecision: false };
    }

    await tx
      .insert(swipeDecisions)
      .values({
        consumerProfileId,
        inventoryId: parsed.inventoryId,
        decision: parsed.decision,
        swipeDurationMs: parsed.swipeDurationMs,
      })
      .onConflictDoUpdate({
        target: [swipeDecisions.consumerProfileId, swipeDecisions.inventoryId],
        set: {
          decision: parsed.decision,
          swipeDurationMs: parsed.swipeDurationMs,
          updatedAt: new Date(),
        },
      });

    if (existing) {
      // The decision changed (not currently reachable from the UI, which
      // never re-swipes an already-decided card, but handled correctly
      // regardless): apply only the difference between the old and new
      // weight, so the net preference effect is correct instead of the
      // new weight being added on top of the old one that's still there.
      // Not counted as a new decision - it's a correction to an existing
      // one, not an additional RV decided.
      const oldWeight = weightForSwipeDecision(existing.decision, parsed.swipeDurationMs, weights);
      const newWeight = weightForSwipeDecision(parsed.decision, parsed.swipeDurationMs, weights);
      await applyPreferenceDelta(consumerProfileId, rv, newWeight - oldWeight, tx);
      const [profile] = await tx
        .select({ decisionsCount: consumerProfiles.decisionsCount })
        .from(consumerProfiles)
        .where(eq(consumerProfiles.id, consumerProfileId))
        .limit(1);
      return { decisionsCount: profile?.decisionsCount ?? 0, isNewDecision: false };
    }

    await updatePreferencesForSwipe(consumerProfileId, rv, parsed.decision, parsed.swipeDurationMs, weights, tx);

    const [profile] = await tx
      .update(consumerProfiles)
      .set({ decisionsCount: sql`${consumerProfiles.decisionsCount} + 1` })
      .where(eq(consumerProfiles.id, consumerProfileId))
      .returning({ decisionsCount: consumerProfiles.decisionsCount });
    return { decisionsCount: profile.decisionsCount, isNewDecision: true };
  });

  if (result.isNewDecision) {
    await trackEvent({
      consumerProfileId,
      eventType: parsed.decision as BehavioralEventType,
      inventoryId: parsed.inventoryId,
      dealershipId: rv.dealershipId,
    });
  }

  return { decisionsCount: result.decisionsCount };
}

export async function toggleSaveInventory(
  inventoryId: string,
  save: boolean,
): Promise<{ saved: boolean }> {
  const consumerProfileId = await getOrCreateConsumerProfileId();

  if (save) {
    // .returning() is empty when onConflictDoNothing actually hit a
    // conflict (already saved) - only a genuinely new save is a new
    // signal. Without this check, repeatedly toggling save on/off (or
    // just calling this with save:true again on an already-saved RV)
    // would re-apply the full "save" preference weight every time.
    const inserted = await db
      .insert(savedInventory)
      .values({ consumerProfileId, inventoryId })
      .onConflictDoNothing()
      .returning({ id: savedInventory.id });

    if (inserted.length > 0) {
      const [rv] = await db.select().from(inventory).where(eq(inventory.id, inventoryId)).limit(1);
      if (rv) {
        const weights = await loadRecommendationWeights();
        await updatePreferencesForEvent(consumerProfileId, rv, "save", weights);
      }
      await trackEvent({ consumerProfileId, eventType: "save", inventoryId });
    }
  } else {
    await db
      .delete(savedInventory)
      .where(
        and(
          eq(savedInventory.consumerProfileId, consumerProfileId),
          eq(savedInventory.inventoryId, inventoryId),
        ),
      );
    await trackEvent({ consumerProfileId, eventType: "unsave", inventoryId });
  }

  return { saved: save };
}

/**
 * recordClientEvent is a public server action the client can call directly
 * with any event type - unlike submitSwipeDecision, there's no natural
 * one-per-card constraint to lean on. video_complete/video_replayed feed
 * preference scoring, so without a guard here, a client-side loop
 * replaying the same event could inflate an RV's learned attributes
 * arbitrarily. This still logs every genuine event to behavioral_events
 * for analytics (that part isn't rate-limited - watch-behavior counts are
 * useful even if fired in a burst); it's specifically the preference-score
 * side effect that's capped to once per RV+eventType per short window,
 * generous enough for a consumer genuinely replaying a video a couple
 * times in quick succession but not a scripted flood.
 */
const PREFERENCE_EVENT_COOLDOWN_MS = 5000;

export async function recordClientEvent(
  eventType: BehavioralEventType,
  inventoryId?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const consumerProfileId = await getOrCreateConsumerProfileId();

  if (eventType === "video_complete" || eventType === "video_replayed") {
    if (inventoryId) {
      const allowed = checkRateLimit(
        `pref-event:${consumerProfileId}:${inventoryId}:${eventType}`,
        1,
        PREFERENCE_EVENT_COOLDOWN_MS,
      );
      if (allowed) {
        const [rv] = await db.select().from(inventory).where(eq(inventory.id, inventoryId)).limit(1);
        if (rv) {
          const weights = await loadRecommendationWeights();
          await updatePreferencesForEvent(consumerProfileId, rv, eventType, weights);
        }
      }
    }
  }

  await trackEvent({ consumerProfileId, eventType, inventoryId, metadata });
}

export async function getFitScoreFor(inventoryId: string) {
  const consumerProfileId = await getOrCreateConsumerProfileId();
  const [rv] = await db.select().from(inventory).where(eq(inventory.id, inventoryId)).limit(1);
  if (!rv) return null;
  return scoreOneInventory(consumerProfileId, rv);
}
