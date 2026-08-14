import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { anonymousSessions, consumerProfiles, dealerships, dealershipUsers, inventory, leads, savedInventory } from "@/server/db/schema";

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
    set: () => {},
    delete: () => {},
  }),
}));

const { localSignUp } = await import("@/server/auth/local-provider");
const { listPlatformUsers } = await import("@/server/admin/platform-users");
const { listConsumers } = await import("@/server/admin/platform-consumers");
const { listPlatformInventory } = await import("@/server/admin/platform-inventory");
const { listPlatformLeads } = await import("@/server/admin/platform-leads");

let dealershipId: string;
let ownerUserId: string;
let anonymousSessionId: string;
let consumerProfileId: string;
let inventoryId: string;
let leadId: string;

beforeAll(async () => {
  const suffix = Date.now();
  const [dealership] = await db
    .insert(dealerships)
    .values({
      name: "__test_platform_lists__",
      slug: `__test-platform-lists-${suffix}`,
      primaryContactName: "Test",
      primaryContactEmail: `platform-lists-${suffix}@example.com`,
      status: "approved",
    })
    .returning({ id: dealerships.id });
  dealershipId = dealership.id;

  const owner = await localSignUp({ email: `platform-lists-owner-${suffix}@example.com`, password: "TestPassword123!" });
  ownerUserId = owner.userId;
  await db.insert(dealershipUsers).values({ dealershipId, userId: ownerUserId, role: "owner" });

  const [session] = await db.insert(anonymousSessions).values({}).returning({ id: anonymousSessions.id });
  anonymousSessionId = session.id;
  const [profile] = await db
    .insert(consumerProfiles)
    .values({ anonymousSessionId, decisionsCount: 5, zipCode: "80202" })
    .returning({ id: consumerProfiles.id });
  consumerProfileId = profile.id;

  const [rv] = await db
    .insert(inventory)
    .values({
      dealershipId,
      stockNumber: `PL-${suffix}`,
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

  await db.insert(savedInventory).values({ consumerProfileId, inventoryId });

  const [lead] = await db
    .insert(leads)
    .values({
      dealershipId,
      inventoryId,
      consumerProfileId,
      name: "Platform List Test Lead",
      email: "platform-list-lead@example.com",
      ctaType: "check_availability",
      intentScore: "72.50",
    })
    .returning({ id: leads.id });
  leadId = lead.id;
});

afterAll(async () => {
  await db.delete(consumerProfiles).where(eq(consumerProfiles.id, consumerProfileId));
  await db.delete(anonymousSessions).where(eq(anonymousSessions.id, anonymousSessionId));
  await db.delete(dealerships).where(eq(dealerships.id, dealershipId));
});

describe("listPlatformUsers", () => {
  it("includes a dealer user with their dealership membership attached", async () => {
    const rows = await listPlatformUsers();
    const row = rows.find((u) => u.id === ownerUserId);
    expect(row).toBeDefined();
    expect(row!.platformRole).toBe("consumer");
    expect(row!.dealerships).toContainEqual(
      expect.objectContaining({ dealershipId, dealershipName: "__test_platform_lists__", role: "owner", active: true }),
    );
  });
});

describe("listConsumers", () => {
  it("includes an anonymous consumer with saved and decision counts", async () => {
    // A large explicit limit, not the production default (100) - this
    // test verifies the row's shape, not the ordering/limiting behavior
    // itself, so it shouldn't be sensitive to how many other real
    // consumer_profiles rows happen to exist in a shared dev database.
    const rows = await listConsumers(10_000);
    const row = rows.find((c) => c.id === consumerProfileId);
    expect(row).toBeDefined();
    expect(row!.signedUp).toBe(false);
    expect(row!.decisionsCount).toBe(5);
    expect(row!.savedCount).toBe(1);
    expect(row!.leadsCount).toBe(1);
    expect(row!.zipCode).toBe("80202");
  });
});

describe("listPlatformInventory", () => {
  it("includes the RV with its dealership name and video status", async () => {
    const rows = await listPlatformInventory();
    const row = rows.find((r) => r.id === inventoryId);
    expect(row).toBeDefined();
    expect(row!.dealershipName).toBe("__test_platform_lists__");
    expect(row!.hasVideo).toBe(false);
    expect(row!.status).toBe("published");
  });
});

describe("listPlatformLeads", () => {
  it("includes the lead with its dealership, RV label, and intent score", async () => {
    const rows = await listPlatformLeads();
    const row = rows.find((l) => l.id === leadId);
    expect(row).toBeDefined();
    expect(row!.dealershipName).toBe("__test_platform_lists__");
    expect(row!.rvLabel).toContain("Rockwood");
    expect(row!.intentScore).toBeCloseTo(72.5, 5);
  });
});
