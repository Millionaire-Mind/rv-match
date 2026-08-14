import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { dealerships, dealershipUsers, notifications } from "@/server/db/schema";

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
    set: () => {},
    delete: () => {},
  }),
}));

const { localSignUp } = await import("@/server/auth/local-provider");
const { notifyDealerTeam } = await import("@/server/notifications/dealer-fanout");

let dealershipId: string;
let ownerId: string;
let salespersonId: string;
let inactiveOwnerId: string;

beforeAll(async () => {
  const suffix = Date.now();
  const [dealership] = await db
    .insert(dealerships)
    .values({
      name: "__test_dealer_fanout__",
      slug: `__test-dealer-fanout-${suffix}`,
      primaryContactName: "Test",
      primaryContactEmail: `dealer-fanout-${suffix}@example.com`,
      status: "approved",
    })
    .returning({ id: dealerships.id });
  dealershipId = dealership.id;

  const owner = await localSignUp({ email: `fanout-owner-${suffix}@example.com`, password: "TestPassword123!" });
  ownerId = owner.userId;
  await db.insert(dealershipUsers).values({ dealershipId, userId: ownerId, role: "owner" });

  const salesperson = await localSignUp({ email: `fanout-sp-${suffix}@example.com`, password: "TestPassword123!" });
  salespersonId = salesperson.userId;
  await db.insert(dealershipUsers).values({ dealershipId, userId: salespersonId, role: "salesperson" });

  const inactiveOwner = await localSignUp({
    email: `fanout-inactive-${suffix}@example.com`,
    password: "TestPassword123!",
  });
  inactiveOwnerId = inactiveOwner.userId;
  await db.insert(dealershipUsers).values({ dealershipId, userId: inactiveOwnerId, role: "owner", active: false });
});

afterAll(async () => {
  await db.delete(dealerships).where(eq(dealerships.id, dealershipId));
});

describe("notifyDealerTeam", () => {
  it("only notifies active users holding one of the given roles", async () => {
    await notifyDealerTeam(dealershipId, ["owner"], { type: "new_lead", title: "New lead", body: "body" });

    const ownerRows = await db.select().from(notifications).where(eq(notifications.userId, ownerId));
    expect(ownerRows).toHaveLength(1);

    const spRows = await db.select().from(notifications).where(eq(notifications.userId, salespersonId));
    expect(spRows).toHaveLength(0);

    const inactiveRows = await db.select().from(notifications).where(eq(notifications.userId, inactiveOwnerId));
    expect(inactiveRows).toHaveLength(0);
  });

  it("fans out to every role passed in", async () => {
    await notifyDealerTeam(dealershipId, ["owner", "salesperson"], {
      type: "appointment_request",
      title: "Appointment",
      body: "body",
    });

    const spRows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, salespersonId));
    expect(spRows).toHaveLength(1);
    expect(spRows[0].type).toBe("appointment_request");
  });
});
