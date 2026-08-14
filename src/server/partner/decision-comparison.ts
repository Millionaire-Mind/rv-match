import { eq, inArray } from "drizzle-orm";

import { db } from "@/server/db/client";
import {
  consumerPreferences,
  inventory,
  inventoryPhotos,
  inventoryVideos,
  swipeDecisions,
} from "@/server/db/schema";
import { normalizedAttributeScore } from "@/server/recommendation/preferences";
import { ATTRIBUTE_LABELS } from "@/server/recommendation/profile";

export type SwipeDecisionValue = "pass" | "like" | "love" | "more_like_this";

export interface PartnerDecisionCard {
  id: string;
  year: number;
  make: string;
  model: string;
  priceCents: number;
  photoUrl: string | null;
  videoUrl: string | null;
  ownerDecision: SwipeDecisionValue;
  partnerDecision: SwipeDecisionValue;
}

export interface PartnerDecisionComparison {
  /** RVs both partners rated LIKE or better (like/love/more_like_this). */
  bothLikedOrBetter: PartnerDecisionCard[];
  /** RVs both partners explicitly LOVEd. */
  bothLoved: PartnerDecisionCard[];
  /** RVs where one partner responded positively and the other passed - shown neutrally, never editorialized. */
  disagreements: PartnerDecisionCard[];
}

function isPositive(decision: SwipeDecisionValue): boolean {
  return decision === "like" || decision === "love" || decision === "more_like_this";
}

/**
 * Compares the two partners' *actual independent swipe decisions* on RVs
 * they've both decided on - distinct from getSharedMatches (which scores
 * the whole catalog against both partners' learned preference vectors to
 * surface compromise picks the pair hasn't necessarily seen yet). This is
 * "what did you both actually react to during your own swiping."
 */
export async function getPartnerDecisionComparison(
  ownerConsumerProfileId: string,
  partnerConsumerProfileId: string,
): Promise<PartnerDecisionComparison> {
  const [ownerDecisions, partnerDecisions] = await Promise.all([
    db
      .select({ inventoryId: swipeDecisions.inventoryId, decision: swipeDecisions.decision })
      .from(swipeDecisions)
      .where(eq(swipeDecisions.consumerProfileId, ownerConsumerProfileId)),
    db
      .select({ inventoryId: swipeDecisions.inventoryId, decision: swipeDecisions.decision })
      .from(swipeDecisions)
      .where(eq(swipeDecisions.consumerProfileId, partnerConsumerProfileId)),
  ]);

  const partnerByInventory = new Map(partnerDecisions.map((d) => [d.inventoryId, d.decision as SwipeDecisionValue]));

  const bothLikedIds: { id: string; ownerDecision: SwipeDecisionValue; partnerDecision: SwipeDecisionValue }[] = [];
  const bothLovedIds: typeof bothLikedIds = [];
  const disagreementIds: typeof bothLikedIds = [];

  for (const od of ownerDecisions) {
    const pd = partnerByInventory.get(od.inventoryId);
    if (!pd) continue; // partner hasn't decided on this RV yet - not comparable
    const ownerDecision = od.decision as SwipeDecisionValue;
    const entry = { id: od.inventoryId, ownerDecision, partnerDecision: pd };

    if (isPositive(ownerDecision) && isPositive(pd)) bothLikedIds.push(entry);
    if (ownerDecision === "love" && pd === "love") bothLovedIds.push(entry);
    if ((isPositive(ownerDecision) && pd === "pass") || (ownerDecision === "pass" && isPositive(pd))) {
      disagreementIds.push(entry);
    }
  }

  const allIds = [...new Set([...bothLikedIds, ...bothLovedIds, ...disagreementIds].map((e) => e.id))];
  if (allIds.length === 0) {
    return { bothLikedOrBetter: [], bothLoved: [], disagreements: [] };
  }

  const [invRows, photoRows, videoRows] = await Promise.all([
    db.select().from(inventory).where(inArray(inventory.id, allIds)),
    db.select().from(inventoryPhotos).where(inArray(inventoryPhotos.inventoryId, allIds)),
    db.select().from(inventoryVideos).where(inArray(inventoryVideos.inventoryId, allIds)),
  ]);
  const invById = new Map(invRows.map((r) => [r.id, r]));
  const photoByInv = new Map<string, string>();
  for (const p of photoRows) if (!photoByInv.has(p.inventoryId)) photoByInv.set(p.inventoryId, p.url);

  function hydrate(entries: typeof bothLikedIds): PartnerDecisionCard[] {
    return entries
      .map((e) => {
        const rv = invById.get(e.id);
        if (!rv) return null;
        const primaryVideo =
          videoRows.find((v) => v.id === rv.primaryVideoId) ?? videoRows.find((v) => v.inventoryId === rv.id);
        const card: PartnerDecisionCard = {
          id: rv.id,
          year: rv.year,
          make: rv.make,
          model: rv.model,
          priceCents: rv.advertisedPriceCents ?? rv.salePriceCents,
          photoUrl: photoByInv.get(rv.id) ?? null,
          videoUrl: primaryVideo?.url ?? null,
          ownerDecision: e.ownerDecision,
          partnerDecision: e.partnerDecision,
        };
        return card;
      })
      .filter((c): c is PartnerDecisionCard => c !== null);
  }

  return {
    bothLikedOrBetter: hydrate(bothLikedIds),
    bothLoved: hydrate(bothLovedIds),
    disagreements: hydrate(disagreementIds),
  };
}

