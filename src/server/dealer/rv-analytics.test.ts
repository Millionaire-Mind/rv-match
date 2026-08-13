import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import {
  anonymousSessions,
  attributedSales,
  consumerProfiles,
  dealershipUsers,
  dealerships,
  inventory,
  inventoryVideos,
  leads,
  savedInventory,
  swipeDecisions,
} from "@/server/db/schema";
import { trackEvent } from "@/server/analytics/track";

/**
 * Phase 15: per-RV analytics must break down impressions/completion/swipe
 * distribution/saves/leads/verified sales *per unit*, not just as a
 * dealership-wide aggregate (see getDealerKpis) - this proves each metric
 * is correctly scoped to the specific inventory row it belongs to.
 */

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
const { getPerRvAnalytics } = await import("./rv-analytics");

let dealershipId: string;
let anonymousSessionId: string;
let consumerProfileId: string;
let popularRvId: string;
let quietRvId: string;

beforeAll(async () => {
  const suffix = Date.now();
  const [dealership] = await db
    .insert(dealerships)
    .values({
      name: "__test_rv_analytics__",
      slug: `__test-rv-analytics-${suffix}`,
      primaryContactName: "Test",
      primaryContactEmail: `rv-analytics-${suffix}@example.com`,
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

  const [popular] = await db
    .insert(inventory)
    .values({
      dealershipId,
      stockNumber: `ANLYT-POP-${suffix}`,
      year: 2024,
      make: "Forest River",
      model: "Rockwood",
      rvType: "travel_trailer",
      condition: "new",
      salePriceCents: 3000000,
      status: "published",
      source: "manual",
    })
    .returning({ id: inventory.id });
  popularRvId = popular.id;
  const [popularVideo] = await db
    .insert(inventoryVideos)
    .values({ inventoryId: popularRvId, url: "/media/videos/pop.mp4", source: "dealer_upload" })
    .returning({ id: inventoryVideos.id });
  await db.update(inventory).set({ primaryVideoId: popularVideo.id }).where(eq(inventory.id, popularRvId));

  const [quiet] = await db
    .insert(inventory)
    .values({
      dealershipId,
      stockNumber: `ANLYT-QUIET-${suffix}`,
      year: 2023,
      make: "Jayco",
      model: "Eagle",
      rvType: "fifth_wheel",
      condition: "used",
      salePriceCents: 5500000,
      status: "published",
      source: "manual",
    })
    .returning({ id: inventory.id });
  quietRvId = quiet.id;

  // Popular RV: 3 impressions, 2 completions, 1 love, 1 pass, 1 save, 1 lead, 1 verified sale.
  await trackEvent({ consumerProfileId, eventType: "video_started", inventoryId: popularRvId, dealershipId });
  await trackEvent({ consumerProfileId, eventType: "video_started", inventoryId: popularRvId, dealershipId });
  await trackEvent({ consumerProfileId, eventType: "video_started", inventoryId: popularRvId, dealershipId });
  await trackEvent({ consumerProfileId, eventType: "video_complete", inventoryId: popularRvId, dealershipId });
  await trackEvent({ consumerProfileId, eventType: "video_complete", inventoryId: popularRvId, dealershipId });

  await db.insert(swipeDecisions).values({ consumerProfileId, inventoryId: popularRvId, decision: "love" });
  await db.insert(savedInventory).values({ consumerProfileId, inventoryId: popularRvId });

  const [lead] = await db
    .insert(leads)
    .values({
      dealershipId,
      inventoryId: popularRvId,
      consumerProfileId,
      name: "Test Lead",
      email: "test-lead@example.com",
      ctaType: "check_availability",
    })
    .returning({ id: leads.id });

  await db.insert(attributedSales).values({
    leadId: lead.id,
    dealershipId,
    soldInventoryId: popularRvId,
    saleDate: new Date().toISOString().slice(0, 10),
    verificationStatus: "verified",
  });

  // Quiet RV: just one pass, nothing else.
  await db.insert(swipeDecisions).values({ consumerProfileId, inventoryId: quietRvId, decision: "pass" });

  const owner = await localSignUp({ email: `rv-analytics-owner-${suffix}@example.com`, password: "TestPassword123!" });
  await db.insert(dealershipUsers).values({ dealershipId, userId: owner.userId, role: "owner" });
  currentToken = signSessionToken(owner.userId);
});

afterAll(async () => {
  await db.delete(consumerProfiles).where(eq(consumerProfiles.id, consumerProfileId));
  await db.delete(anonymousSessions).where(eq(anonymousSessions.id, anonymousSessionId));
  await db.delete(dealerships).where(eq(dealerships.id, dealershipId));
});

describe("getPerRvAnalytics", () => {
  it("scopes every metric to the specific RV it belongs to, not the dealership as a whole", async () => {
    const rows = await getPerRvAnalytics(dealershipId, 0);
    const popular = rows.find((r) => r.inventoryId === popularRvId)!;
    const quiet = rows.find((r) => r.inventoryId === quietRvId)!;

    expect(popular.impressions).toBe(3);
    expect(popular.completions).toBe(2);
    expect(popular.completionRate).toBeCloseTo(2 / 3, 5);
    expect(popular.loves).toBe(1);
    expect(popular.saves).toBe(1);
    expect(popular.leadsCount).toBe(1);
    expect(popular.verifiedSales).toBe(1);

    expect(quiet.impressions).toBe(0);
    expect(quiet.completionRate).toBeNull();
    expect(quiet.passes).toBe(1);
    expect(quiet.loves).toBe(0);
    expect(quiet.leadsCount).toBe(0);
    expect(quiet.verifiedSales).toBe(0);
  });

  it("returns every RV in the dealership even with zero activity", async () => {
    const rows = await getPerRvAnalytics(dealershipId, 0);
    expect(rows.map((r) => r.inventoryId).sort()).toEqual([popularRvId, quietRvId].sort());
  });

  it("rejects a salesperson - dashboard/analytics viewing is restricted to owner/sales_manager/marketing", async () => {
    const { ForbiddenError } = await import("@/server/auth/guards");
    const sp = await localSignUp({ email: `rv-analytics-sp-${Date.now()}@example.com`, password: "TestPassword123!" });
    await db.insert(dealershipUsers).values({ dealershipId, userId: sp.userId, role: "salesperson" });
    currentToken = signSessionToken(sp.userId);

    await expect(getPerRvAnalytics(dealershipId, 0)).rejects.toThrow(ForbiddenError);
  });
});
