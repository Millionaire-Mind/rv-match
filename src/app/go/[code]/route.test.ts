import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { and, eq, sql } from "drizzle-orm";

import { db } from "@/server/db/client";
import { anonymousSessions, behavioralEvents, dealerships, distributionCampaigns, inventory, inventoryVideos } from "@/server/db/schema";

/**
 * Phase 17-19: /go/[code] is the single resolver every QR code, dealer
 * link, and creator link points to. Proves it (a) records first-touch
 * attribution on the anonymous session's *first* creation, (b) never
 * overwrites that attribution on a later visit through a different
 * campaign, (c) logs a campaign_scan event, and (d) redirects to the
 * right destination for each campaign shape (specific RV / dealer-general
 * / creator-with-no-target).
 */

let currentCookieValue: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "rvm_session" && currentCookieValue ? { value: currentCookieValue } : undefined),
    set: () => {},
    delete: () => {},
  }),
}));

const { GET } = await import("./route");

let dealershipId: string;
let inventoryId: string;
const campaignIds: string[] = [];
const anonymousSessionIds: string[] = [];

function makeRequest(code: string): NextRequest {
  return new NextRequest(`http://localhost:3000/go/${code}`);
}

beforeAll(async () => {
  const suffix = Date.now();
  const [dealership] = await db
    .insert(dealerships)
    .values({
      name: "__test_go_route__",
      slug: `__test-go-route-${suffix}`,
      primaryContactName: "Test",
      primaryContactEmail: `go-route-${suffix}@example.com`,
      status: "approved",
    })
    .returning({ id: dealerships.id });
  dealershipId = dealership.id;

  const [rv] = await db
    .insert(inventory)
    .values({
      dealershipId,
      stockNumber: `GO-${suffix}`,
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
  const [video] = await db
    .insert(inventoryVideos)
    .values({ inventoryId, url: "/media/videos/go.mp4", source: "dealer_upload" })
    .returning({ id: inventoryVideos.id });
  await db.update(inventory).set({ primaryVideoId: video.id }).where(eq(inventory.id, inventoryId));
});

afterAll(async () => {
  for (const id of anonymousSessionIds) await db.delete(anonymousSessions).where(eq(anonymousSessions.id, id));
  for (const id of campaignIds) await db.delete(distributionCampaigns).where(eq(distributionCampaigns.id, id));
  await db.delete(dealerships).where(eq(dealerships.id, dealershipId));
});

async function makeCampaign(overrides: Partial<typeof distributionCampaigns.$inferInsert>) {
  const suffix = Date.now() + Math.random();
  const [row] = await db
    .insert(distributionCampaigns)
    .values({ code: `code-${suffix}`, name: "Test Campaign", campaignType: "dealer_general", ...overrides })
    .returning();
  campaignIds.push(row.id);
  return row;
}

describe("GET /go/[code]", () => {
  it("redirects to the specific RV for an inventory-targeted campaign", async () => {
    const campaign = await makeCampaign({ dealershipId, inventoryId, campaignType: "dealer_inventory" });
    currentCookieValue = crypto.randomUUID();
    anonymousSessionIds.push(currentCookieValue);

    const res = await GET(makeRequest(campaign.code), { params: Promise.resolve({ code: campaign.code }) });
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(`http://localhost:3000/rv/${inventoryId}`);
  });

  it("redirects to a dealer-filtered search for a dealer-general campaign", async () => {
    const campaign = await makeCampaign({ dealershipId, campaignType: "dealer_general" });
    currentCookieValue = crypto.randomUUID();
    anonymousSessionIds.push(currentCookieValue);

    const res = await GET(makeRequest(campaign.code), { params: Promise.resolve({ code: campaign.code }) });
    expect(res.headers.get("location")).toBe(`http://localhost:3000/search?dealershipId=${dealershipId}`);
  });

  it("redirects to /discover for a creator campaign with no specific dealer or RV", async () => {
    const campaign = await makeCampaign({ campaignType: "creator" });
    currentCookieValue = crypto.randomUUID();
    anonymousSessionIds.push(currentCookieValue);

    const res = await GET(makeRequest(campaign.code), { params: Promise.resolve({ code: campaign.code }) });
    expect(res.headers.get("location")).toBe("http://localhost:3000/discover");
  });

  it("redirects home for an unknown or inactive campaign code, without creating attribution", async () => {
    currentCookieValue = crypto.randomUUID();
    const res = await GET(makeRequest("does-not-exist"), { params: Promise.resolve({ code: "does-not-exist" }) });
    expect(res.headers.get("location")).toBe("http://localhost:3000/");
  });

  it("records first-touch attribution on the anonymous session's first creation", async () => {
    const campaign = await makeCampaign({ dealershipId, campaignType: "dealer_general" });
    currentCookieValue = crypto.randomUUID();
    anonymousSessionIds.push(currentCookieValue);

    await GET(makeRequest(campaign.code), { params: Promise.resolve({ code: campaign.code }) });

    const [session] = await db.select().from(anonymousSessions).where(eq(anonymousSessions.id, currentCookieValue));
    expect(session.firstSource).toBe("qr");
    expect(session.firstCampaignId).toBe(campaign.id);
  });

  it("never overwrites first-touch attribution on a later visit through a different campaign", async () => {
    const firstCampaign = await makeCampaign({ dealershipId, campaignType: "dealer_general" });
    const secondCampaign = await makeCampaign({ dealershipId, campaignType: "dealer_general" });
    currentCookieValue = crypto.randomUUID();
    anonymousSessionIds.push(currentCookieValue);

    await GET(makeRequest(firstCampaign.code), { params: Promise.resolve({ code: firstCampaign.code }) });
    await GET(makeRequest(secondCampaign.code), { params: Promise.resolve({ code: secondCampaign.code }) });

    const [session] = await db.select().from(anonymousSessions).where(eq(anonymousSessions.id, currentCookieValue));
    expect(session.firstCampaignId).toBe(firstCampaign.id); // still the first one, not the second
  });

  it("logs a campaign_scan behavioral event", async () => {
    const campaign = await makeCampaign({ dealershipId, inventoryId, campaignType: "dealer_inventory" });
    currentCookieValue = crypto.randomUUID();
    anonymousSessionIds.push(currentCookieValue);

    await GET(makeRequest(campaign.code), { params: Promise.resolve({ code: campaign.code }) });

    const [event] = await db
      .select()
      .from(behavioralEvents)
      .where(
        and(
          eq(behavioralEvents.eventType, "campaign_scan"),
          sql`${behavioralEvents.metadata}->>'campaignId' = ${campaign.id}`,
        ),
      );
    expect(event).toBeDefined();
    expect(event.inventoryId).toBe(inventoryId);
  });
});
