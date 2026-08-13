import { desc, inArray } from "drizzle-orm";

import { db } from "@/server/db/client";
import { inventory, inventoryPhotos, inventoryVideos } from "@/server/db/schema";
import { loadPreferenceMap, normalizedAttributeScore } from "@/server/recommendation/preferences";
import { attributesForInventory } from "@/server/recommendation/attributes";
import { discoveryEligible } from "@/server/inventory/eligibility";

export interface SharedMatchCard {
  id: string;
  year: number;
  make: string;
  model: string;
  priceCents: number;
  photoUrl: string | null;
  videoUrl: string | null;
  /** 0-100, how well this RV fits both partners - the *lower* of the two individual fit scores, so a shared match never flatters one side's taste at the other's expense. */
  sharedFitScore: number;
  ownerFitScore: number;
  partnerFitScore: number;
  /** Attributes both partners have responded well to, e.g. "You both like bunkhouse layouts". */
  sharedExplanations: string[];
}

/** Explanation phrasing for a shared match - distinct from explainAttribute() in engine.ts, which is written in second-person singular ("You like...") and isn't a fit for "both of you" framing. */
function explainSharedAttribute(attribute: string, value: string): string {
  switch (attribute) {
    case "rv_type":
      return `You both like ${value.replace(/_/g, " ")}s`;
    case "bunkhouse":
      return "You both respond well to bunkhouse layouts";
    case "outdoor_kitchen":
      return "You both respond well to outdoor kitchens";
    case "toy_hauler":
      return "You both respond well to toy haulers";
    case "make":
      return `You both like ${value}`;
    case "price_band":
      return "Fits both your typical price ranges";
    default:
      return `Matches what you're both drawn to (${attribute.replace(/_/g, " ")})`;
  }
}

/**
 * Scores every video-eligible RV against *both* partners' independently
 * learned preferences and surfaces what fits them both - not an average
 * (which could rank an RV highly that one partner actively dislikes just
 * because the other loves it), but the minimum of the two individual fit
 * scores, so a top shared match is a genuine compromise, not a one-sided win.
 */
export async function getSharedMatches(
  ownerConsumerProfileId: string,
  partnerConsumerProfileId: string,
  limit = 12,
): Promise<SharedMatchCard[]> {
  const [ownerPrefs, partnerPrefs] = await Promise.all([
    loadPreferenceMap(ownerConsumerProfileId),
    loadPreferenceMap(partnerConsumerProfileId),
  ]);

  const candidates = await db
    .select()
    .from(inventory)
    .where(discoveryEligible())
    .orderBy(desc(inventory.dateAdded))
    .limit(500);

  const scored = candidates.map((rv) => {
    const attrs = attributesForInventory(rv);
    const ownerScores = attrs.map((a) => normalizedAttributeScore(ownerPrefs.get(a.attribute, a.value)));
    const partnerScores = attrs.map((a) => normalizedAttributeScore(partnerPrefs.get(a.attribute, a.value)));

    const ownerAvg = ownerScores.length > 0 ? ownerScores.reduce((s, v) => s + v, 0) / ownerScores.length : 0;
    const partnerAvg = partnerScores.length > 0 ? partnerScores.reduce((s, v) => s + v, 0) / partnerScores.length : 0;

    const ownerFitScore = Math.round(Math.max(0, Math.min(1, (ownerAvg + 1) / 2)) * 100);
    const partnerFitScore = Math.round(Math.max(0, Math.min(1, (partnerAvg + 1) / 2)) * 100);
    const sharedFitScore = Math.min(ownerFitScore, partnerFitScore);

    const sharedExplanations = attrs
      .map((a, i) => ({ ...a, minScore: Math.min(ownerScores[i], partnerScores[i]) }))
      .filter((a) => a.minScore > 0.15)
      .sort((a, b) => b.minScore - a.minScore)
      .slice(0, 2)
      .map((a) => explainSharedAttribute(a.attribute, a.value));

    return { rv, ownerFitScore, partnerFitScore, sharedFitScore, sharedExplanations };
  });

  const top = scored.sort((a, b) => b.sharedFitScore - a.sharedFitScore).slice(0, limit);
  const ids = top.map((t) => t.rv.id);
  if (ids.length === 0) return [];

  const [photoRows, videoRows] = await Promise.all([
    db.select().from(inventoryPhotos).where(inArray(inventoryPhotos.inventoryId, ids)),
    db.select().from(inventoryVideos).where(inArray(inventoryVideos.inventoryId, ids)),
  ]);
  const photoByInv = new Map<string, string>();
  for (const p of photoRows) if (!photoByInv.has(p.inventoryId)) photoByInv.set(p.inventoryId, p.url);

  return top.map(({ rv, ownerFitScore, partnerFitScore, sharedFitScore, sharedExplanations }) => {
    const primaryVideo =
      videoRows.find((v) => v.id === rv.primaryVideoId) ?? videoRows.find((v) => v.inventoryId === rv.id);
    return {
      id: rv.id,
      year: rv.year,
      make: rv.make,
      model: rv.model,
      priceCents: rv.advertisedPriceCents ?? rv.salePriceCents,
      photoUrl: photoByInv.get(rv.id) ?? null,
      videoUrl: primaryVideo?.url ?? null,
      sharedFitScore,
      ownerFitScore,
      partnerFitScore,
      sharedExplanations,
    };
  });
}
