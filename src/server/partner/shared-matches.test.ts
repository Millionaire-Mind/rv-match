import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import {
  anonymousSessions,
  consumerProfiles,
  dealerships,
  inventory,
  inventoryVideos,
} from "@/server/db/schema";
import { applyPreferenceDelta } from "@/server/recommendation/preferences";
import { getSharedMatches } from "./shared-matches";

/**
 * Phase 9: a shared match must reflect genuine overlap - an RV only one
 * partner likes should NOT outrank one they both like, and the shared
 * score for a one-sided favorite should be capped by the *other* partner's
 * (lower) individual fit, not averaged up.
 */

let dealershipId: string;
let ownerAnonId: string;
let partnerAnonId: string;
let ownerProfileId: string;
let partnerProfileId: string;
let bothLikeId: string;
let ownerOnlyId: string;

beforeAll(async () => {
  const suffix = Date.now();
  const [dealership] = await db
    .insert(dealerships)
    .values({
      name: "__test_shared_matches__",
      slug: `__test-shared-matches-${suffix}`,
      primaryContactName: "Test",
      primaryContactEmail: `shared-matches-${suffix}@example.com`,
      status: "approved",
    })
    .returning({ id: dealerships.id });
  dealershipId = dealership.id;

  const [ownerSession] = await db.insert(anonymousSessions).values({}).returning({ id: anonymousSessions.id });
  ownerAnonId = ownerSession.id;
  const [ownerProfile] = await db
    .insert(consumerProfiles)
    .values({ anonymousSessionId: ownerAnonId })
    .returning({ id: consumerProfiles.id });
  ownerProfileId = ownerProfile.id;

  const [partnerSession] = await db.insert(anonymousSessions).values({}).returning({ id: anonymousSessions.id });
  partnerAnonId = partnerSession.id;
  const [partnerProfile] = await db
    .insert(consumerProfiles)
    .values({ anonymousSessionId: partnerAnonId })
    .returning({ id: consumerProfiles.id });
  partnerProfileId = partnerProfile.id;

  const [bothLike] = await db
    .insert(inventory)
    .values({
      dealershipId,
      stockNumber: `SHM-BOTH-${suffix}`,
      year: 2024,
      make: "Forest River",
      model: "Rockwood",
      rvType: "travel_trailer",
      condition: "new",
      salePriceCents: 3000000,
      bunkhouse: true,
      status: "published",
      source: "manual",
    })
    .returning();
  bothLikeId = bothLike.id;
  const [bothLikeVideo] = await db
    .insert(inventoryVideos)
    .values({ inventoryId: bothLikeId, url: "/media/videos/both.mp4", source: "dealer_upload" })
    .returning({ id: inventoryVideos.id });
  await db.update(inventory).set({ primaryVideoId: bothLikeVideo.id }).where(eq(inventory.id, bothLikeId));

  const [ownerOnly] = await db
    .insert(inventory)
    .values({
      dealershipId,
      stockNumber: `SHM-OWNER-${suffix}`,
      year: 2024,
      make: "Keystone",
      model: "Montana",
      rvType: "fifth_wheel",
      condition: "new",
      salePriceCents: 7000000,
      status: "published",
      source: "manual",
    })
    .returning();
  ownerOnlyId = ownerOnly.id;
  const [ownerOnlyVideo] = await db
    .insert(inventoryVideos)
    .values({ inventoryId: ownerOnlyId, url: "/media/videos/owner-only.mp4", source: "dealer_upload" })
    .returning({ id: inventoryVideos.id });
  await db.update(inventory).set({ primaryVideoId: ownerOnlyVideo.id }).where(eq(inventory.id, ownerOnlyId));

  // Owner strongly likes both RVs. Partner strongly likes only bothLike's
  // attributes (travel_trailer/bunkhouse) and has no signal at all on
  // ownerOnly's attributes (fifth_wheel), so it should stay neutral for them.
  for (let i = 0; i < 5; i++) {
    await applyPreferenceDelta(ownerProfileId, bothLike, 1);
    await applyPreferenceDelta(ownerProfileId, ownerOnly, 1);
    await applyPreferenceDelta(partnerProfileId, bothLike, 1);
  }
});

afterAll(async () => {
  await db.delete(consumerProfiles).where(eq(consumerProfiles.id, ownerProfileId));
  await db.delete(consumerProfiles).where(eq(consumerProfiles.id, partnerProfileId));
  await db.delete(anonymousSessions).where(eq(anonymousSessions.id, ownerAnonId));
  await db.delete(anonymousSessions).where(eq(anonymousSessions.id, partnerAnonId));
  await db.delete(dealerships).where(eq(dealerships.id, dealershipId));
});

describe("getSharedMatches", () => {
  it("ranks the RV both partners like above the one only the owner likes", async () => {
    const results = await getSharedMatches(ownerProfileId, partnerProfileId, 20);
    const bothLikeCard = results.find((r) => r.id === bothLikeId)!;
    const ownerOnlyCard = results.find((r) => r.id === ownerOnlyId)!;

    expect(bothLikeCard).toBeDefined();
    expect(ownerOnlyCard).toBeDefined();
    expect(bothLikeCard.sharedFitScore).toBeGreaterThan(ownerOnlyCard.sharedFitScore);
  });

  it("caps the shared score at the lower of the two individual fit scores, not an average", () => {
    // Not reachable via the exported function's return shape alone, but
    // ownerOnlyCard's sharedFitScore should equal its partnerFitScore
    // (the constraining, lower side) rather than sitting between the two.
    return getSharedMatches(ownerProfileId, partnerProfileId, 20).then((results) => {
      const ownerOnlyCard = results.find((r) => r.id === ownerOnlyId)!;
      expect(ownerOnlyCard.ownerFitScore).toBeGreaterThan(ownerOnlyCard.partnerFitScore);
      expect(ownerOnlyCard.sharedFitScore).toBe(
        Math.min(ownerOnlyCard.ownerFitScore, ownerOnlyCard.partnerFitScore),
      );
    });
  });

  it("surfaces a shared explanation for the RV they both respond well to", async () => {
    const results = await getSharedMatches(ownerProfileId, partnerProfileId, 20);
    const bothLikeCard = results.find((r) => r.id === bothLikeId)!;
    expect(bothLikeCard.sharedExplanations.length).toBeGreaterThan(0);
    expect(bothLikeCard.sharedExplanations.some((e) => e.startsWith("You both"))).toBe(true);
  });
});
