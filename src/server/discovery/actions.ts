"use server";

import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/server/db/client";
import {
  consumerProfiles,
  dealerships,
  inventory,
  inventoryPhotos,
  savedInventory,
  swipeDecisions,
} from "@/server/db/schema";
import { getOrCreateConsumerProfileId } from "@/server/auth/anonymous";
import { getDiscoveryBatch, scoreOneInventory } from "@/server/recommendation/engine";
import { loadRecommendationWeights } from "@/server/recommendation/config";
import { updatePreferencesForSwipe, updatePreferencesForEvent } from "@/server/recommendation/preferences";
import { trackEvent, type BehavioralEventType } from "@/server/analytics/track";
import { toDiscoveryCardDTO, type DiscoveryCardDTO } from "./dto";
import { swipeDecisionSchema } from "@/server/validation/enums";
import { z } from "zod";

async function hydrateCards(
  scored: Awaited<ReturnType<typeof getDiscoveryBatch>>,
): Promise<DiscoveryCardDTO[]> {
  if (scored.length === 0) return [];

  const dealerIds = [...new Set(scored.map((s) => s.inventory.dealershipId))];
  const dealerRows = await db
    .select({ id: dealerships.id, name: dealerships.name })
    .from(dealerships)
    .where(inArray(dealerships.id, dealerIds));
  const dealerMap = new Map(dealerRows.map((d) => [d.id, d]));

  const invIds = scored.map((s) => s.inventory.id);
  const photoRows = await db
    .select()
    .from(inventoryPhotos)
    .where(inArray(inventoryPhotos.inventoryId, invIds))
    .orderBy(inventoryPhotos.position);
  const photosByInv = new Map<string, string[]>();
  for (const p of photoRows) {
    const list = photosByInv.get(p.inventoryId) ?? [];
    list.push(p.url);
    photosByInv.set(p.inventoryId, list);
  }

  return scored.map((s) =>
    toDiscoveryCardDTO(
      s,
      dealerMap.get(s.inventory.dealershipId) ?? { id: s.inventory.dealershipId, name: "RV Dealer" },
      photosByInv.get(s.inventory.id) ?? (s.primaryPhotoUrl ? [s.primaryPhotoUrl] : []),
    ),
  );
}

export async function fetchDiscoveryBatch(limit = 8): Promise<DiscoveryCardDTO[]> {
  const consumerProfileId = await getOrCreateConsumerProfileId();
  const scored = await getDiscoveryBatch(consumerProfileId, limit);
  return hydrateCards(scored);
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

export async function submitSwipeDecision(input: z.infer<typeof swipeInputSchema>): Promise<{
  decisionsCount: number;
}> {
  const parsed = swipeInputSchema.parse(input);
  const consumerProfileId = await getOrCreateConsumerProfileId();

  const [rv] = await db.select().from(inventory).where(eq(inventory.id, parsed.inventoryId)).limit(1);
  if (!rv) throw new Error("This RV is no longer available.");

  const weights = await loadRecommendationWeights();

  await db
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

  await updatePreferencesForSwipe(consumerProfileId, rv, parsed.decision, parsed.swipeDurationMs, weights);

  const [{ decisionsCount }] = await db
    .update(consumerProfiles)
    .set({ decisionsCount: sql`${consumerProfiles.decisionsCount} + 1` })
    .where(eq(consumerProfiles.id, consumerProfileId))
    .returning({ decisionsCount: consumerProfiles.decisionsCount });

  await trackEvent({
    consumerProfileId,
    eventType: parsed.decision as BehavioralEventType,
    inventoryId: parsed.inventoryId,
    dealershipId: rv.dealershipId,
  });

  return { decisionsCount };
}

export async function toggleSaveInventory(
  inventoryId: string,
  save: boolean,
): Promise<{ saved: boolean }> {
  const consumerProfileId = await getOrCreateConsumerProfileId();

  if (save) {
    await db
      .insert(savedInventory)
      .values({ consumerProfileId, inventoryId })
      .onConflictDoNothing();

    const [rv] = await db.select().from(inventory).where(eq(inventory.id, inventoryId)).limit(1);
    if (rv) {
      const weights = await loadRecommendationWeights();
      await updatePreferencesForEvent(consumerProfileId, rv, "save", weights);
    }
    await trackEvent({ consumerProfileId, eventType: "save", inventoryId });
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

export async function recordClientEvent(
  eventType: BehavioralEventType,
  inventoryId?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const consumerProfileId = await getOrCreateConsumerProfileId();

  if (eventType === "video_complete" || eventType === "video_replayed") {
    if (inventoryId) {
      const [rv] = await db.select().from(inventory).where(eq(inventory.id, inventoryId)).limit(1);
      if (rv) {
        const weights = await loadRecommendationWeights();
        await updatePreferencesForEvent(consumerProfileId, rv, eventType, weights);
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
