import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";

import { db } from "@/server/db/client";
import {
  anonymousSessions,
  consumerProfiles,
  dealerships,
  inventory,
  inventoryVideos,
  swipeDecisions,
} from "@/server/db/schema";
import { getDiscoveryBatch } from "./engine";
import { updatePreferencesForSwipe, type SwipeDecisionType } from "./preferences";
import { loadRecommendationWeights } from "./config";

/** Mirrors what src/server/discovery/actions.ts's submitSwipeDecision does (record the decision + apply its preference delta) without the request-scoped auth/cookie plumbing this test doesn't need. */
async function recordSwipe(inventoryId: string, decision: SwipeDecisionType, weights: Awaited<ReturnType<typeof loadRecommendationWeights>>) {
  await db.insert(swipeDecisions).values({ consumerProfileId, inventoryId, decision, swipeDurationMs: 1500 });
  const [rv] = await db.select().from(inventory).where(eq(inventory.id, inventoryId));
  await updatePreferencesForSwipe(consumerProfileId, rv, decision, 1500, weights);
}

/**
 * End-to-end proof of the learning loop the original spec explicitly asks
 * to be tested: initial (neutral) ranking, a LOVE on one category, a PASS
 * on another, MORE LIKE THIS reinforcing the loved category, and the next
 * batch's ranking moving in the expected direction - while still excluding
 * every already-swiped RV and still holding an exploration slot open
 * rather than collapsing entirely onto the top-scored category.
 */

let dealershipId: string;
let anonymousSessionId: string;
let consumerProfileId: string;
const allInventoryIds: string[] = [];

let travelA: string; // will be LOVEd
let travelB: string; // will get MORE LIKE THIS
let travelC: string; // left unswiped - should rank up after learning
let fifthA: string; // will be PASSed
let fifthB: string; // left unswiped - should rank down after learning
let fifthC: string; // left unswiped - should rank down after learning

async function makeRv(rvType: "travel_trailer" | "fifth_wheel" | "class_a", stock: string) {
  const [rv] = await db
    .insert(inventory)
    .values({
      dealershipId,
      stockNumber: stock,
      year: 2024,
      make: "Test Make",
      model: "Test Model",
      rvType,
      condition: "new",
      salePriceCents: 4000000,
      status: "published",
      source: "manual",
    })
    .returning({ id: inventory.id });
  const [video] = await db
    .insert(inventoryVideos)
    .values({ inventoryId: rv.id, url: `/media/videos/${stock}.mp4`, source: "dealer_upload" })
    .returning({ id: inventoryVideos.id });
  await db.update(inventory).set({ primaryVideoId: video.id }).where(eq(inventory.id, rv.id));
  allInventoryIds.push(rv.id);
  return rv.id;
}

beforeAll(async () => {
  const suffix = Date.now();
  const [dealership] = await db
    .insert(dealerships)
    .values({
      name: "__test_learning__",
      slug: `__test-learning-${suffix}`,
      primaryContactName: "Test",
      primaryContactEmail: `learning-${suffix}@example.com`,
      status: "approved",
    })
    .returning({ id: dealerships.id });
  dealershipId = dealership.id;

  const [session] = await db.insert(anonymousSessions).values({}).returning({ id: anonymousSessions.id });
  anonymousSessionId = session.id;
  const [profile] = await db
    .insert(consumerProfiles)
    .values({ anonymousSessionId })
    .returning({ id: consumerProfiles.id });
  consumerProfileId = profile.id;

  travelA = await makeRv("travel_trailer", `LEARN-TT-A-${suffix}`);
  travelB = await makeRv("travel_trailer", `LEARN-TT-B-${suffix}`);
  travelC = await makeRv("travel_trailer", `LEARN-TT-C-${suffix}`);
  fifthA = await makeRv("fifth_wheel", `LEARN-FW-A-${suffix}`);
  fifthB = await makeRv("fifth_wheel", `LEARN-FW-B-${suffix}`);
  fifthC = await makeRv("fifth_wheel", `LEARN-FW-C-${suffix}`);

  // Filler pool so the exploration slot has real unswiped material to draw
  // from beyond the top-scored candidates (see getDiscoveryBatch: with a
  // tiny candidate pool the "remainder" available for exploration is
  // empty and the assertion would be meaningless).
  for (let i = 0; i < 20; i++) {
    await makeRv("class_a", `LEARN-FILLER-${suffix}-${i}`);
  }
});

afterAll(async () => {
  await db.delete(inventory).where(inArray(inventory.id, allInventoryIds));
  await db.delete(consumerProfiles).where(eq(consumerProfiles.id, consumerProfileId));
  await db.delete(anonymousSessions).where(eq(anonymousSessions.id, anonymousSessionId));
  await db.delete(dealerships).where(eq(dealerships.id, dealershipId));
});

describe("recommendation learning loop", () => {
  it("shows a neutral initial ranking with no swipe history yet", async () => {
    const batch = await getDiscoveryBatch(consumerProfileId, 10);
    expect(batch.length).toBeGreaterThan(0);
    // No signal yet - fitScore is centered on 50 (see engine.ts:
    // ((combined + 1) / 2) * 100 for combined=0), not already biased
    // toward one category.
    for (const card of batch) {
      expect(Math.abs(card.fitScore - 50)).toBeLessThan(15);
    }
  });

  it("moves subsequent ranking in the expected direction after LOVE, PASS, and MORE LIKE THIS", async () => {
    const weights = await loadRecommendationWeights();
    await recordSwipe(travelA, "love", weights);
    await recordSwipe(fifthA, "pass", weights);
    await recordSwipe(travelB, "more_like_this", weights);

    const batch = await getDiscoveryBatch(consumerProfileId, 10);
    const byId = new Map(batch.map((c) => [c.inventory.id, c]));

    // Already-swiped RVs must never reappear.
    expect(byId.has(travelA)).toBe(false);
    expect(byId.has(fifthA)).toBe(false);
    expect(byId.has(travelB)).toBe(false);

    // The unswiped travel_trailer should now clearly outrank the unswiped
    // fifth_wheels - that's the whole point of the loop actually learning.
    const travelCCard = byId.get(travelC);
    const fifthBCard = byId.get(fifthB);
    const fifthCCard = byId.get(fifthC);
    expect(travelCCard).toBeDefined();

    if (travelCCard && fifthBCard) {
      expect(travelCCard.fitScore).toBeGreaterThan(fifthBCard.fitScore);
    }
    if (travelCCard && fifthCCard) {
      expect(travelCCard.fitScore).toBeGreaterThan(fifthCCard.fitScore);
    }

    // Exploration keeps a slot open rather than the feed collapsing
    // entirely onto the highest-scored category.
    expect(batch.some((c) => c.isExploration)).toBe(true);
  });
});
