import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import {
  attributedSales,
  dealerPilots,
  dealerships,
  dealershipUsers,
  distributionCampaigns,
  inventory,
  leads,
  profiles,
} from "@/server/db/schema";

/**
 * Integration tests for sale-attribution integrity (Phase 1C):
 *  - a lead cannot produce two attributed_sales rows (unique constraint +
 *    graceful duplicate-submit handling in markLeadSold)
 *  - cross-unit sales (sold RV != the lead's original RV) remain supported
 *  - admin verification is transactional, idempotent, and race-safe against
 *    concurrent double-verification of the same sale
 *  - rejecting a previously-verified sale undoes its pilot-count contribution
 *  - the pilot threshold conversion reacts to the derived verified count
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
const { markLeadSold } = await import("@/server/dealer/lead-actions");
const { verifySale, rejectSale } = await import("@/server/admin/sale-actions");
const { getPilotSummary } = await import("@/server/dealer/analytics");

let dealershipId: string;
let dealerUserId: string;
let adminUserId: string;
let invAId: string;
let invBId: string;

function asUser(userId: string) {
  currentToken = signSessionToken(userId);
}

function soldForm(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

async function createLead(inventoryId: string, attribution?: { firstSource: string; firstCampaignId: string }) {
  const [lead] = await db
    .insert(leads)
    .values({
      dealershipId,
      inventoryId,
      name: "Test Shopper",
      email: "shopper@example.com",
      ctaType: "check_availability",
      firstSource: attribution?.firstSource,
      firstCampaignId: attribution?.firstCampaignId,
    })
    .returning({ id: leads.id });
  return lead.id;
}

beforeAll(async () => {
  const suffix = Date.now();

  const [dealership] = await db
    .insert(dealerships)
    .values({
      name: "__test_sale_attribution__",
      slug: `__test-sale-attribution-${suffix}`,
      primaryContactName: "Owner",
      primaryContactEmail: `sale-attr-${suffix}@example.com`,
      status: "approved",
    })
    .returning({ id: dealerships.id });
  dealershipId = dealership.id;

  await db.insert(dealerPilots).values({ dealershipId, trialDays: 90, salesThreshold: 2 });

  const dealerUser = await localSignUp({ email: `sale-attr-dealer-${suffix}@example.com`, password: "TestPassword123!" });
  dealerUserId = dealerUser.userId;
  const adminUser = await localSignUp({ email: `sale-attr-admin-${suffix}@example.com`, password: "TestPassword123!" });
  adminUserId = adminUser.userId;

  await db.insert(dealershipUsers).values({ dealershipId, userId: dealerUserId, role: "owner" });
  // Trusted server-side write via the app's direct/service-role connection
  // (never through PostgREST as the authenticated role - see
  // 20260101000009_fix_profiles_privilege_escalation.sql).
  await db.update(profiles).set({ platformRole: "platform_admin" }).where(eq(profiles.id, adminUserId));

  const [invA] = await db
    .insert(inventory)
    .values({
      dealershipId,
      stockNumber: `SALE-A-${suffix}`,
      year: 2024,
      make: "Forest River",
      model: "Rockwood",
      rvType: "travel_trailer",
      condition: "new",
      salePriceCents: 3500000,
      status: "published",
      source: "manual",
    })
    .returning({ id: inventory.id });
  invAId = invA.id;

  const [invB] = await db
    .insert(inventory)
    .values({
      dealershipId,
      stockNumber: `SALE-B-${suffix}`,
      year: 2024,
      make: "Jayco",
      model: "Eagle",
      rvType: "fifth_wheel",
      condition: "new",
      salePriceCents: 5500000,
      status: "published",
      source: "manual",
    })
    .returning({ id: inventory.id });
  invBId = invB.id;
});

afterEach(async () => {
  await db.delete(attributedSales).where(eq(attributedSales.dealershipId, dealershipId));
  await db.delete(leads).where(eq(leads.dealershipId, dealershipId));
  await db.update(dealerPilots).set({ verifiedSalesCount: 0, status: "active" }).where(eq(dealerPilots.dealershipId, dealershipId));
});

afterAll(async () => {
  await db.delete(dealerships).where(eq(dealerships.id, dealershipId));
});

describe("markLeadSold", () => {
  it("records a sale where the sold unit matches the lead's original RV", async () => {
    asUser(dealerUserId);
    const leadId = await createLead(invAId);
    const result = await markLeadSold(dealershipId, leadId, { ok: false, error: "" }, soldForm({
      soldInventoryId: invAId,
      saleDate: "2026-08-01",
    }));
    expect(result.ok).toBe(true);

    const [sale] = await db.select().from(attributedSales).where(eq(attributedSales.leadId, leadId));
    expect(sale.isOriginalLeadRv).toBe(true);
    expect(sale.soldInventoryId).toBe(invAId);
  });

  it("supports a cross-unit sale (lead's RV differs from the sold RV) and still attributes it to RV Match", async () => {
    asUser(dealerUserId);
    const leadId = await createLead(invAId); // shopper inquired about A...
    const result = await markLeadSold(dealershipId, leadId, { ok: false, error: "" }, soldForm({
      soldInventoryId: invBId, // ...but bought B
      saleDate: "2026-08-01",
    }));
    expect(result.ok).toBe(true);

    const [sale] = await db.select().from(attributedSales).where(eq(attributedSales.leadId, leadId));
    expect(sale.isOriginalLeadRv).toBe(false);
    expect(sale.soldInventoryId).toBe(invBId);
    expect(sale.dealershipId).toBe(dealershipId); // still attributed to this dealership
  });

  it("rejects a duplicate mark-sold submit against the same lead instead of creating a second sale row", async () => {
    asUser(dealerUserId);
    const leadId = await createLead(invAId);
    const form = soldForm({ soldInventoryId: invAId, saleDate: "2026-08-01" });

    const first = await markLeadSold(dealershipId, leadId, { ok: false, error: "" }, form);
    expect(first.ok).toBe(true);

    const second = await markLeadSold(dealershipId, leadId, { ok: false, error: "" }, form);
    expect(second.ok).toBe(false);

    const sales = await db.select().from(attributedSales).where(eq(attributedSales.leadId, leadId));
    expect(sales).toHaveLength(1);
  });

  it("copies the lead's frozen first-touch attribution onto the sale it produces", async () => {
    asUser(dealerUserId);
    const [campaign] = await db
      .insert(distributionCampaigns)
      .values({ dealershipId, code: `sale-attr-${Date.now()}`, name: "Test Campaign", campaignType: "dealer_general" })
      .returning({ id: distributionCampaigns.id });
    const leadId = await createLead(invAId, { firstSource: "qr", firstCampaignId: campaign.id });

    await markLeadSold(dealershipId, leadId, { ok: false, error: "" }, soldForm({ soldInventoryId: invAId, saleDate: "2026-08-01" }));

    const [lead] = await db.select().from(leads).where(eq(leads.id, leadId));
    const [sale] = await db.select().from(attributedSales).where(eq(attributedSales.leadId, leadId));
    expect(sale.firstSource).toBe(lead.firstSource);
    expect(sale.firstSource).toBe("qr");
    expect(sale.firstCampaignId).toBe(campaign.id);

    await db.delete(distributionCampaigns).where(eq(distributionCampaigns.id, campaign.id));
  });
});

describe("verifySale / rejectSale", () => {
  it("increments the pilot's verified count exactly once even under concurrent double-verification", async () => {
    asUser(dealerUserId);
    const leadId = await createLead(invAId);
    await markLeadSold(dealershipId, leadId, { ok: false, error: "" }, soldForm({ soldInventoryId: invAId, saleDate: "2026-08-01" }));
    const [sale] = await db.select().from(attributedSales).where(eq(attributedSales.leadId, leadId));

    asUser(adminUserId);
    await Promise.all([verifySale(sale.id), verifySale(sale.id), verifySale(sale.id)]);

    const summary = await getPilotSummary(dealershipId);
    expect(summary?.verifiedSalesCount).toBe(1);

    const [row] = await db.select().from(attributedSales).where(eq(attributedSales.id, sale.id));
    expect(row.verificationStatus).toBe("verified");
  });

  it("undoes the pilot-count contribution when a verified sale is rejected", async () => {
    asUser(dealerUserId);
    const leadId = await createLead(invAId);
    await markLeadSold(dealershipId, leadId, { ok: false, error: "" }, soldForm({ soldInventoryId: invAId, saleDate: "2026-08-01" }));
    const [sale] = await db.select().from(attributedSales).where(eq(attributedSales.leadId, leadId));

    asUser(adminUserId);
    await verifySale(sale.id);
    expect((await getPilotSummary(dealershipId))?.verifiedSalesCount).toBe(1);

    await rejectSale(sale.id);
    expect((await getPilotSummary(dealershipId))?.verifiedSalesCount).toBe(0);

    const [row] = await db.select().from(attributedSales).where(eq(attributedSales.id, sale.id));
    expect(row.verificationStatus).toBe("rejected");
  });

  it("does not double-decrement when rejecting an already-rejected (never verified) sale", async () => {
    asUser(dealerUserId);
    const leadId = await createLead(invAId);
    await markLeadSold(dealershipId, leadId, { ok: false, error: "" }, soldForm({ soldInventoryId: invAId, saleDate: "2026-08-01" }));
    const [sale] = await db.select().from(attributedSales).where(eq(attributedSales.leadId, leadId));

    asUser(adminUserId);
    await rejectSale(sale.id); // never verified - should not touch the counter
    await rejectSale(sale.id); // idempotent

    const summary = await getPilotSummary(dealershipId);
    expect(summary?.verifiedSalesCount).toBe(0);
  });

  it("allows re-verifying a previously rejected sale, incrementing the count again", async () => {
    asUser(dealerUserId);
    const leadId = await createLead(invAId);
    await markLeadSold(dealershipId, leadId, { ok: false, error: "" }, soldForm({ soldInventoryId: invAId, saleDate: "2026-08-01" }));
    const [sale] = await db.select().from(attributedSales).where(eq(attributedSales.leadId, leadId));

    asUser(adminUserId);
    await verifySale(sale.id);
    await rejectSale(sale.id);
    expect((await getPilotSummary(dealershipId))?.verifiedSalesCount).toBe(0);

    await verifySale(sale.id);
    expect((await getPilotSummary(dealershipId))?.verifiedSalesCount).toBe(1);
  });

  it("converts the pilot once verified sales reach the configured threshold", async () => {
    asUser(dealerUserId);
    const lead1 = await createLead(invAId);
    const lead2 = await createLead(invBId);
    await markLeadSold(dealershipId, lead1, { ok: false, error: "" }, soldForm({ soldInventoryId: invAId, saleDate: "2026-08-01" }));
    await markLeadSold(dealershipId, lead2, { ok: false, error: "" }, soldForm({ soldInventoryId: invBId, saleDate: "2026-08-02" }));
    const sales = await db.select().from(attributedSales).where(eq(attributedSales.dealershipId, dealershipId));

    asUser(adminUserId);
    for (const sale of sales) await verifySale(sale.id);

    const summary = await getPilotSummary(dealershipId);
    expect(summary?.verifiedSalesCount).toBe(2); // matches the salesThreshold configured in beforeAll
    expect(summary?.status).toBe("converted");
  });
});
