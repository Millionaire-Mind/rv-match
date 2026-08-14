import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { and, eq, sql } from "drizzle-orm";

import { db } from "@/server/db/client";
import {
  anonymousSessions,
  attributedSales,
  behavioralEvents,
  consumerProfiles,
  dealerships,
  dealershipUsers,
  distributionCampaigns,
  inventory,
  inventoryVideos,
  leads,
} from "@/server/db/schema";

/**
 * Gap 4G (targeted gap-closure pass): proves the full acquisition
 * flywheel end to end, asserting real database state at every hop rather
 * than just page text - dealer campaign/QR -> /go/[code] -> first-touch
 * stored -> a real behavioral decision -> a lead that freezes that
 * attribution -> a sale that freezes the lead's attribution -> the
 * dealer's own campaign analytics correctly counting the scan/lead/sale.
 * Every step below calls the actual production function (the real /go/
 * [code] route handler, submitSwipeDecision, submitLead, markLeadSold,
 * getDealerCampaigns) - nothing is asserted directly against hand-crafted
 * rows.
 */

let currentAnonToken: string | undefined;
let currentAuthToken: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      if (name === "rvm_session" && currentAnonToken) return { value: currentAnonToken };
      if (name === "rvm_auth" && currentAuthToken) return { value: currentAuthToken };
      return undefined;
    },
    set: () => {},
    delete: () => {},
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { GET } = await import("@/app/go/[code]/route");
const { submitSwipeDecision } = await import("@/server/discovery/actions");
const { submitLead } = await import("@/server/leads/actions");
const { markLeadSold } = await import("@/server/dealer/lead-actions");
const { getDealerCampaigns } = await import("@/server/dealer/campaign-actions");
const { localSignUp } = await import("@/server/auth/local-provider");
const { signSessionToken } = await import("@/server/auth/session-cookie");

let dealershipId: string;
let dealerUserId: string;
let inventoryId: string;
let campaignId: string;
let campaignCode: string;
let anonymousSessionId: string;
let leadId: string;

function leadForm(): FormData {
  const fd = new FormData();
  fd.set("inventoryId", inventoryId);
  fd.set("ctaType", "check_availability");
  fd.set("name", "Flywheel Test Shopper");
  fd.set("email", `flywheel-shopper-${Date.now()}@example.com`);
  fd.set("preferredContact", "email");
  fd.set("consent", "on");
  return fd;
}

function soldForm(): FormData {
  const fd = new FormData();
  fd.set("soldInventoryId", inventoryId);
  fd.set("saleDate", new Date().toISOString().slice(0, 10));
  return fd;
}

