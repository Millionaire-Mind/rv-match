import { desc, eq, inArray } from "drizzle-orm";

import { db } from "@/server/db/client";
import { inventory, inventoryPhotos, inventoryVideos } from "@/server/db/schema";
import { loadPreferenceMap, normalizedAttributeScore } from "./preferences";
import { attributesForInventory } from "./attributes";
import { explainAttribute, type ScoredInventory } from "./engine";

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
    .where(eq(inventory.status, "published"))
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
  const videoByInv = new Map<string, string>();
  for (const v of videoRows) if (v.url) videoByInv.set(v.inventoryId, v.url);

  return top.map(({ rv, fitScore, explanations }) => ({
    inventory: rv,
    primaryPhotoUrl: photoByInv.get(rv.id) ?? null,
    primaryVideoUrl: videoByInv.get(rv.id) ?? null,
    fitScore,
    isExploration: false,
    explanations,
    distanceMiles: null,
  }));
}
