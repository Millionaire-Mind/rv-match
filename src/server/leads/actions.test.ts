import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import {
  anonymousSessions,
  consumerProfiles,
  dealerships,
  distributionCampaigns,
  inventory,
  inventoryVideos,
  leads,
  swipeDecisions,
} from "@/server/db/schema";

/**
 * Phase 17-19: submitLead must freeze a copy of the consumer's first-touch
 * attribution onto the lead row at submission time (see
 * getFirstTouchAttribution / the durable-attribution philosophy already
 * proven for markLeadSold in sale-attribution.test.ts).
 */

let currentToken: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "rvm_session" && currentToken ? { value: currentToken } : undefined),
    set: () => {},
    delete: () => {},
  }),
}));

const { submitLead } = await import("./actions");
const { scoreOneInventory } = await import("@/server/recommendation/engine");

let dealershipId: string;
let inventoryId: string;
let anonymousSessionId: string;
let campaignId: string;

function leadForm(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const defaults: Record<string, string> = {
    inventoryId,
    ctaType: "check_availability",
    name: "Test Shopper",
    email: "shopper@example.com",
    preferredContact: "email",
    consent: "on",
  };
  for (const [k, v] of Object.entries({ ...defaults, ...overrides })) fd.set(k, v);
  return fd;
}

beforeAll(async () => {
  const suffix = Date.now();
  const [dealership] = await db
    .insert(dealerships)
    .values({
      name: "__test_lead_attribution__",
      slug: `__test-lead-attribution-${suffix}`,
      primaryContactName: "Owner",
      primaryContactEmail: `lead-attr-${suffix}@example.com`,
      status: "approved",
    })
    .returning({ id: dealerships.id });
  dealershipId = dealership.id;

  const [rv] = await db
    .insert(inventory)
    .values({
      dealershipId,
      stockNumber: `LEAD-ATTR-${suffix}`,
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
    .values({ inventoryId, url: "/media/videos/lead-attr.mp4", source: "dealer_upload" })
    .returning({ id: inventoryVideos.id });
  await db.update(inventory).set({ primaryVideoId: video.id }).where(eq(inventory.id, inventoryId));

  const [campaign] = await db
    .insert(distributionCampaigns)
    .values({ dealershipId, code: `lead-attr-${suffix}`, name: "Test Campaign", campaignType: "dealer_general" })
    .returning({ id: distributionCampaigns.id });
  campaignId = campaign.id;
});

afterAll(async () => {
  await db.delete(dealerships).where(eq(dealerships.id, dealershipId));
});

describe("submitLead attribution", () => {
  it("freezes the consumer's first-touch attribution onto the lead at submission time", async () => {
    const [session] = await db
      .insert(anonymousSessions)
      .values({ firstSource: "qr", firstCampaignId: campaignId })
      .returning({ id: anonymousSessions.id });
    anonymousSessionId = session.id;
    currentToken = anonymousSessionId;

    const result = await submitLead({ ok: false, error: "" }, leadForm());
    expect(result.ok).toBe(true);

    const [lead] = await db.select().from(leads).where(eq(leads.inventoryId, inventoryId));
    expect(lead.firstSource).toBe("qr");
    expect(lead.firstCampaignId).toBe(campaignId);

    await db.delete(consumerProfiles).where(eq(consumerProfiles.anonymousSessionId, anonymousSessionId));
    await db.delete(anonymousSessions).where(eq(anonymousSessions.id, anonymousSessionId));
  });

  it("leaves attribution null for a shopper with no recorded first touch (organic/direct)", async () => {
    const [session] = await db.insert(anonymousSessions).values({}).returning({ id: anonymousSessions.id });
    currentToken = session.id;

    const result = await submitLead({ ok: false, error: "" }, leadForm({ email: "direct-shopper@example.com" }));
    expect(result.ok).toBe(true);

    const [lead] = await db.select().from(leads).where(eq(leads.email, "direct-shopper@example.com"));
    expect(lead.firstCampaignId).toBeNull();

    await db.delete(consumerProfiles).where(eq(consumerProfiles.anonymousSessionId, session.id));
    await db.delete(anonymousSessions).where(eq(anonymousSessions.id, session.id));
  });
});

describe("submitLead match score (Gap 9)", () => {
  it("freezes the consumer's real, computed match score for this RV at lead creation - matching an independent scoreOneInventory call at the same moment", async () => {
    const [session] = await db.insert(anonymousSessions).values({}).returning({ id: anonymousSessions.id });
    currentToken = session.id;
    const [profile] = await db
      .insert(consumerProfiles)
      .values({ anonymousSessionId: session.id })
      .returning({ id: consumerProfiles.id });

    // Build a real preference signal toward this RV's own make/type by
    // loving a *different* RV sharing them - swipe_decisions has a unique
    // (consumer_profile_id, inventory_id) constraint, and the point is a
    // learned preference profile, not a decision on the lead's own RV.
    const [similarRv] = await db
      .insert(inventory)
      .values({
        dealershipId,
        stockNumber: `LEAD-ATTR-SIMILAR-${Date.now()}`,
        year: 2024,
        make: "Forest River",
        model: "Rockwood Mini",
        rvType: "travel_trailer",
        condition: "new",
        salePriceCents: 2800000,
        status: "published",
        source: "manual",
      })
      .returning({ id: inventory.id });
    await db.insert(swipeDecisions).values({ consumerProfileId: profile.id, inventoryId: similarRv.id, decision: "love" });

    const [rv] = await db.select().from(inventory).where(eq(inventory.id, inventoryId));
    const expected = await scoreOneInventory(profile.id, rv);

    const result = await submitLead({ ok: false, error: "" }, leadForm({ email: "match-score-shopper@example.com" }));
    expect(result.ok).toBe(true);

    const [lead] = await db.select().from(leads).where(eq(leads.email, "match-score-shopper@example.com"));
    expect(lead.matchScore).not.toBeNull();
    expect(Number(lead.matchScore)).toBeCloseTo(expected.fitScore, 0);
    expect(Number(lead.matchScore)).toBeGreaterThanOrEqual(0);
    expect(Number(lead.matchScore)).toBeLessThanOrEqual(100);

    await db.delete(swipeDecisions).where(eq(swipeDecisions.consumerProfileId, profile.id));
    await db.delete(consumerProfiles).where(eq(consumerProfiles.id, profile.id));
    await db.delete(anonymousSessions).where(eq(anonymousSessions.id, session.id));
    await db.delete(inventory).where(eq(inventory.id, similarRv.id));
  });

  it("still succeeds and leaves matchScore null if scoring itself throws, since lead capture must never be blocked by supplementary intelligence", async () => {
    const engine = await import("@/server/recommendation/engine");
    const spy = vi.spyOn(engine, "scoreOneInventory").mockRejectedValueOnce(new Error("boom"));

    const [session] = await db.insert(anonymousSessions).values({}).returning({ id: anonymousSessions.id });
    currentToken = session.id;

    const result = await submitLead({ ok: false, error: "" }, leadForm({ email: "score-failure-shopper@example.com" }));
    expect(result.ok).toBe(true);

    const [lead] = await db.select().from(leads).where(eq(leads.email, "score-failure-shopper@example.com"));
    expect(lead.matchScore).toBeNull();
    expect(lead.intentScore).not.toBeNull(); // everything else still worked

    spy.mockRestore();
    await db.delete(consumerProfiles).where(eq(consumerProfiles.anonymousSessionId, session.id));
    await db.delete(anonymousSessions).where(eq(anonymousSessions.id, session.id));
  });
});
