import { eq, sql } from "drizzle-orm";

import { db } from "@/server/db/client";
import { consumerPreferences } from "@/server/db/schema";
import { attributesForInventory, type InventoryRow } from "./attributes";
import type { RecommendationWeights } from "./config";

export type SwipeDecisionType = "pass" | "like" | "love" | "more_like_this";

/**
 * Applies a swipe decision's signal to every attribute-value pair the RV
 * carries, upserting `consumer_preferences`. This is the write side of the
 * "behavior -> learning" loop.
 */
export async function updatePreferencesForSwipe(
  consumerProfileId: string,
  rv: InventoryRow,
  decision: SwipeDecisionType,
  swipeDurationMs: number | null,
  weights: RecommendationWeights,
): Promise<void> {
  let weight = weights[decision];
  const isFastSwipe =
    swipeDurationMs !== null && swipeDurationMs < weights.fast_swipe_threshold_ms;
  if (isFastSwipe && decision === "pass") {
    weight += weights.fast_swipe_penalty;
  }

  await applyPreferenceDelta(consumerProfileId, rv, weight);
}

export async function updatePreferencesForEvent(
  consumerProfileId: string,
  rv: InventoryRow,
  eventType: "video_complete" | "video_replayed" | "save" | "detail_view",
  weights: RecommendationWeights,
): Promise<void> {
  await applyPreferenceDelta(consumerProfileId, rv, weights[eventType]);
}

async function applyPreferenceDelta(
  consumerProfileId: string,
  rv: InventoryRow,
  weight: number,
): Promise<void> {
  const attrs = attributesForInventory(rv);
  if (attrs.length === 0) return;

  for (const { attribute, value } of attrs) {
    await db
      .insert(consumerPreferences)
      .values({
        consumerProfileId,
        attribute,
        value,
        score: weight.toFixed(4),
        observations: 1,
      })
      .onConflictDoUpdate({
        target: [
          consumerPreferences.consumerProfileId,
          consumerPreferences.attribute,
          consumerPreferences.value,
        ],
        set: {
          score: sql`${consumerPreferences.score} + ${weight}`,
          observations: sql`${consumerPreferences.observations} + 1`,
          updatedAt: new Date(),
        },
      });
  }
}

export interface PreferenceMap {
  get(attribute: string, value: string): { score: number; observations: number } | undefined;
}

export async function loadPreferenceMap(consumerProfileId: string): Promise<PreferenceMap> {
  const rows = await db
    .select()
    .from(consumerPreferences)
    .where(eq(consumerPreferences.consumerProfileId, consumerProfileId));

  const index = new Map<string, { score: number; observations: number }>();
  for (const row of rows) {
    index.set(`${row.attribute}::${row.value}`, {
      score: Number(row.score),
      observations: row.observations,
    });
  }

  return {
    get(attribute, value) {
      return index.get(`${attribute}::${value}`);
    },
  };
}

/** Bounds a raw accumulated score to roughly [-1, 1] and dampens it toward
 * neutral (0) when there are few observations, so a single love doesn't
 * look as confident as a pattern repeated across many RVs. */
export function normalizedAttributeScore(raw: { score: number; observations: number } | undefined): number {
  if (!raw) return 0;
  const bounded = Math.tanh(raw.score / 3);
  const confidence = Math.min(1, raw.observations / 5);
  return bounded * confidence;
}
