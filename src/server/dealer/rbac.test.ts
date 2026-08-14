import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { dealershipUsers, dealerships, inventory, leads } from "@/server/db/schema";

/**
 * Integration tests for the dealer role permission matrix (Phase 3):
 * role-gated server actions, per-lead scoping for salespeople, dealership
 * status gating (pending/suspended blocked server-side), deactivated
 * members losing access, and team management (invite/role-change/
 * deactivate, including the last-owner protection and the invite flow's
 * two paths - existing account vs. new account).
 */

let currentToken: string | undefined;
const sentMail: Array<{ to: string; subject: string }> = [];

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "rvm_auth" && currentToken ? { value: currentToken } : undefined),
    set: () => {},
    delete: () => {},
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/server/email/mailer", () => ({
  sendMail: vi.fn(async (params: { to: string; subject: string }) => {
    sentMail.push({ to: params.to, subject: params.subject });
  }),
}));

const { localSignUp } = await import("@/server/auth/local-provider");
const { signSessionToken } = await import("@/server/auth/session-cookie");
const { ForbiddenError } = await import("@/server/auth/guards");
const { createInventory } = await import("./inventory-actions");
const { assignLead, updateLeadStatus, addLeadNote } = await import("./lead-actions");
const { inviteDealerUser, updateDealerUserRole, setDealerUserActive } = await import("./team-actions");
const { getDealerTeamDetailed } = await import("./team-list");

let dealershipId: string;
let pendingDealershipId: string;
let ownerId: string;
let salesManagerId: string;
let salespersonAId: string;
let salespersonBId: string;
let marketingId: string;
let invA: string;

function asUser(userId: string) {
  currentToken = signSessionToken(userId);
}

async function makeUser(role: string, suffix: string) {
  const user = await localSignUp({ email: `rbac-${suffix}-${Date.now()}@example.com`, password: "TestPassword123!" });
  await db.insert(dealershipUsers).values({ dealershipId, userId: user.userId, role: role as never });
  return user.userId;
}

beforeAll(async () => {
  const suffix = Date.now();

  const [dealership] = await db
    .insert(dealerships)
    .values({
      name: "__test_rbac__",
      slug: `__test-rbac-${suffix}`,
      primaryContactName: "Owner",
      primaryContactEmail: `rbac-${suffix}@example.com`,
      status: "approved",
    })
    .returning({ id: dealerships.id });
  dealershipId = dealership.id;

  const [pendingDealership] = await db
    .insert(dealerships)
    .values({
      name: "__test_rbac_pending__",
      slug: `__test-rbac-pending-${suffix}`,
      primaryContactName: "Owner",
      primaryContactEmail: `rbac-pending-${suffix}@example.com`,
      status: "pending",
    })
    .returning({ id: dealerships.id });
  pendingDealershipId = pendingDealership.id;

  const ownerUser = await localSignUp({ email: `rbac-owner-${suffix}@example.com`, password: "TestPassword123!" });
  ownerId = ownerUser.userId;
  await db.insert(dealershipUsers).values({ dealershipId, userId: ownerId, role: "owner" });
  await db.insert(dealershipUsers).values({ dealershipId: pendingDealershipId, userId: ownerId, role: "owner" });

  salesManagerId = await makeUser("sales_manager", "sm");
  salespersonAId = await makeUser("salesperson", "sp-a");
  salespersonBId = await makeUser("salesperson", "sp-b");
  marketingId = await makeUser("marketing", "mkt");

  const [rv] = await db
    .insert(inventory)
    .values({
      dealershipId,
      stockNumber: `RBAC-${suffix}`,
      year: 2024,
      make: "Forest River",
      model: "Rockwood",
      rvType: "travel_trailer",
      condition: "new",
      salePriceCents: 3500000,
      status: "draft",
      source: "manual",
    })
    .returning({ id: inventory.id });
  invA = rv.id;
});

afterAll(async () => {
  await db.delete(dealerships).where(eq(dealerships.id, dealershipId));
  await db.delete(dealerships).where(eq(dealerships.id, pendingDealershipId));
});

function inventoryForm(): FormData {
  const fd = new FormData();
  fd.set("stockNumber", `RBAC-CREATE-${Date.now()}`);
  fd.set("year", "2024");
  fd.set("make", "Test");
  fd.set("brand", "Test Brand");
  fd.set("model", "Model");
  fd.set("rvType", "travel_trailer");
  fd.set("condition", "new");
  fd.set("salePrice", "30000");
  return fd;
}

