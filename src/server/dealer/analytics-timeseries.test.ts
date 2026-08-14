import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import {
  attributedSales,
  dealershipUsers,
  dealerships,
  distributionCampaigns,
  inventory,
  leads,
} from "@/server/db/schema";
import { trackEvent } from "@/server/analytics/track";

/**
 * Gap 5 (targeted gap-closure pass): the Analytics page's trend charts and
 * campaign-contribution chart need real, correctly-bucketed/grouped SQL
 * aggregations, not hardcoded or client-side-fabricated numbers.
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
const { getDealerTimeSeries, getCampaignContribution } = await import("./analytics-timeseries");

let dealershipId: string;
let inventoryId: string;
let campaignAId: string;
let campaignBId: string;

beforeAll(async () => {
  const suffix = Date.now();
  const [dealership] = await db
    .insert(dealerships)
    .values({
      name: "__test_analytics_timeseries__",
      slug: `__test-analytics-timeseries-${suffix}`,
      primaryContactName: "Test",
      primaryContactEmail: `analytics-timeseries-${suffix}@example.com`,
      status: "approved",
    })
    .returning({ id: dealerships.id });
  dealershipId = dealership.id;

  const [rv] = await db
    .insert(inventory)
    .values({
      dealershipId,
      stockNumber: `TS-${suffix}`,
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
  inventoryId = rv.id;

  // Today's activity: 2 impressions, 1 like (engagement), 1 lead, 1 verified sale.
  await trackEvent({ consumerProfileId: null, eventType: "video_started", inventoryId, dealershipId });
  await trackEvent({ consumerProfileId: null, eventType: "video_started", inventoryId, dealershipId });
  await trackEvent({ consumerProfileId: null, eventType: "like", inventoryId, dealershipId });

  const [campaignA] = await db
    .insert(distributionCampaigns)
    .values({ dealershipId, code: `ts-a-${suffix}`, name: "Campaign A", campaignType: "dealer_general" })
    .returning({ id: distributionCampaigns.id });
  campaignAId = campaignA.id;
  const [campaignB] = await db
    .insert(distributionCampaigns)
    .values({ dealershipId, code: `ts-b-${suffix}`, name: "Campaign B (unused)", campaignType: "dealer_general" })
    .returning({ id: distributionCampaigns.id });
  campaignBId = campaignB.id;

  const [lead] = await db
    .insert(leads)
    .values({
      dealershipId,
      inventoryId,
      name: "Timeseries Test Lead",
      email: "ts-lead@example.com",
      ctaType: "check_availability",
      firstCampaignId: campaignAId,
    })
    .returning({ id: leads.id });

  await db.insert(attributedSales).values({
    leadId: lead.id,
    dealershipId,
    soldInventoryId: inventoryId,
    saleDate: new Date().toISOString().slice(0, 10),
    verificationStatus: "verified",
    firstCampaignId: campaignAId,
  });

  const owner = await localSignUp({ email: `ts-owner-${suffix}@example.com`, password: "TestPassword123!" });
  await db.insert(dealershipUsers).values({ dealershipId, userId: owner.userId, role: "owner" });
  currentToken = signSessionToken(owner.userId);
});

afterAll(async () => {
  await db.delete(dealerships).where(eq(dealerships.id, dealershipId));
});

describe("getDealerTimeSeries", () => {
  it("buckets today's real activity into today's point, and pads every other day with zeros", async () => {
    const points = await getDealerTimeSeries(dealershipId, 7);
    expect(points).toHaveLength(7);

    const todayKey = new Date().toISOString().slice(0, 10);
    const today = points.find((p) => p.date === todayKey)!;
    expect(today.impressions).toBe(2);
    expect(today.engagement).toBe(1);
    expect(today.leads).toBe(1);
    expect(today.sales).toBe(1);

    // Every point must be a real, well-formed day - no undefined gaps.
    for (const p of points) {
      expect(p.impressions).toBeGreaterThanOrEqual(0);
      expect(p.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe("getCampaignContribution", () => {
  it("counts leads/sales per campaign and excludes campaigns with zero leads", async () => {
    const rows = await getCampaignContribution(dealershipId, 0);
    const campaignA = rows.find((r) => r.campaignId === campaignAId);
    expect(campaignA).toBeDefined();
    expect(campaignA!.leadsCount).toBe(1);
    expect(campaignA!.verifiedSales).toBe(1);

    // Campaign B has no leads at all - must not clutter the chart.
    expect(rows.find((r) => r.campaignId === campaignBId)).toBeUndefined();
  });
});
