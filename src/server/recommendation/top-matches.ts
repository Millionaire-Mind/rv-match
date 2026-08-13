import { desc, inArray } from "drizzle-orm";

import { db } from "@/server/db/client";
import { inventory, inventoryPhotos, inventoryVideos } from "@/server/db/schema";
import { loadPreferenceMap, normalizedAttributeScore } from "./preferences";
import { attributesForInventory } from "./attributes";
import { explainAttribute, type ScoredInventory } from "./engine";
import { discoveryEligible } from "@/server/inventory/eligibility";

/**
 * Top matches for the Match Results page: scores *all* published
 * inventory (not just unseen RVs, unlike the discovery feed) by learned
 * attribute preference only (no distance/price weighting — that's the
 * discovery feed's job) so a consumer's top matches can include units
 * they already liked/loved.
 */
export async function getTopMatches(consumerProfileId: string, limit = 12): Promise<ScoredInventory[]> {
  const prefs = await loadPreferenceMap(consumerProfileId);

  const candidates = await db
    .select()
    .from(inventory)
    .where(discoveryEligible())
    .orderBy(desc(inventory.dateAdded))
    .limit(500);

  const scored = candidates.map((rv) => {
    const attrs = attributesForInventory(rv);
    const attrScores = attrs.map((a) => normalizedAttributeScore(prefs.get(a.attribute, a.value)));
    const attributeScore =
      attrScores.length > 0 ? attrScores.reduce((s, v) => s + v, 0) / attrScores.length : 0;
    const fitScore = Math.round(Math.max(0, Math.min(1, (attributeScore + 1) / 2)) * 100);

    const explanations = attrs
      .map((a, i) => ({ ...a, score: attrScores[i] }))
      .filter((a) => a.score > 0.15)
      .sort((a, b) => b.score - a.score)
      .slice(0, 2)
      .map((a) => explainAttribute(a.attribute, a.value));

    return { rv, fitScore, explanations };
  });

  const top = scored.sort((a, b) => b.fitScore - a.fitScore).slice(0, limit);
  const ids = top.map((t) => t.rv.id);
  if (ids.length === 0) return [];

  const [photoRows, videoRows] = await Promise.all([
    db.select().from(inventoryPhotos).where(inArray(inventoryPhotos.inventoryId, ids)),
    db.select().from(inventoryVideos).where(inArray(inventoryVideos.inventoryId, ids)),
  ]);

  const photoByInv = new Map<string, string>();
  for (const p of photoRows) if (!photoByInv.has(p.inventoryId)) photoByInv.set(p.inventoryId, p.url);

  return top.map(({ rv, fitScore, explanations }) => {
    // Match the RV's actual primaryVideoId, not just any video row for this
    // inventory id - an RV can have both a dealer-uploaded and a generated
    // video, and only primaryVideoId says which one is authoritative.
    const primaryVideo = videoRows.find((v) => v.id === rv.primaryVideoId) ?? videoRows.find((v) => v.inventoryId === rv.id);
    return {
      inventory: rv,
      primaryPhotoUrl: photoByInv.get(rv.id) ?? null,
      primaryVideoUrl: primaryVideo?.url ?? null,
      primaryVideoCaptionUrl: primaryVideo?.captionUrl ?? null,
      fitScore,
      isExploration: false,
      explanations,
      distanceMiles: null,
    };
  });
}