describe("inventory management is restricted to Owner / Sales Manager", () => {
  it("allows a sales manager to create inventory", async () => {
    asUser(salesManagerId);
    const result = await createInventory(dealershipId, { ok: false, error: "" }, inventoryForm());
    expect(result.ok).toBe(true);
  });

  it("blocks a salesperson from creating inventory", async () => {
    asUser(salespersonAId);
    await expect(createInventory(dealershipId, { ok: false, error: "" }, inventoryForm())).rejects.toThrow(ForbiddenError);
  });

  it("blocks a marketing user from creating inventory", async () => {
    asUser(marketingId);
    await expect(createInventory(dealershipId, { ok: false, error: "" }, inventoryForm())).rejects.toThrow(ForbiddenError);
  });
});

describe("lead assignment is restricted to Owner / Sales Manager", () => {
  let leadId: string;

  beforeAll(async () => {
    const [lead] = await db
      .insert(leads)
      .values({ dealershipId, inventoryId: invA, name: "Assign Test", email: "assign-test@example.com", ctaType: "ask_question" })
      .returning({ id: leads.id });
    leadId = lead.id;
  });

  it("blocks a salesperson from assigning a lead", async () => {
    asUser(salespersonAId);
    await expect(assignLead(dealershipId, leadId, salespersonBId)).rejects.toThrow(ForbiddenError);
  });

  it("blocks a marketing user from assigning a lead", async () => {
    asUser(marketingId);
    await expect(assignLead(dealershipId, leadId, salespersonAId)).rejects.toThrow();
  });

  it("allows a sales manager to assign a lead to an active salesperson", async () => {
    asUser(salesManagerId);
    await assignLead(dealershipId, leadId, salespersonAId);
    const [row] = await db.select({ assignedTo: leads.assignedTo }).from(leads).where(eq(leads.id, leadId));
    expect(row.assignedTo).toBe(salespersonAId);
  });

  it("rejects assigning a lead to someone who isn't an active dealership member", async () => {
    asUser(salesManagerId);
    await expect(assignLead(dealershipId, leadId, "00000000-0000-0000-0000-000000000000")).rejects.toThrow();
  });
});

describe("a salesperson only works leads assigned to them (or unclaimed)", () => {
  let unassignedLeadId: string;
  let assignedToOtherLeadId: string;

  beforeAll(async () => {
    const [unassigned] = await db
      .insert(leads)
      .values({ dealershipId, inventoryId: invA, name: "Unassigned", email: "unassigned@example.com", ctaType: "ask_question" })
      .returning({ id: leads.id });
    unassignedLeadId = unassigned.id;

    const [assignedToOther] = await db
      .insert(leads)
      .values({ dealershipId, inventoryId: invA, name: "Assigned To B", email: "assigned-b@example.com", ctaType: "ask_question", assignedTo: salespersonBId })
      .returning({ id: leads.id });
    assignedToOtherLeadId = assignedToOther.id;
  });

  it("allows working an unclaimed lead", async () => {
    asUser(salespersonAId);
    await updateLeadStatus(dealershipId, unassignedLeadId, "contacted");
    const [row] = await db.select({ status: leads.status }).from(leads).where(eq(leads.id, unassignedLeadId));
    expect(row.status).toBe("contacted");
  });

  it("blocks working a lead assigned to a different salesperson", async () => {
    asUser(salespersonAId);
    await expect(updateLeadStatus(dealershipId, assignedToOtherLeadId, "contacted")).rejects.toThrow();
    await expect(addLeadNote(dealershipId, assignedToOtherLeadId, "trying to sneak a note in")).rejects.toThrow();
  });

  it("allows the assigned salesperson to work their own lead", async () => {
    asUser(salespersonBId);
    await updateLeadStatus(dealershipId, assignedToOtherLeadId, "contacted");
    const [row] = await db.select({ status: leads.status }).from(leads).where(eq(leads.id, assignedToOtherLeadId));
    expect(row.status).toBe("contacted");
  });

  it("allows a sales manager to work any lead regardless of assignment", async () => {
    asUser(salesManagerId);
    await updateLeadStatus(dealershipId, assignedToOtherLeadId, "appointment");
    const [row] = await db.select({ status: leads.status }).from(leads).where(eq(leads.id, assignedToOtherLeadId));
    expect(row.status).toBe("appointment");
  });
});

