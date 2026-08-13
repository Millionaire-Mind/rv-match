import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { anonymousSessions, consumerProfiles, dealershipUsers, dealerships, inventory, swipeDecisions } from "@/server/db/schema";

let currentToken: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "rvm_auth" && currentToken ? { value: currentToken } : undefined),
    set: () => {},
    delete: () => {},
  }),
}));

const { localSignUp } = await import("@/server/auth/local-provider");
const { signSessionToken } = await import("@/server/auth/session-cookie");
const { getDemandIntelligence } = await import("./demand-intelligence");

/**
 * Phase 16: demand intelligence must reflect genuine *platform-wide*
 * shopper interest (not just this dealer's own traffic - a dealer with a
 * quiet feed should still see market demand from every other dealer's
 * shoppers), and must surface a real gap when a dealer has little/no
 * matching inventory for something shoppers are actively responding to.
 *
 * This runs against the shared dev database, which already has real seed
 * data (its own bunkhouse RVs and swipe activity) - so assertions compare
 * the *delta* this test's own fixtures introduce, rather than asserting
 * an absolute count that would be thrown off by whatever else is in the
 * database.
 */

let sourceDealershipId: string; // owns the RVs shoppers react to
let targetDealershipId: string; // the dealer whose gap we're measuring
const consumerProfileIds: string[] = [];
const anonymousSessionIds: string[] = [];

async function newConsumer(): Promise<string> {
  const [session] = await db.insert(anonymousSessions).values({}).returning({ id: anonymousSessions.id });
  anonymousSessionIds.push(session.id);
  const [profile] = await db
    .insert(consumerProfiles)
    .values({ anonymousSessionId: session.id })
    .returning({ id: consumerProfiles.id });
  consumerProfileIds.push(profile.id);
  return profile.id;
}

function findSignal(signals: Awaited<ReturnType<typeof getDemandIntelligence>>, attribute: string, value: string) {
  return signals.find((s) => s.attribute === attribute && s.value === value);
}

beforeAll(async () => {
  const suffix = Date.now();
  const [source] = await db
    .insert(dealerships)
    .values({
      name: "__test_demand_source__",
      slug: `__test-demand-source-${suffix}`,
      primaryContactName: "Test",
      primaryContactEmail: `demand-source-${suffix}@example.com`,
      status: "approved",
    })
    .returning({ id: dealerships.id });
  sourceDealershipId = source.id;

  const [target] = await db
    .insert(dealerships)
    .values({
      name: "__test_demand_target__",
      slug: `__test-demand-target-${suffix}`,
      primaryContactName: "Test",
      primaryContactEmail: `demand-target-${suffix}@example.com`,
      status: "approved",
    })
    .returning({ id: dealerships.id });
  targetDealershipId = target.id;

  const owner = await localSignUp({ email: `demand-owner-${suffix}@example.com`, password: "TestPassword123!" });
  await db.insert(dealershipUsers).values({ dealershipId: targetDealershipId, userId: owner.userId, role: "owner" });
  currentToken = signSessionToken(owner.userId);
});

afterAll(async () => {
  for (const id of consumerProfileIds) await db.delete(consumerProfiles).where(eq(consumerProfiles.id, id));
  for (const id of anonymousSessionIds) await db.delete(anonymousSessions).where(eq(anonymousSessions.id, id));
  await db.delete(dealerships).where(eq(dealerships.id, sourceDealershipId));
  await db.delete(dealerships).where(eq(dealerships.id, targetDealershipId));
});