/** Preference dimensions surfaced on the shared-preference profile - matches the requested list (price range, RV type, bunkhouse, sleeping capacity, length, manufacturer, features, floorplan). "dealer" and "condition" are real learnable attributes but not meaningful "shared preferences" to show a couple. */
const SHARED_PREFERENCE_DIMENSIONS: { attribute: string; label: string }[] = [
  { attribute: "rv_type", label: "RV Type" },
  { attribute: "price_band", label: "Price Range" },
  { attribute: "make", label: "Manufacturer" },
  { attribute: "bunkhouse", label: "Bunkhouse" },
  { attribute: "toy_hauler", label: "Toy Hauler" },
  { attribute: "outdoor_kitchen", label: "Outdoor Kitchen" },
  { attribute: "sleeps_band", label: "Sleeping Capacity" },
  { attribute: "length_band", label: "Length" },
  { attribute: "floorplan", label: "Floorplan" },
];

/** A minimum confident-and-positive signal, matching the threshold shared-match explanations already use (see explainSharedAttribute callers in shared-matches.ts). */
const MEANINGFUL_SIGNAL_THRESHOLD = 0.15;

export interface SharedPreferenceDimension {
  attribute: string;
  label: string;
  matched: boolean;
  ownerValue: string;
  ownerValueLabel: string;
  partnerValue: string;
  partnerValueLabel: string;
}

function labelValue(attribute: string, value: string): string {
  return (ATTRIBUTE_LABELS[attribute] ?? ((v: string) => v))(value);
}

export interface SharedPreferenceProfile {
  /** Only dimensions where BOTH partners have a real, confident, positive signal - never a fabricated conclusion. */
  dimensions: SharedPreferenceDimension[];
  matchedCount: number;
  comparableCount: number;
}

async function topPositiveValueByAttribute(
  consumerProfileId: string,
): Promise<Map<string, { value: string; score: number }>> {
  const rows = await db
    .select()
    .from(consumerPreferences)
    .where(eq(consumerPreferences.consumerProfileId, consumerProfileId));

  const best = new Map<string, { value: string; score: number }>();
  for (const row of rows) {
    const normalized = normalizedAttributeScore({ score: Number(row.score), observations: row.observations });
    if (normalized <= MEANINGFUL_SIGNAL_THRESHOLD) continue;
    const current = best.get(row.attribute);
    if (!current || normalized > current.score) {
      best.set(row.attribute, { value: row.value, score: normalized });
    }
  }
  return best;
}

/**
 * "You matched on N of M major preferences" - both N and M are computed
 * from real behavior, never hardcoded. M (comparableCount) only counts
 * dimensions where *both* partners have shown a confident, positive
 * preference; N (matchedCount) is the subset where that preference is the
 * same value for both.
 */
export async function getSharedPreferenceProfile(
  ownerConsumerProfileId: string,
  partnerConsumerProfileId: string,
): Promise<SharedPreferenceProfile> {
  const [ownerTop, partnerTop] = await Promise.all([
    topPositiveValueByAttribute(ownerConsumerProfileId),
    topPositiveValueByAttribute(partnerConsumerProfileId),
  ]);

  const dimensions: SharedPreferenceDimension[] = [];
  for (const dim of SHARED_PREFERENCE_DIMENSIONS) {
    const ownerEntry = ownerTop.get(dim.attribute);
    const partnerEntry = partnerTop.get(dim.attribute);
    if (!ownerEntry || !partnerEntry) continue;
    dimensions.push({
      attribute: dim.attribute,
      label: dim.label,
      matched: ownerEntry.value === partnerEntry.value,
      ownerValue: ownerEntry.value,
      ownerValueLabel: labelValue(dim.attribute, ownerEntry.value),
      partnerValue: partnerEntry.value,
      partnerValueLabel: labelValue(dim.attribute, partnerEntry.value),
    });
  }

  return {
    dimensions,
    matchedCount: dimensions.filter((d) => d.matched).length,
    comparableCount: dimensions.length,
  };
}