describe("dealership status gating", () => {
  it("blocks dealer actions when the dealership is not approved, even for its owner", async () => {
    asUser(ownerId);
    await expect(createInventory(pendingDealershipId, { ok: false, error: "" }, inventoryForm())).rejects.toThrow(ForbiddenError);
  });
});

describe("deactivated team members lose access", () => {
  it("blocks a deactivated salesperson from acting on the dealership", async () => {
    asUser(ownerId);
    const team = await getDealerTeamDetailed(dealershipId);
    const membership = team.find((m) => m.userId === salespersonAId)!;
    await setDealerUserActive(dealershipId, membership.membershipId, false);

    asUser(salespersonAId);
    const [lead] = await db
      .insert(leads)
      .values({ dealershipId, inventoryId: invA, name: "Deactivated Test", email: "deactivated-test@example.com", ctaType: "ask_question" })
      .returning({ id: leads.id });
    await expect(updateLeadStatus(dealershipId, lead.id, "contacted")).rejects.toThrow(ForbiddenError);

    // restore for any later tests in this file
    asUser(ownerId);
    await setDealerUserActive(dealershipId, membership.membershipId, true);
  });
});

describe("team management", () => {
  it("blocks a non-owner from inviting a team member", async () => {
    asUser(salesManagerId);
    const fd = new FormData();
    fd.set("email", `should-fail-${Date.now()}@example.com`);
    fd.set("fullName", "Should Fail");
    fd.set("role", "salesperson");
    await expect(inviteDealerUser(dealershipId, fd)).rejects.toThrow(ForbiddenError);
  });

  it("creates a new account and emails a temporary password for an unknown email", async () => {
    asUser(ownerId);
    const email = `rbac-new-invite-${Date.now()}@example.com`;
    const fd = new FormData();
    fd.set("email", email);
    fd.set("fullName", "New Hire");
    fd.set("role", "marketing");
    const result = await inviteDealerUser(dealershipId, fd);
    expect(result.ok).toBe(true);
    expect(sentMail.some((m) => m.to === email)).toBe(true);

    const team = await getDealerTeamDetailed(dealershipId);
    expect(team.some((m) => m.email === email && m.role === "marketing")).toBe(true);
  });

  it("attaches an existing account rather than erroring when the email already has one", async () => {
    asUser(ownerId);
    const email = `rbac-existing-${Date.now()}@example.com`;
    const existing = await localSignUp({ email, password: "TestPassword123!" });

    const [otherDealership] = await db
      .insert(dealerships)
      .values({
        name: "__test_rbac_other__",
        slug: `__test-rbac-other-${Date.now()}`,
        primaryContactName: "Owner",
        primaryContactEmail: `rbac-other-${Date.now()}@example.com`,
        status: "approved",
      })
      .returning({ id: dealerships.id });

    const fd = new FormData();
    fd.set("email", email);
    fd.set("fullName", "Existing Person");
    fd.set("role", "salesperson");
    const result = await inviteDealerUser(dealershipId, fd);
    expect(result.ok).toBe(true);

    const team = await getDealerTeamDetailed(dealershipId);
    const attached = team.find((m) => m.userId === existing.userId);
    expect(attached).toBeDefined();

    await db.delete(dealerships).where(eq(dealerships.id, otherDealership.id));
  });

  it("prevents demoting the last active owner", async () => {
    asUser(ownerId);
    const team = await getDealerTeamDetailed(dealershipId);
    const ownerMembership = team.find((m) => m.userId === ownerId && m.role === "owner")!;

    const result = await updateDealerUserRole(dealershipId, ownerMembership.membershipId, "sales_manager");
    expect(result.ok).toBe(false);

    const [row] = await db.select({ role: dealershipUsers.role }).from(dealershipUsers).where(eq(dealershipUsers.id, ownerMembership.membershipId));
    expect(row.role).toBe("owner"); // unchanged
  });

  it("prevents deactivating the last active owner", async () => {
    asUser(ownerId);
    const team = await getDealerTeamDetailed(dealershipId);
    const ownerMembership = team.find((m) => m.userId === ownerId && m.role === "owner")!;

    const result = await setDealerUserActive(dealershipId, ownerMembership.membershipId, false);
    expect(result.ok).toBe(false);
  });
});
