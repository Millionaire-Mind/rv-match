import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import {
  anonymousSessions,
  attributedSales,
  behavioralEvents,
  consumerProfiles,
  dealerships,
  distributionCampaigns,
  inventory,
  leads,
} from "@/server/db/schema";
import { getAcquisitionFunnelBySource } from "@/server/admin/funnel";

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
    set: () => {},
    delete: () => {},
  }),
}));

const { localSignUp } = await import("@/server/auth/local-provider");

/**
 * Proves the funnel is genuinely segmented by first-touch source (not just
 * a re-labeled aggregate): a shopper's stage counts (decisions, account,
 * lead, verified sale) must show up under her own source and never under
 * an unrelated source. Uses made-up per-test source strings rather than
 * real "qr"/"direct" values so this can't collide with, or be made flaky
 * by, unrelated fixtures other test files concurrently write into those
 * same real buckets.
 */

let dealershipId: string;
let campaignId: string;
let inventoryId: string;
const anonymousSessionIds: string[] = [];
const consumerProfileIds: string[] = [];
const leadIds: string[] = [];
const saleIds: string[] = [];

const suffix = Date.now();
const sourceA = `funnel-test-a-${suffix}`;
const sourceB = `funnel-test-b-${suffix}`;

async function makeSession(firstSource: string, decisionsCount: number, signedUp: boolean) {
  const [session] = await db
    .insert(anonymousSessions)
    .values({ firstSource, firstCampaignId: firstSource === sourceA ? campaignId : undefined })
    .returning({ id: anonymousSessions.id });
  anonymousSessionIds.push(session.id);

  let userId: string | undefined;
  if (signedUp) {
    const user = await localSignUp({ email: `${firstSource}-${crypto.randomUUID()}@example.com`, password: "TestPassword123!" });
    userId = user.userId;
  }

  const [profile] = await db
    .insert(consumerProfiles)
    .values({ anonymousSessionId: session.id, decisionsCount, userId })
    .returning({ id: consumerProfiles.id });
  consumerProfileIds.push(profile.id);
  return { sessionId: session.id, profileId: profile.id };
}

