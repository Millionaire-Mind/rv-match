import { and, desc, eq, inArray, notInArray } from "drizzle-orm";

import { db } from "@/server/db/client";
import {
  consumerProfiles,
  inventory,
  inventoryPhotos,
  inventoryVideos,
  swipeDecisions,
} from "@/server/db/schema";
import { haversineMiles } from "@/server/geo/zip-centroids";
import { discoveryEligible } from "@/server/inventory/eligibility";
import { attributesForInventory, type InventoryRow } from "./attributes";
import { loadRecommendationWeights, type RecommendationWeights } from "./config";
import { loadPreferenceMap, normalizedAttributeScore, type PreferenceMap } from "./preferences";

export interface ScoredInventory {
  inventory: InventoryRow;
  primaryPhotoUrl: string | null;
  primaryVideoUrl: string | null;
  primaryVideoCaptionUrl: string | null;
  fitScore: number; // 0-100
  isExploration: boolean;
  explanations: string[];
  distanceMiles: number | null;
}

export interface ConsumerContext {
  lat: number | null;
  lng: number | null;
  radiusMiles: number;
}

async function getConsumerContext(consumerProfileId: string): Promise<ConsumerContext> {
  const [row] = await db
    .select({
      lat: consumerProfiles.lat,
      lng: consumerProfiles.lng,
      radiusMiles: consumerProfiles.radiusMiles,
    })
    .from(consumerProfiles)
    .where(eq(consumerProfiles.id, consumerProfileId))
    .limit(1);
  if (!row) return { lat: null, lng: null, radiusMiles: 100 };
  return {
    lat: row.lat ? Number(row.lat) : null,
    lng: row.lng ? Number(row.lng) : null,
    radiusMiles: row.radiusMiles,
  };
}

/** Mean/stddev of the consumer's positively-signaled RV prices, for price-affinity scoring. */
async function getPriceAffinityStats(
  consumerProfileId: string,
): Promise<{ mean: number; stddev: number } | null> {
  const rows = await db
    .select({ priceCents: inventory.salePriceCents })
    .from(swipeDecisions)
    .innerJoin(inventory, eq(swipeDecisions.inventoryId, inventory.id))
    .where(
      and(
        eq(swipeDecisions.consumerProfileId, consumerProfileId),
        inArray(swipeDecisions.decision, ["like", "love", "more_like_this"]),
      ),
    );

  if (rows.length < 3) return null;
  const prices = rows.map((r) => r.priceCents);
  const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
  const variance = prices.reduce((a, b) => a + (b - mean) ** 2, 0) / prices.length;
  return { mean, stddev: Math.max(Math.sqrt(variance), mean * 0.1, 1) };
}

function priceAffinityScore(
  priceCents: number,
  stats: { mean: number; stddev: number } | null,
  sigmaFactor: number,
): number {
  if (!stats) return 0.5;
  const sigma = stats.stddev * (1 / sigmaFactor);
  const z = (priceCents - stats.mean) / Math.max(sigma, 1);
  return Math.exp(-0.5 * z * z);
}

export function distanceScore(
  rv: { lat: string | null; lng: string | null },
  ctx: ConsumerContext,
  decayMiles: number,
): { score: number; withinRadius: boolean; miles: number | null } {
  if (!ctx.lat || !ctx.lng) {
    // The consumer hasn't set a location yet, so no radius restriction
    // applies at all - neutral either way.
    return { score: 0.6, withinRadius: true, miles: null };
  }
  if (!rv.lat || !rv.lng) {
    // The RV's actual distance from this consumer is genuinely unknown.
    // Treating that as "within radius" would be dishonest - it could be
    // anywhere - so it's excluded from radius-filtered results rather
    // than assumed nearby. getDiscoveryBatch still falls back to the
    // full unfiltered pool when too few candidates pass the radius
    // filter, so this doesn't hide such an RV entirely, only stops it
    // from being counted as a confirmed nearby match.
    return { score: 0.6, withinRadius: false, miles: null };
  }
  const miles = haversineMiles(
    { lat: ctx.lat, lng: ctx.lng },
    { lat: Number(rv.lat), lng: Number(rv.lng) },
  );
  return {
    score: Math.exp(-miles / decayMiles),
    withinRadius: miles <= ctx.radiusMiles,
    miles,
  };
}

function scoreCandidate(
  rv: InventoryRow,
  prefs: PreferenceMap,
  ctx: ConsumerContext,
  priceStats: { mean: number; stddev: number } | null,
  weights: RecommendationWeights,
): { fitScore: number; explanations: string[]; withinRadius: boolean; distanceMiles: number | null } {
  const attrs = attributesForInventory(rv);
  const attrScores = attrs.map((a) => ({
    ...a,
    score: normalizedAttributeScore(prefs.get(a.attribute, a.value)),
  }));

  const attributeScore =
    attrScores.length > 0 ? attrScores.reduce((sum, a) => sum + a.score, 0) / attrScores.length : 0;

  const price = priceAffinityScore(
    rv.advertisedPriceCents ?? rv.salePriceCents,
    priceStats,
    weights.priceAffinitySigma,
  );
  const dist = distanceScore(rv, ctx, weights.distanceDecayMiles);

  const combined = attributeScore * 0.6 + (price - 0.5) * 0.5 + (dist.score - 0.5) * 0.3;
  const fitScore = Math.round(Math.max(0, Math.min(1, (combined + 1) / 2)) * 100);

  const explanations = attrScores
    .filter((a) => a.score > 0.15)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((a) => explainAttribute(a.attribute, a.value));

  if (priceStats && price > 0.6) {
    explanations.push("Fits the price range you've responded well to");
  }
  if (dist.miles !== null && dist.miles < weights.distanceDecayMiles) {
    explanations.push(`${Math.round(dist.miles)} miles away`);
  }

  return { fitScore, explanations, withinRadius: dist.withinRadius, distanceMiles: dist.miles };
}