beforeAll(async () => {
  const suffix = Date.now();
  const [dealership] = await db
    .insert(dealerships)
    .values({
      name: "__test_flywheel__",
      slug: `__test-flywheel-${suffix}`,
      primaryContactName: "Owner",
      primaryContactEmail: `flywheel-${suffix}@example.com`,
      status: "approved",
    })
    .returning({ id: dealerships.id });
  dealershipId = dealership.id;

  const dealerUser = await localSignUp({ email: `flywheel-dealer-${suffix}@example.com`, password: "TestPassword123!" });
  dealerUserId = dealerUser.userId;
  await db.insert(dealershipUsers).values({ dealershipId, userId: dealerUserId, role: "owner" });

  const [rv] = await db
    .insert(inventory)
    .values({
      dealershipId,
      stockNumber: `FLYWHEEL-${suffix}`,
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
  inventoryId = rv.id;
  const [video] = await db
    .insert(inventoryVideos)
    .values({ inventoryId, url: "/media/videos/flywheel.mp4", source: "dealer_upload" })
    .returning({ id: inventoryVideos.id });
  await db.update(inventory).set({ primaryVideoId: video.id }).where(eq(inventory.id, inventoryId));

  const [campaign] = await db
    .insert(distributionCampaigns)
    .values({
      dealershipId,
      inventoryId,
      code: `flywheel-${suffix}`,
      name: "Flywheel Test QR",
      campaignType: "dealer_inventory",
    })
    .returning();
  campaignId = campaign.id;
  campaignCode = campaign.code;
});

afterAll(async () => {
  if (anonymousSessionId) {
    // A consumer_profiles row can't have both user_id and
    // anonymous_session_id null (consumer_profiles_identity_chk) - it must
    // go before the anonymous_sessions row it points to, not rely on the
    // FK's ON DELETE SET NULL to clean it up.
    await db.delete(consumerProfiles).where(eq(consumerProfiles.anonymousSessionId, anonymousSessionId));
    await db.delete(anonymousSessions).where(eq(anonymousSessions.id, anonymousSessionId));
  }
  await db.delete(distributionCampaigns).where(eq(distributionCampaigns.id, campaignId));
  await db.delete(dealerships).where(eq(dealerships.id, dealershipId));
});

describe("acquisition flywheel: QR scan -> first-touch -> lead -> sale -> analytics", () => {
  it("step 1: scanning the QR (/go/[code]) records first-touch attribution and a scan event", async () => {
    anonymousSessionId = crypto.randomUUID();
    currentAnonToken = anonymousSessionId;

    const res = await GET(new NextRequest(`http://localhost:3000/go/${campaignCode}`), {
      params: Promise.resolve({ code: campaignCode }),
    });
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(`http://localhost:3000/w/${campaignCode}`);

    const [session] = await db.select().from(anonymousSessions).where(eq(anonymousSessions.id, anonymousSessionId));
    expect(session.firstSource).toBe("qr");
    expect(session.firstCampaignId).toBe(campaignId);

    const [scanEvent] = await db
      .select()
      .from(behavioralEvents)
      .where(
        and(
          eq(behavioralEvents.eventType, "campaign_scan"),
          sql`${behavioralEvents.metadata}->>'campaignId' = ${campaignId}`,
        ),
      );
    expect(scanEvent).toBeDefined();
    expect(scanEvent.inventoryId).toBe(inventoryId);
  });

  it("step 2: reacting to the RV (Find My RV / would-you-buy) records real behavioral history", async () => {
    const { decisionsCount } = await submitSwipeDecision({
      inventoryId,
      decision: "love",
      swipeDurationMs: 4000,
    });
    expect(decisionsCount).toBeGreaterThanOrEqual(1);
  });

  it("step 3: submitting a lead freezes the session's first-touch attribution onto the lead", async () => {
    const result = await submitLead({ ok: true }, leadForm());
    expect(result.ok).toBe(true);

    const [lead] = await db.select().from(leads).where(eq(leads.dealershipId, dealershipId)).limit(1);
    expect(lead).toBeDefined();
    expect(lead.firstSource).toBe("qr");
    expect(lead.firstCampaignId).toBe(campaignId);
    leadId = lead.id;
  });

  it("step 4: marking the lead sold freezes the lead's attribution onto the sale", async () => {
    currentAuthToken = signSessionToken(dealerUserId);

    const result = await markLeadSold(dealershipId, leadId, { ok: true }, soldForm());
    expect(result.ok).toBe(true);

    const [sale] = await db.select().from(attributedSales).where(eq(attributedSales.leadId, leadId)).limit(1);
    expect(sale).toBeDefined();
    expect(sale.firstSource).toBe("qr");
    expect(sale.firstCampaignId).toBe(campaignId);

    // Verification itself is proven elsewhere (sale-attribution.test.ts) -
    // here only the attribution freeze matters, so mark it verified
    // directly to make it eligible for the dealer analytics count below.
    await db.update(attributedSales).set({ verificationStatus: "verified" }).where(eq(attributedSales.id, sale.id));
  });

  it("step 5: the dealer's own campaign analytics correctly count the real scan, lead, and verified sale", async () => {
    const campaigns = await getDealerCampaigns(dealershipId);
    const stats = campaigns.find((c) => c.id === campaignId);
    expect(stats).toBeDefined();
    expect(stats!.scans).toBeGreaterThanOrEqual(1);
    expect(stats!.leadsCount).toBe(1);
    expect(stats!.verifiedSales).toBe(1);
  });
});