beforeAll(async () => {
  const [dealership] = await db
    .insert(dealerships)
    .values({
      name: "__test_funnel__",
      slug: `__test-funnel-${suffix}`,
      primaryContactName: "Test",
      primaryContactEmail: `funnel-${suffix}@example.com`,
      status: "approved",
    })
    .returning({ id: dealerships.id });
  dealershipId = dealership.id;

  const [campaign] = await db
    .insert(distributionCampaigns)
    .values({ dealershipId, code: `funnel-${suffix}`, name: "Funnel Test Campaign", campaignType: "dealer_general" })
    .returning({ id: distributionCampaigns.id });
  campaignId = campaign.id;

  const [rv] = await db
    .insert(inventory)
    .values({
      dealershipId,
      stockNumber: `FUNNEL-${suffix}`,
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

  // Source A: 12 decisions (activated), signed up, discovered + completed a
  // match, sent a partner invite, is a returning visitor, submits an
  // appointment-request lead, and has one verified + one still-just-
  // dealer-reported sale.
  const shopperA = await makeSession(sourceA, 12, true);
  await db.insert(behavioralEvents).values([
    { consumerProfileId: shopperA.profileId, eventType: "discovery_started" },
    { consumerProfileId: shopperA.profileId, eventType: "match_completed" },
    { consumerProfileId: shopperA.profileId, eventType: "partner_invite_created" },
  ]);
  await db
    .update(anonymousSessions)
    .set({ lastSeenAt: new Date(Date.now() + 2 * 60 * 60 * 1000) }) // 2h after createdAt - a genuine return visit
    .where(eq(anonymousSessions.id, shopperA.sessionId));
  const [leadA] = await db
    .insert(leads)
    .values({
      dealershipId,
      inventoryId,
      consumerProfileId: shopperA.profileId,
      name: `Lead ${sourceA}`,
      email: "lead-a@example.com",
      ctaType: "schedule_walkthrough",
      firstSource: sourceA,
      firstCampaignId: campaignId,
    })
    .returning({ id: leads.id });
  leadIds.push(leadA.id);
  const [saleA] = await db
    .insert(attributedSales)
    .values({
      leadId: leadA.id,
      dealershipId,
      soldInventoryId: inventoryId,
      saleDate: new Date().toISOString().slice(0, 10),
      verificationStatus: "verified",
      firstSource: sourceA,
      firstCampaignId: campaignId,
    })
    .returning({ id: attributedSales.id });
  saleIds.push(saleA.id);
  // A second lead/sale under the same source, still just dealer-reported
  // (not yet admin-verified) - attributed_sales.lead_id is unique, so this
  // needs its own lead. Proves reportedSales counts every sale regardless
  // of status while verifiedSales stays scoped to the verified subset.
  const [leadA2] = await db
    .insert(leads)
    .values({
      dealershipId,
      inventoryId,
      consumerProfileId: shopperA.profileId,
      name: `Lead ${sourceA} 2`,
      email: "lead-a2@example.com",
      ctaType: "check_availability",
      firstSource: sourceA,
      firstCampaignId: campaignId,
    })
    .returning({ id: leads.id });
  leadIds.push(leadA2.id);
  const [saleAReportedOnly] = await db
    .insert(attributedSales)
    .values({
      leadId: leadA2.id,
      dealershipId,
      soldInventoryId: inventoryId,
      saleDate: new Date().toISOString().slice(0, 10),
      verificationStatus: "dealer_reported", // not yet admin-verified
      firstSource: sourceA,
      firstCampaignId: campaignId,
    })
    .returning({ id: attributedSales.id });
  saleIds.push(saleAReportedOnly.id);

  // Source B: only 1 decision, not signed up, nothing else - must stay isolated from A's numbers.
  await makeSession(sourceB, 1, false);
});

afterAll(async () => {
  for (const id of saleIds) await db.delete(attributedSales).where(eq(attributedSales.id, id));
  for (const id of leadIds) await db.delete(leads).where(eq(leads.id, id));
  for (const id of consumerProfileIds) await db.delete(consumerProfiles).where(eq(consumerProfiles.id, id));
  for (const id of anonymousSessionIds) await db.delete(anonymousSessions).where(eq(anonymousSessions.id, id));
  await db.delete(distributionCampaigns).where(eq(distributionCampaigns.id, campaignId));
  await db.delete(dealerships).where(eq(dealerships.id, dealershipId));
});

describe("getAcquisitionFunnelBySource", () => {
  it("segments every stage by first-touch source instead of aggregating", async () => {
    const segments = await getAcquisitionFunnelBySource();
    const a = segments.find((s) => s.source === sourceA);
    const b = segments.find((s) => s.source === sourceB);
    expect(a).toBeDefined();
    expect(b).toBeDefined();

    expect(a).toMatchObject({
      sessionsStarted: 1,
      discoveryStarters: 1,
      threeDecisionUsers: 1,
      activatedShoppers: 1,
      matchCompleters: 1,
      accountsCreated: 1,
      returningShoppers: 1,
      partnerInvites: 1,
      leadsCount: 2,
      appointmentsCount: 1,
      reportedSales: 2,
      verifiedSales: 1,
    });

    // B never crossed the 3-decision or 10-decision bars, never signed up,
    // never generated any behavioral events, and never submitted a lead -
    // none of A's stage counts should have leaked into this unrelated bucket.
    expect(b).toMatchObject({
      sessionsStarted: 1,
      discoveryStarters: 0,
      threeDecisionUsers: 0,
      activatedShoppers: 0,
      matchCompleters: 0,
      accountsCreated: 0,
      returningShoppers: 0,
      partnerInvites: 0,
      leadsCount: 0,
      appointmentsCount: 0,
      reportedSales: 0,
      verifiedSales: 0,
    });
  });

  it("never collapses social/organic/referral sources into direct - each stays its own distinct bucket", async () => {
    const [socialSession] = await db
      .insert(anonymousSessions)
      .values({ firstSource: "social" })
      .returning({ id: anonymousSessions.id });
    const [organicSession] = await db
      .insert(anonymousSessions)
      .values({ firstSource: "organic" })
      .returning({ id: anonymousSessions.id });
    anonymousSessionIds.push(socialSession.id, organicSession.id);

    const segments = await getAcquisitionFunnelBySource();
    const social = segments.find((s) => s.source === "social");
    const organic = segments.find((s) => s.source === "organic");
    const direct = segments.find((s) => s.source === "direct");
    // All three must exist as independently-tracked buckets - if the code
    // ever collapsed social/organic into "direct" again, these wouldn't
    // both be separately present (or "direct" would silently include them).
    expect(social).toBeDefined();
    expect(organic).toBeDefined();
    expect(social!.source).not.toBe(direct?.source);
    expect(organic!.source).not.toBe(direct?.source);
    expect(social!.source).not.toBe(organic!.source);
  });
});
