import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import {
  anonymousSessions,
  consumerPreferences,
  consumerProfiles,
  dealerships,
  inventory,
  inventoryVideos,
  swipeDecisions,
} from "@/server/db/schema";
import { getPartnerDecisionComparison, getSharedPreferenceProfile } from "./decision-comparison";

/**
 * Gap 3 (targeted gap-closure pass): the Partner Shared Match page needs
 * real "both liked", "both loved", and "disagreement" buckets computed
 * from the two partners' *actual* independent swipe decisions - not just
 * a catalog-wide compromise-fit score (that's what shared-matches.ts
 * already did and still does). It also needs a genuinely-computed shared
 * preference profile ("matched on N of M") rather than a hardcoded
 * fraction.
 */

let dealershipId: string;
let ownerConsumerProfileId: string;
let partnerConsumerProfileId: string;
let rvBothLike: string;
let rvBothLove: string;
let rvDisagreement: string;
let rvOnlyOwnerDecided: string;

async function makeConsumerProfile(): Promise<string> {
  const [session] = await db.insert(anonymousSessions).values({}).returning({ id: anonymousSessions.id });
  const [profile] = await db
    .insert(consumerProfiles)
    .values({ anonymousSessionId: session.id })
    .returning({ id: consumerProfiles.id });
  return profile.id;
}

async function makeRv(suffix: string, overrides: Partial<typeof inventory.$inferInsert> = {}): Promise<string> {
  const [rv] = await db
    .insert(inventory)
    .values({
      dealershipId,
      stockNumber: `PDC-${suffix}-${Date.now()}`,
      year: 2024,
      make: "Forest River",
      model: "Rockwood",
      rvType: "travel_trailer",
      condition: "new",
      salePriceCents: 3500000,
      status: "published",
      source: "manual",
      ...overrides,
    })
    .returning({ id: inventory.id });
  const [video] = await db
    .insert(inventoryVideos)
    .values({ inventoryId: rv.id, url: `/media/videos/${suffix}.mp4`, source: "dealer_upload" })
    .returning({ id: inventoryVideos.id });
  await db.update(inventory).set({ primaryVideoId: video.id }).where(eq(inventory.id, rv.id));
  return rv.id;
}

beforeAll(async () => {
  const suffix = Date.now();
  const [dealership] = await db
    .insert(dealerships)
    .values({
      name: "__test_partner_decisions__",
      slug: `__test-partner-decisions-${suffix}`,
      primaryContactName: "Test",
      primaryContactEmail: `partner-decisions-${suffix}@example.com`,
      status: "approved",
    })
    .returning({ id: dealerships.id });
  dealershipId = dealership.id;

  ownerConsumerProfileId = await makeConsumerProfile();
  partnerConsumerProfileId = await makeConsumerProfile();

  rvBothLike = await makeRv("both-like");
  rvBothLove = await makeRv("both-love");
  rvDisagreement = await makeRv("disagree");
  rvOnlyOwnerDecided = await makeRv("owner-only");

  await db.insert(swipeDecisions).values([
    { consumerProfileId: ownerConsumerProfileId, inventoryId: rvBothLike, decision: "like" },
    { consumerProfileId: partnerConsumerProfileId, inventoryId: rvBothLike, decision: "more_like_this" },

    { consumerProfileId: ownerConsumerProfileId, inventoryId: rvBothLove, decision: "love" },
    { consumerProfileId: partnerConsumerProfileId, inventoryId: rvBothLove, decision: "love" },

    { consumerProfileId: ownerConsumerProfileId, inventoryId: rvDisagreement, decision: "love" },
    { consumerProfileId: partnerConsumerProfileId, inventoryId: rvDisagreement, decision: "pass" },

    { consumerProfileId: ownerConsumerProfileId, inventoryId: rvOnlyOwnerDecided, decision: "like" },
    // partner has not decided on rvOnlyOwnerDecided - must not appear anywhere.
  ]);
});