describe("getDemandIntelligence", () => {
  it("surfaces platform-wide demand (from other dealers' shoppers) as a gap for a dealer with none of that inventory", async () => {
    const before = await getDemandIntelligence(targetDealershipId, 30, 500);
    const baselineDemand = findSignal(before, "bunkhouse", "yes")?.marketDemandCount ?? 0;
    const baselineDealerCount = findSignal(before, "bunkhouse", "yes")?.dealerInventoryCount ?? 0;
    expect(baselineDealerCount).toBe(0); // the target dealer has no inventory at all yet

    const suffix = Date.now();
    const [bunkhouseRv] = await db
      .insert(inventory)
      .values({
        dealershipId: sourceDealershipId,
        stockNumber: `DEMAND-BUNK-${suffix}`,
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
      .returning({ id: inventory.id });

    for (let i = 0; i < 4; i++) {
      const profileId = await newConsumer();
      await db
        .insert(swipeDecisions)
        .values({ consumerProfileId: profileId, inventoryId: bunkhouseRv.id, decision: i % 2 === 0 ? "love" : "more_like_this" });
    }

    const after = await getDemandIntelligence(targetDealershipId, 30, 500);
    const bunkhouseSignal = findSignal(after, "bunkhouse", "yes")!;

    expect(bunkhouseSignal).toBeDefined();
    expect(bunkhouseSignal.marketDemandCount).toBe(baselineDemand + 4);
    expect(bunkhouseSignal.dealerInventoryCount).toBe(0);
    expect(bunkhouseSignal.gapScore).toBeGreaterThan(0);
  });

  it("scores a dealer who already stocks the in-demand attribute with a lower gap than one who doesn't", async () => {
    const before = await getDemandIntelligence(targetDealershipId, 30, 500);
    const beforeSignal = findSignal(before, "bunkhouse", "yes");
    const marketDemandCount = beforeSignal?.marketDemandCount ?? 0;
    const gapBefore = beforeSignal?.gapScore ?? 0;

    const suffix = Date.now();
    const [stockedRv] = await db
      .insert(inventory)
      .values({
        dealershipId: targetDealershipId,
        stockNumber: `DEMAND-STOCKED-${suffix}`,
        year: 2024,
        make: "Keystone",
        model: "Montana",
        rvType: "travel_trailer",
        condition: "new",
        salePriceCents: 3200000,
        bunkhouse: true,
        status: "published",
        source: "manual",
      })
      .returning({ id: inventory.id });

    const after = await getDemandIntelligence(targetDealershipId, 30, 500);
    const afterSignal = findSignal(after, "bunkhouse", "yes")!;
    expect(afterSignal.marketDemandCount).toBe(marketDemandCount); // stocking inventory doesn't change market demand
    expect(afterSignal.dealerInventoryCount).toBeGreaterThanOrEqual(1);
    expect(afterSignal.gapScore).toBeLessThan(gapBefore || Infinity);

    await db.delete(inventory).where(eq(inventory.id, stockedRv.id));
  });

  it("filters out noise below the minimum market-demand threshold", async () => {
    const suffix = Date.now();
    const [rareRv] = await db
      .insert(inventory)
      .values({
        dealershipId: sourceDealershipId,
        stockNumber: `DEMAND-RARE-${suffix}`,
        year: 2024,
        make: "SuperRareManufacturer",
        model: "OneOff",
        rvType: "park_model",
        condition: "new",
        salePriceCents: 9999900,
        status: "published",
        source: "manual",
      })
      .returning({ id: inventory.id });
    const profileId = await newConsumer();
    await db.insert(swipeDecisions).values({ consumerProfileId: profileId, inventoryId: rareRv.id, decision: "love" });

    const signals = await getDemandIntelligence(targetDealershipId, 30, 500);
    const rareMakeSignal = findSignal(signals, "make", "SuperRareManufacturer");
    expect(rareMakeSignal).toBeUndefined(); // only 1 swipe, below MIN_MARKET_DEMAND
  });

  it("never returns per-consumer identity, only aggregate counts", async () => {
    const signals = await getDemandIntelligence(targetDealershipId, 30, 20);
    for (const signal of signals) {
      expect(Object.keys(signal).sort()).toEqual(
        ["attribute", "dealerInventoryCount", "gapScore", "label", "marketDemandCount", "value"].sort(),
      );
    }
  });

  it("rejects a salesperson - dashboard/analytics viewing is restricted to owner/sales_manager/marketing", async () => {
    const { ForbiddenError } = await import("@/server/auth/guards");
    const sp = await localSignUp({ email: `demand-sp-${Date.now()}@example.com`, password: "TestPassword123!" });
    await db.insert(dealershipUsers).values({ dealershipId: targetDealershipId, userId: sp.userId, role: "salesperson" });
    currentToken = signSessionToken(sp.userId);

    await expect(getDemandIntelligence(targetDealershipId, 30, 20)).rejects.toThrow(ForbiddenError);
  });
});
