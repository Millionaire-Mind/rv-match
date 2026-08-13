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
