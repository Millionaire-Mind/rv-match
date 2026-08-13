import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { dealershipUsers, dealerships, inventoryFeedSources } from "@/server/db/schema";

/**
 * IDOR test for the Phase 14 feed-source guard, following the same
 * pattern already proven for inventory/video ownership (see
 * inventory-actions.test.ts): Dealer A is a legitimate member of
 * Dealership A, but must still be rejected when the feed source id they
 * supply belongs to Dealership B.
 */

let currentToken: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "rvm_auth" && currentToken ? { value: currentToken } : undefined),
    set: () => {},
    delete: () => {},
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { localSignUp } = await import("@/server/auth/local-provider");
const { signSessionToken } = await import("@/server/auth/session-cookie");
const { ForbiddenError } = await import("@/server/auth/guards");
const { updateFeedSource, setFeedSourceActive, deleteFeedSource, runFeedSourceNow } = await import("./feed-actions");

let dealershipAId: string;
let dealershipBId: string;
let userAId: string;
let feedBId: string;

function asUser(userId: string) {
  currentToken = signSessionToken(userId);
}

beforeAll(async () => {
  const suffix = Date.now();
  const [dealershipA] = await db
    .insert(dealerships)
    .values({
      name: "__test_feed_dealer_A__",
      slug: `__test-feed-dealer-a-${suffix}`,
      primaryContactName: "A Owner",
      primaryContactEmail: `feed-a-${suffix}@example.com`,
      status: "approved",
    })
    .returning({ id: dealerships.id });
  dealershipAId = dealershipA.id;

  const [dealershipB] = await db
    .insert(dealerships)
    .values({
      name: "__test_feed_dealer_B__",
      slug: `__test-feed-dealer-b-${suffix}`,
      primaryContactName: "B Owner",
      primaryContactEmail: `feed-b-${suffix}@example.com`,
      status: "approved",
    })
    .returning({ id: dealerships.id });
  dealershipBId = dealershipB.id;

  const userA = await localSignUp({ email: `feed-idor-a-${suffix}@example.com`, password: "TestPassword123!" });
  userAId = userA.userId;
  const userB = await localSignUp({ email: `feed-idor-b-${suffix}@example.com`, password: "TestPassword123!" });

  await db.insert(dealershipUsers).values([
    { dealershipId: dealershipAId, userId: userAId, role: "owner" },
    { dealershipId: dealershipBId, userId: userB.userId, role: "owner" },
  ]);

  const [feedB] = await db
    .insert(inventoryFeedSources)
    .values({ dealershipId: dealershipBId, name: "B's Feed", format: "csv", url: "https://example.com/b.csv" })
    .returning({ id: inventoryFeedSources.id });
  feedBId = feedB.id;
});

afterAll(async () => {
  await db.delete(dealerships).where(eq(dealerships.id, dealershipAId));
  await db.delete(dealerships).where(eq(dealerships.id, dealershipBId));
});

describe("feed source ownership guard (IDOR)", () => {
  it("blocks Dealer A from updating Dealer B's feed source", async () => {
    asUser(userAId);
    const fd = new FormData();
    fd.set("name", "Hijacked");
    fd.set("format", "csv");
    fd.set("url", "https://evil.example.com/feed.csv");
    await expect(updateFeedSource(dealershipAId, feedBId, { ok: false, error: "" }, fd)).rejects.toThrow(ForbiddenError);

    const [row] = await db.select({ name: inventoryFeedSources.name }).from(inventoryFeedSources).where(eq(inventoryFeedSources.id, feedBId));
    expect(row.name).toBe("B's Feed");
  });

  it("blocks Dealer A from pausing/resuming Dealer B's feed source", async () => {
    asUser(userAId);
    await expect(setFeedSourceActive(dealershipAId, feedBId, false)).rejects.toThrow(ForbiddenError);

    const [row] = await db.select({ active: inventoryFeedSources.active }).from(inventoryFeedSources).where(eq(inventoryFeedSources.id, feedBId));
    expect(row.active).toBe(true);
  });

  it("blocks Dealer A from triggering a run of Dealer B's feed source", async () => {
    asUser(userAId);
    await expect(runFeedSourceNow(dealershipAId, feedBId)).rejects.toThrow(ForbiddenError);
  });

  it("blocks Dealer A from deleting Dealer B's feed source", async () => {
    asUser(userAId);
    await expect(deleteFeedSource(dealershipAId, feedBId)).rejects.toThrow(ForbiddenError);

    const [row] = await db.select({ id: inventoryFeedSources.id }).from(inventoryFeedSources).where(eq(inventoryFeedSources.id, feedBId));
    expect(row).toBeDefined();
  });
});
