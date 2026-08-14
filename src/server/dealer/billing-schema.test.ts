import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { dealerPilots, dealerships } from "@/server/db/schema";

/**
 * Gap 6 (targeted gap-closure pass): billing-ready plan schema ONLY - no
 * Stripe integration, no checkout flow, no payment collection exists
 * anywhere in this codebase. This proves the durable shape a future
 * billing integration would populate, and that every dealer_pilots row
 * created through the normal application flow defaults to the
 * unbilled/founding-pilot state rather than anything payment-related.
 */

let dealershipId: string;

beforeAll(async () => {
  const suffix = Date.now();
  const [dealership] = await db
    .insert(dealerships)
    .values({
      name: "__test_billing_schema__",
      slug: `__test-billing-schema-${suffix}`,
      primaryContactName: "Test",
      primaryContactEmail: `billing-schema-${suffix}@example.com`,
      status: "approved",
    })
    .returning({ id: dealerships.id });
  dealershipId = dealership.id;
});

afterAll(async () => {
  await db.delete(dealerships).where(eq(dealerships.id, dealershipId));
});

describe("dealer_pilots billing-ready columns", () => {
  it("defaults every new pilot row to founding_pilot/none/none with no external IDs or billing timestamps", async () => {
    const [pilot] = await db
      .insert(dealerPilots)
      .values({ dealershipId, trialDays: 90, salesThreshold: 3, status: "pending" })
      .returning();

    expect(pilot.plan).toBe("founding_pilot");
    expect(pilot.billingProvider).toBe("none");
    expect(pilot.billingStatus).toBe("none");
    expect(pilot.externalCustomerId).toBeNull();
    expect(pilot.externalSubscriptionId).toBeNull();
    expect(pilot.conversionDueAt).toBeNull();
    expect(pilot.activatedAt).toBeNull();
    expect(pilot.canceledAt).toBeNull();
  });

  it("has a durable shape a future billing provider integration could populate, without any application code writing to it", async () => {
    const now = new Date();
    const [pilot] = await db
      .insert(dealerPilots)
      .values({
        dealershipId: (
          await db
            .insert(dealerships)
            .values({
              name: "__test_billing_schema_2__",
              slug: `__test-billing-schema-2-${Date.now()}`,
              primaryContactName: "Test",
              primaryContactEmail: `billing-schema-2-${Date.now()}@example.com`,
              status: "approved",
            })
            .returning({ id: dealerships.id })
        )[0].id,
        trialDays: 90,
        salesThreshold: 3,
        status: "converted",
        plan: "standard",
        billingProvider: "stripe",
        billingStatus: "active",
        externalCustomerId: "cus_hypothetical",
        externalSubscriptionId: "sub_hypothetical",
        conversionDueAt: now,
        activatedAt: now,
      })
      .returning();

    expect(pilot.plan).toBe("standard");
    expect(pilot.billingProvider).toBe("stripe");
    expect(pilot.billingStatus).toBe("active");
    expect(pilot.externalCustomerId).toBe("cus_hypothetical");
    expect(pilot.externalSubscriptionId).toBe("sub_hypothetical");
    expect(pilot.activatedAt).not.toBeNull();
    expect(pilot.canceledAt).toBeNull();

    await db.delete(dealerships).where(eq(dealerships.id, pilot.dealershipId));
  });
});
