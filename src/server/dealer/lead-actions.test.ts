import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import {
  attributedSales,
  dealershipUsers,
  dealerships,
  inventory,
  leadActivity,
  leads,
} from "@/server/db/schema";

/**
 * Gap 13: lead-actions.ts had zero test coverage before this - not even a
 * happy path, let alone the cross-dealer IDOR protection its own
 * requireLeadAccessible guard is supposed to provide. This proves that
 * guard directly at the server-action layer (not just page-level route
 * protection, which security.spec.ts already covers) - Dealer A is a
 * legitimate, authenticated member of Dealership A (so requireDealerRole
 * alone lets every one of these calls through), but must still be
 * rejected the moment the leadId it supplies belongs to Dealership B.
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
const { updateLeadStatus, assignLead, addLeadNote, markLeadSold } = await import("./lead-actions");

let dealershipAId: string;
let dealershipBId: string;
let userAId: string;
let userBId: string;
let invAId: string;
let invBId: string;
let leadAId: string;
let leadBId: string;

function asUser(userId: string) {
  currentToken = signSessionToken(userId);
}

beforeAll(async () => {
  const suffix = Date.now();

  const [dealershipA] = await db
    .insert(dealerships)
    .values({
      name: "__test_lead_idor_a__",
      slug: `__test-lead-idor-a-${suffix}`,
      primaryContactName: "A Owner",
      primaryContactEmail: `lead-idor-a-${suffix}@example.com`,
      status: "approved",
    })
    .returning({ id: dealerships.id });
  dealershipAId = dealershipA.id;

  const [dealershipB] = await db
    .insert(dealerships)
    .values({
      name: "__test_lead_idor_b__",
      slug: `__test-lead-idor-b-${suffix}`,
      primaryContactName: "B Owner",
      primaryContactEmail: `lead-idor-b-${suffix}@example.com`,
      status: "approved",
    })
    .returning({ id: dealerships.id });
  dealershipBId = dealershipB.id;

  const userA = await localSignUp({ email: `lead-idor-a-${suffix}@example.com`, password: "TestPassword123!" });
  userAId = userA.userId;
  const userB = await localSignUp({ email: `lead-idor-b-${suffix}@example.com`, password: "TestPassword123!" });
  userBId = userB.userId;

  await db.insert(dealershipUsers).values([
    { dealershipId: dealershipAId, userId: userAId, role: "owner" },
    { dealershipId: dealershipBId, userId: userBId, role: "owner" },
  ]);

  const [invA] = await db
    .insert(inventory)
    .values({
      dealershipId: dealershipAId,
      stockNumber: `LEAD-IDOR-A-${suffix}`,
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
      dealershipId: dealershipBId,
      stockNumber: `LEAD-IDOR-B-${suffix}`,
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

  const [leadA] = await db
    .insert(leads)
    .values({
      dealershipId: dealershipAId,
      inventoryId: invAId,
      name: "Lead A",
      email: "lead-a@example.com",
      ctaType: "check_availability",
    })
    .returning({ id: leads.id });
  leadAId = leadA.id;

  const [leadB] = await db
    .insert(leads)
    .values({
      dealershipId: dealershipBId,
      inventoryId: invBId,
      name: "Lead B",
      email: "lead-b@example.com",
      ctaType: "check_availability",
    })
    .returning({ id: leads.id });
  leadBId = leadB.id;
});

afterAll(async () => {
  await db.delete(dealerships).where(eq(dealerships.id, dealershipAId));
  await db.delete(dealerships).where(eq(dealerships.id, dealershipBId));
});

function markSoldFormData(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const defaults: Record<string, string> = {
    soldInventoryId: invBId,
    saleDate: new Date().toISOString().slice(0, 10),
  };
  for (const [k, v] of Object.entries({ ...defaults, ...overrides })) fd.set(k, v);
  return fd;
}

describe("lead server actions - cross-dealer IDOR (Gap 13)", () => {
  it("allows Dealer A to update the status of Dealer A's own lead", async () => {
    asUser(userAId);
    await updateLeadStatus(dealershipAId, leadAId, "contacted");
    const [row] = await db.select({ status: leads.status }).from(leads).where(eq(leads.id, leadAId));
    expect(row.status).toBe("contacted");
  });

  it("blocks Dealer A from updating the status of Dealer B's lead via a direct server-action call", async () => {
    asUser(userAId);
    await expect(updateLeadStatus(dealershipAId, leadBId, "contacted")).rejects.toThrow("Lead not found.");
    const [row] = await db.select({ status: leads.status }).from(leads).where(eq(leads.id, leadBId));
    expect(row.status).toBe("new"); // untouched
  });

  it("blocks Dealer A from assigning Dealer B's lead to one of Dealer A's own team members", async () => {
    asUser(userAId);
    await expect(assignLead(dealershipAId, leadBId, userAId)).rejects.toThrow("Lead not found.");
    const [row] = await db.select({ assignedTo: leads.assignedTo }).from(leads).where(eq(leads.id, leadBId));
    expect(row.assignedTo).toBeNull();
  });

  it("blocks Dealer A from adding an internal note to Dealer B's lead", async () => {
    asUser(userAId);
    await expect(addLeadNote(dealershipAId, leadBId, "snooping")).rejects.toThrow("Lead not found.");
    const notes = await db.select().from(leadActivity).where(eq(leadActivity.leadId, leadBId));
    expect(notes.some((n) => n.note === "snooping")).toBe(false);
  });

  it("blocks Dealer A from marking Dealer B's lead sold - the most consequential action on this table", async () => {
    asUser(userAId);
    await expect(
      markLeadSold(dealershipAId, leadBId, { ok: false, error: "" }, markSoldFormData()),
    ).rejects.toThrow("Lead not found.");

    const sales = await db.select().from(attributedSales).where(eq(attributedSales.leadId, leadBId));
    expect(sales).toHaveLength(0);
    const [rvRow] = await db.select({ status: inventory.status }).from(inventory).where(eq(inventory.id, invBId));
    expect(rvRow.status).toBe("published"); // never flipped to "sold" by the attacker
  });

  it("allows Dealer A to legitimately mark their own lead sold, creating a real attributed sale", async () => {
    asUser(userAId);
    const result = await markLeadSold(
      dealershipAId,
      leadAId,
      { ok: false, error: "" },
      markSoldFormData({ soldInventoryId: invAId }),
    );
    expect(result).toEqual({ ok: true });

    const [sale] = await db.select().from(attributedSales).where(eq(attributedSales.leadId, leadAId));
    expect(sale).toBeDefined();
    expect(sale.dealershipId).toBe(dealershipAId);
    expect(sale.verificationStatus).toBe("dealer_reported");

    const [rvRow] = await db.select({ status: inventory.status }).from(inventory).where(eq(inventory.id, invAId));
    expect(rvRow.status).toBe("sold");
  });
});
