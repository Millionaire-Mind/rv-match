import { and, count, countDistinct, eq, sql } from "drizzle-orm";

import { db } from "@/server/db/client";
import { behavioralEvents, consumerProfiles, dealerships, savedInventory } from "@/server/db/schema";
import { haversineMiles } from "@/server/geo/zip-centroids";
import type { IntentWeights } from "./config";
import type { leadCtaTypeSchema } from "@/server/validation/enums";
import type { z } from "zod";

type LeadCtaType = z.infer<typeof leadCtaTypeSchema>;

export interface IntentResult {
  score: number;
  reasons: string[];
}

/**
 * Computes the 0-100 purchase-intent score for a lead at submission time,
 * from the consumer's real behavioral history plus which CTA they used.
 * Every contributing signal is surfaced in `reasons` so the dealer sees
 * *why* a lead is scored the way it is — never just a bare number.
 */
export async function computeIntentScore(params: {
  consumerProfileId: string | null;
  dealershipId: string;
  ctaType: LeadCtaType;
  weights: IntentWeights;
}): Promise<IntentResult> {
  const { consumerProfileId, dealershipId, ctaType, weights } = params;
  const reasons: string[] = [];
  let score = 0;

  if (ctaType === "check_availability") {
    score += weights.availability_request;
    reasons.push("Requested availability on this RV");
  } else if (ctaType === "schedule_walkthrough") {
    score += weights.appointment_request;
    reasons.push("Requested a walkthrough appointment");
  } else if (ctaType === "request_best_price") {
    score += weights.availability_request * 0.6;
    reasons.push("Asked for the dealer's best price");
  }

  if (!consumerProfileId) {
    return { score: Math.round(clamp(score)), reasons };
  }

  const [saveRow] = await db
    .select({ n: count() })
    .from(savedInventory)
    .where(eq(savedInventory.consumerProfileId, consumerProfileId));
  const saveCount = saveRow?.n ?? 0;
  if (saveCount > 0) {
    const contribution = Math.min(saveCount, 5) * weights.save;
    score += contribution;
    reasons.push(`Saved ${saveCount} RV${saveCount === 1 ? "" : "s"}`);
  }

  const [dealerViewRow] = await db
    .select({ n: count() })
    .from(behavioralEvents)
    .where(
      and(
        eq(behavioralEvents.consumerProfileId, consumerProfileId),
        eq(behavioralEvents.eventType, "dealer_view"),
        eq(behavioralEvents.dealershipId, dealershipId),
      ),
    );
  const dealerViewCount = dealerViewRow?.n ?? 0;
  if (dealerViewCount > 0) {
    score += Math.min(dealerViewCount, 5) * weights.dealer_view;
    reasons.push(
      `Viewed this dealer's inventory ${dealerViewCount} time${dealerViewCount === 1 ? "" : "s"}`,
    );
  }

  const [detailViewRow] = await db
    .select({ n: count() })
    .from(behavioralEvents)
    .where(
      and(
        eq(behavioralEvents.consumerProfileId, consumerProfileId),
        eq(behavioralEvents.eventType, "detail_view"),
      ),
    );
  const detailViewCount = detailViewRow?.n ?? 0;
  if (detailViewCount > 0) {
    score += Math.min(detailViewCount, 10) * weights.detail_view;
  }

  const [videoCompleteRow] = await db
    .select({ n: count() })
    .from(behavioralEvents)
    .where(
      and(
        eq(behavioralEvents.consumerProfileId, consumerProfileId),
        eq(behavioralEvents.eventType, "video_complete"),
      ),
    );
  const videoCompleteCount = videoCompleteRow?.n ?? 0;
  if (videoCompleteCount > 0) {
    score += Math.min(videoCompleteCount, 10) * weights.video_complete;
  }

  const [sessionRow] = await db
    .select({ n: countDistinct(sql`date_trunc('day', ${behavioralEvents.createdAt})`) })
    .from(behavioralEvents)
    .where(eq(behavioralEvents.consumerProfileId, consumerProfileId));
  const activeDays = sessionRow?.n ?? 0;
  if (activeDays > 1) {
    score += weights.repeat_session;
    reasons.push(`Returned across ${activeDays} different days`);
  }

  const [consumer] = await db
    .select({ lat: consumerProfiles.lat, lng: consumerProfiles.lng })
    .from(consumerProfiles)
    .where(eq(consumerProfiles.id, consumerProfileId))
    .limit(1);
  const [dealer] = await db
    .select({ lat: dealerships.lat, lng: dealerships.lng })
    .from(dealerships)
    .where(eq(dealerships.id, dealershipId))
    .limit(1);

  if (consumer?.lat && consumer?.lng && dealer?.lat && dealer?.lng) {
    const miles = haversineMiles(
      { lat: Number(consumer.lat), lng: Number(consumer.lng) },
      { lat: Number(dealer.lat), lng: Number(dealer.lng) },
    );
    if (miles <= weights.proximityBonusMiles) {
      const bonus = weights.proximityBonusMax * (1 - miles / weights.proximityBonusMiles);
      score += bonus;
      reasons.push(`Lives ${Math.round(miles)} miles away`);
    }
  }

  return { score: Math.round(clamp(score)), reasons };
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}