afterAll(async () => {
  await db.delete(consumerProfiles).where(eq(consumerProfiles.id, ownerConsumerProfileId));
  await db.delete(consumerProfiles).where(eq(consumerProfiles.id, partnerConsumerProfileId));
  await db.delete(dealerships).where(eq(dealerships.id, dealershipId));
});

describe("getPartnerDecisionComparison", () => {
  it("buckets RVs both partners liked-or-better, both loved, and disagreed on - from real swipe rows only", async () => {
    const result = await getPartnerDecisionComparison(ownerConsumerProfileId, partnerConsumerProfileId);

    expect(result.bothLikedOrBetter.map((c) => c.id).sort()).toEqual([rvBothLike, rvBothLove].sort());
    expect(result.bothLoved.map((c) => c.id)).toEqual([rvBothLove]);
    expect(result.disagreements.map((c) => c.id)).toEqual([rvDisagreement]);

    // An RV only one partner has decided on is not comparable and must not
    // appear in any bucket.
    const allIds = [
      ...result.bothLikedOrBetter,
      ...result.bothLoved,
      ...result.disagreements,
    ].map((c) => c.id);
    expect(allIds).not.toContain(rvOnlyOwnerDecided);
  });

  it("hydrates real inventory data (not placeholder values) for each card", async () => {
    const result = await getPartnerDecisionComparison(ownerConsumerProfileId, partnerConsumerProfileId);
    const card = result.bothLoved[0];
    expect(card.year).toBe(2024);
    expect(card.make).toBe("Forest River");
    expect(card.videoUrl).toContain("both-love");
  });
});

describe("getSharedPreferenceProfile", () => {
  beforeAll(async () => {
    await db.insert(consumerPreferences).values([
      // Both strongly prefer travel_trailer - a real match.
      { consumerProfileId: ownerConsumerProfileId, attribute: "rv_type", value: "travel_trailer", score: "3", observations: 6 },
      { consumerProfileId: partnerConsumerProfileId, attribute: "rv_type", value: "travel_trailer", score: "3", observations: 6 },

      // Both have a confident but *different* top price band - comparable, not matched.
      { consumerProfileId: ownerConsumerProfileId, attribute: "price_band", value: "30000-40000", score: "3", observations: 6 },
      { consumerProfileId: partnerConsumerProfileId, attribute: "price_band", value: "60000-70000", score: "3", observations: 6 },

      // Only the owner has a confident bunkhouse signal - not comparable, must not appear.
      { consumerProfileId: ownerConsumerProfileId, attribute: "bunkhouse", value: "yes", score: "3", observations: 6 },

      // Partner has a weak/low-confidence make signal - below the
      // meaningful-signal threshold, must not count as comparable.
      { consumerProfileId: ownerConsumerProfileId, attribute: "make", value: "Forest River", score: "3", observations: 6 },
      { consumerProfileId: partnerConsumerProfileId, attribute: "make", value: "Forest River", score: "0.05", observations: 1 },
    ]);
  });

  it("only counts dimensions where both partners have a real, confident, positive signal", async () => {
    const profile = await getSharedPreferenceProfile(ownerConsumerProfileId, partnerConsumerProfileId);

    const byAttribute = Object.fromEntries(profile.dimensions.map((d) => [d.attribute, d]));
    expect(byAttribute.rv_type?.matched).toBe(true);
    expect(byAttribute.price_band?.matched).toBe(false);
    expect(byAttribute.bunkhouse).toBeUndefined(); // not comparable - only one partner has a signal
    expect(byAttribute.make).toBeUndefined(); // partner's signal too weak to count as confident

    // matchedCount/comparableCount must be derived from the actual
    // dimensions array, never hardcoded.
    expect(profile.comparableCount).toBe(profile.dimensions.length);
    expect(profile.matchedCount).toBe(profile.dimensions.filter((d) => d.matched).length);
    expect(profile.matchedCount).toBeGreaterThanOrEqual(1);
  });
});