export function explainAttribute(attribute: string, value: string): string {
  switch (attribute) {
    case "rv_type":
      return `You like ${value.replace(/_/g, " ")}s`;
    case "bunkhouse":
      return "You've responded well to bunkhouse layouts";
    case "outdoor_kitchen":
      return "You've responded well to outdoor kitchens";
    case "toy_hauler":
      return "You've responded well to toy haulers";
    case "make":
      return `You like ${value}`;
    case "brand":
      return `You like ${value}`;
    case "price_band":
      return "Matches your typical price range";
    default:
      return `Matches your preferences (${attribute.replace(/_/g, " ")})`;
  }
}

/**
 * Returns a personalized batch of published, not-yet-swiped RVs for the
 * discovery feed: mostly ranked by fit score, with `explorationRate` of the
 * batch sampled from outside the top-fit set so the engine keeps learning
 * and consumers aren't trapped in a filter bubble.
 */
export async function getDiscoveryBatch(
  consumerProfileId: string,
  limit = 10,
): Promise<ScoredInventory[]> {
  const [weights, ctx, prefs, priceStats] = await Promise.all([
    loadRecommendationWeights(),
    getConsumerContext(consumerProfileId),
    loadPreferenceMap(consumerProfileId),
    getPriceAffinityStats(consumerProfileId),
  ]);

  const swiped = await db
    .select({ inventoryId: swipeDecisions.inventoryId })
    .from(swipeDecisions)
    .where(eq(swipeDecisions.consumerProfileId, consumerProfileId));
  const swipedIds = swiped.map((s) => s.inventoryId);

  const candidates = await db
    .select()
    .from(inventory)
    .where(
      and(
        discoveryEligible(),
        swipedIds.length > 0 ? notInArray(inventory.id, swipedIds) : undefined,
      ),
    )
    .orderBy(desc(inventory.dateAdded))
    .limit(400);

  const scored = candidates.map((rv) => ({
    rv,
    ...scoreCandidate(rv, prefs, ctx, priceStats, weights),
  }));

  const eligible = scored.filter((s) => s.withinRadius);
  const pool = eligible.length >= limit ? eligible : scored;

  const sorted = [...pool].sort((a, b) => b.fitScore - a.fitScore);
  const explorationCount = Math.round(limit * weights.explorationRate);
  const topCount = limit - explorationCount;

  const top = sorted.slice(0, topCount);
  const remainder = sorted.slice(topCount);
  const exploration = shuffle(remainder).slice(0, explorationCount);

  const chosen = shuffleInterleave(top, exploration);

  const chosenIds = chosen.map((c) => c.rv.id);
  const [photos, videos] = await Promise.all([
    chosenIds.length
      ? db.select().from(inventoryPhotos).where(inArray(inventoryPhotos.inventoryId, chosenIds))
      : Promise.resolve([]),
    chosenIds.length
      ? db.select().from(inventoryVideos).where(inArray(inventoryVideos.inventoryId, chosenIds))
      : Promise.resolve([]),
  ]);

  return chosen.map(({ rv, fitScore, explanations, distanceMiles }) => {
    const primaryPhoto =
      photos.find((p) => p.id === rv.primaryPhotoId) ??
      photos.filter((p) => p.inventoryId === rv.id).sort((a, b) => a.position - b.position)[0];
    const primaryVideo =
      videos.find((v) => v.id === rv.primaryVideoId) ??
      videos.find((v) => v.inventoryId === rv.id);

    return {
      inventory: rv,
      primaryPhotoUrl: primaryPhoto?.url ?? null,
      primaryVideoUrl: primaryVideo?.url ?? null,
      primaryVideoCaptionUrl: primaryVideo?.captionUrl ?? null,
      fitScore,
      isExploration: exploration.some((e) => e.rv.id === rv.id),
      explanations,
      distanceMiles,
    };
  });
}

export async function scoreOneInventory(
  consumerProfileId: string,
  rv: InventoryRow,
): Promise<{ fitScore: number; explanations: string[]; distanceMiles: number | null }> {
  const [weights, ctx, prefs, priceStats] = await Promise.all([
    loadRecommendationWeights(),
    getConsumerContext(consumerProfileId),
    loadPreferenceMap(consumerProfileId),
    getPriceAffinityStats(consumerProfileId),
  ]);
  const { fitScore, explanations, distanceMiles } = scoreCandidate(rv, prefs, ctx, priceStats, weights);
  return { fitScore, explanations, distanceMiles };
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function shuffleInterleave<T>(primary: T[], secondary: T[]): T[] {
  const result: T[] = [...primary];
  for (const item of secondary) {
    const pos = Math.floor(Math.random() * (result.length + 1));
    result.splice(pos, 0, item);
  }
  return result;
}
