import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { anonymousSessions, consumerPreferences, consumerProfiles, dealerships, inventory, savedInventory, swipeDecisions } from "@/server/db/schema";
import { getBehaviorSnapshot, getDealerScopedBehaviorSnapshot } from "@/server/recommendation/profile";

/**
 * Phase 23: a dealer viewing a lead must only ever see how a shopper
 * behaved on *that dealer's own* inventory - not their platform-wide
 * shopping history with other dealers, and not which competing make or
 * dealer they've been responding well to. getDealerScopedBehaviorSnapshot
 * is the only variant leads/actions.ts is allowed to use; this proves it
 * actually withholds what getBehaviorSnapshot (correctly) still shows the
 * consumer about themselves.
 */

let dealershipAId: string;
let dealershipBId: string;
let anonymousSessionId: string;
let consumerProfileId: string;
let rvAId: string;
let rvBId: string;

beforeAll(async () => {
  const suffix = Date.now();
  const [dealerA] = await db
    .insert(dealerships)
    .values({
      name: "__test_scope_dealer_a__",
      slug: `__test-scope-dealer-a-${suffix}`,
      primaryContactName: "Test",
      primaryContactEmail: `scope-dealer-a-${suffix}@example.com`,
      status: "approved",
    })
    .returning({ id: dealerships.id });
  dealershipAId = dealerA.id;

  const [dealerB] = await db
    .insert(dealerships)
    .values({
      name: "__test_scope_dealer_b__",
      slug: `__test-scope-dealer-b-${suffix}`,
      primaryContactName: "Test",
      primaryContactEmail: `scope-dealer-b-${suffix}@example.com`,
      status: "approved",
    })
    .returning({ id: dealerships.id });
  dealershipBId = dealerB.id;

  const [session] = await db.insert(anonymousSessions).values({}).returning({ id: anonymousSessions.id });
  anonymousSessionId = session.id;
  const [profile] = await db
    .insert(consumerProfiles)
    .values({ anonymousSessionId })
    .returning({ id: consumerProfiles.id });
  consumerProfileId = profile.id;

  const [rvA] = await db
    .insert(inventory)
    .values({
      dealershipId: dealershipAId,
      stockNumber: `SCOPE-A-${suffix}`,
      year: 2024,
      make: "Forest River",
      model: "Rockwood",
      rvType: "travel_trailer",
      condition: "new",
      salePriceCents: 4000000,
      status: "published",
      source: "manual",
    })
    .returning({ id: inventory.id });
  rvAId = rvA.id;

  const [rvB] = await db
    .insert(inventory)
    .values({
      dealershipId: dealershipBId,
      stockNumber: `SCOPE-B-${suffix}`,
      year: 2024,
      make: "Jayco",
      model: "Eagle",
      rvType: "fifth_wheel",
      condition: "new",
      salePriceCents: 6000000,
      status: "published",
      source: "manual",
    })
    .returning({ id: inventory.id });
  rvBId = rvB.id;

  // Loves dealer A's RV, passes on dealer B's, saves dealer B's anyway.
  await db.insert(swipeDecisions).values({ consumerProfileId, inventoryId: rvAId, decision: "love" });
  await db.insert(swipeDecisions).values({ consumerProfileId, inventoryId: rvBId, decision: "pass" });
  await db.insert(savedInventory).values({ consumerProfileId, inventoryId: rvBId });

  // A strong, high-confidence preference for Jayco (dealer B's brand) -
  // exactly the kind of cross-dealer competitive signal that must never
  // reach dealer A.
  await db.insert(consumerPreferences).values({
    consumerProfileId,
    attribute: "make",
    value: "Jayco",
    score: "9",
    observations: 10,
  });
  // A generic taste signal (not brand/dealer-identifying) - fine to show either dealer.
  await db.insert(consumerPreferences).values({
    consumerProfileId,
    attribute: "bunkhouse",
    value: "yes",
    score: "9",
    observations: 10,
  });
});

afterAll(async () => {
  await db.delete(consumerProfiles).where(eq(consumerProfiles.id, consumerProfileId));
  await db.delete(anonymousSessions).where(eq(anonymousSessions.id, anonymousSessionId));
  await db.delete(dealerships).where(eq(dealerships.id, dealershipAId));
  await db.delete(dealerships).where(eq(dealerships.id, dealershipBId));
});

describe("getDealerScopedBehaviorSnapshot", () => {
  it("only counts swipe/save activity on that dealer's own inventory", async () => {
    const snapshotForA = await getDealerScopedBehaviorSnapshot(consumerProfileId, dealershipAId);
    expect(snapshotForA.loves).toBe(1); // rvA
    expect(snapshotForA.passes).toBe(0); // rvB's pass doesn't count for dealer A
    expect(snapshotForA.saves).toBe(0); // rvB's save doesn't count for dealer A
    expect(snapshotForA.rvsViewed).toBe(1);

    const snapshotForB = await getDealerScopedBehaviorSnapshot(consumerProfileId, dealershipBId);
    expect(snapshotForB.loves).toBe(0);
    expect(snapshotForB.passes).toBe(1); // rvB
    expect(snapshotForB.saves).toBe(1); // rvB
    expect(snapshotForB.rvsViewed).toBe(1);
  });

  it("never surfaces make/dealer preference highlights - only the platform-wide view does", async () => {
    const dealerScoped = await getDealerScopedBehaviorSnapshot(consumerProfileId, dealershipAId);
    expect(dealerScoped.topPreferences.some((p) => p.attribute === "make")).toBe(false);
    expect(dealerScoped.topPreferences.some((p) => p.attribute === "dealer")).toBe(false);
    expect(dealerScoped.topPreferences.some((p) => p.attribute === "bunkhouse")).toBe(true);

    const platformWide = await getBehaviorSnapshot(consumerProfileId);
    expect(platformWide.topPreferences.some((p) => p.attribute === "make" && p.value === "Jayco")).toBe(true);
  });
});
