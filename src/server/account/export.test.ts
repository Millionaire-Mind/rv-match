import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import {
  anonymousSessions,
  consumerProfiles,
  dealerships,
  inventory,
  leads,
  savedInventory,
  swipeDecisions,
} from "@/server/db/schema";
import { exportConsumerData } from "@/server/account/export";

let dealershipId: string;
let anonymousSessionId: string;
let consumerProfileId: string;
let rvId: string;

beforeAll(async () => {
  const suffix = Date.now();
  const [dealership] = await db
    .insert(dealerships)
    .values({
      name: "__test_export__",
      slug: `__test-export-${suffix}`,
      primaryContactName: "Test",
      primaryContactEmail: `export-${suffix}@example.com`,
      status: "approved",
    })
    .returning({ id: dealerships.id });
  dealershipId = dealership.id;

  const [session] = await db.insert(anonymousSessions).values({}).returning({ id: anonymousSessions.id });
  anonymousSessionId = session.id;
  const [profile] = await db
    .insert(consumerProfiles)
    .values({ anonymousSessionId, zipCode: "80202", decisionsCount: 1 })
    .returning({ id: consumerProfiles.id });
  consumerProfileId = profile.id;

  const [rv] = await db
    .insert(inventory)
    .values({
      dealershipId,
      stockNumber: `EXPORT-${suffix}`,
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
  rvId = rv.id;

  await db.insert(swipeDecisions).values({ consumerProfileId, inventoryId: rvId, decision: "love" });
  await db.insert(savedInventory).values({ consumerProfileId, inventoryId: rvId });
  await db.insert(leads).values({
    dealershipId,
    inventoryId: rvId,
    consumerProfileId,
    name: "Export Test Lead",
    email: "export-lead@example.com",
    ctaType: "check_availability",
  });
});

afterAll(async () => {
  await db.delete(consumerProfiles).where(eq(consumerProfiles.id, consumerProfileId));
  await db.delete(anonymousSessions).where(eq(anonymousSessions.id, anonymousSessionId));
  await db.delete(dealerships).where(eq(dealerships.id, dealershipId));
});

describe("exportConsumerData", () => {
  it("bundles everything tied to that consumer identity", async () => {
    const data = await exportConsumerData(consumerProfileId);

    expect(data.profile).toMatchObject({ id: consumerProfileId, signedUp: false, zipCode: "80202" });
    expect(data.swipeDecisions).toHaveLength(1);
    expect((data.swipeDecisions as Array<{ decision: string }>)[0].decision).toBe("love");
    expect(data.savedRvs).toHaveLength(1);
    expect(data.leadsSubmitted).toHaveLength(1);
    expect((data.leadsSubmitted as Array<{ name: string }>)[0].name).toBe("Export Test Lead");
    expect(data.notifications).toEqual([]);
    expect(typeof data.exportedAt).toBe("string");
  });

  it("returns a null profile and empty collections for an id that doesn't exist", async () => {
    const data = await exportConsumerData("00000000-0000-0000-0000-000000000000");
    expect(data.profile).toBeNull();
    expect(data.swipeDecisions).toEqual([]);
    expect(data.savedRvs).toEqual([]);
    expect(data.leadsSubmitted).toEqual([]);
  });
});
