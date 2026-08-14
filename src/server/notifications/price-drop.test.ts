import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import {
  anonymousSessions,
  consumerProfiles,
  dealerships,
  inventory,
  notifications,
  savedInventory,
} from "@/server/db/schema";
import { notifyPriceDropForSavers } from "@/server/notifications/price-drop";

let dealershipId: string;
let anonymousSessionId: string;
let saverProfileId: string;
let nonSaverProfileId: string;
let rvId: string;

beforeAll(async () => {
  const suffix = Date.now();
  const [dealership] = await db
    .insert(dealerships)
    .values({
      name: "__test_price_drop_notify__",
      slug: `__test-price-drop-notify-${suffix}`,
      primaryContactName: "Test",
      primaryContactEmail: `price-drop-notify-${suffix}@example.com`,
      status: "approved",
    })
    .returning({ id: dealerships.id });
  dealershipId = dealership.id;

  const [session] = await db.insert(anonymousSessions).values({}).returning({ id: anonymousSessions.id });
  anonymousSessionId = session.id;
  const [saver] = await db
    .insert(consumerProfiles)
    .values({ anonymousSessionId })
    .returning({ id: consumerProfiles.id });
  saverProfileId = saver.id;

  const [session2] = await db.insert(anonymousSessions).values({}).returning({ id: anonymousSessions.id });
  const [nonSaver] = await db
    .insert(consumerProfiles)
    .values({ anonymousSessionId: session2.id })
    .returning({ id: consumerProfiles.id });
  nonSaverProfileId = nonSaver.id;

  const [rv] = await db
    .insert(inventory)
    .values({
      dealershipId,
      stockNumber: `PRICE-DROP-NOTIFY-${suffix}`,
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

  await db.insert(savedInventory).values({ consumerProfileId: saverProfileId, inventoryId: rvId });
});

afterAll(async () => {
  await db.delete(consumerProfiles).where(eq(consumerProfiles.id, saverProfileId));
  await db.delete(consumerProfiles).where(eq(consumerProfiles.id, nonSaverProfileId));
  await db.delete(anonymousSessions).where(eq(anonymousSessions.id, anonymousSessionId));
  await db.delete(dealerships).where(eq(dealerships.id, dealershipId));
});

describe("notifyPriceDropForSavers", () => {
  it("notifies only consumers who saved the RV, and only on a real drop", async () => {
    await notifyPriceDropForSavers(rvId, 4500000, 4000000, "2024 Forest River Rockwood");

    const saverRows = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.consumerProfileId, saverProfileId), eq(notifications.type, "price_drop")));
    expect(saverRows).toHaveLength(1);
    expect(saverRows[0].link).toBe(`/rv/${rvId}`);

    const nonSaverRows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.consumerProfileId, nonSaverProfileId));
    expect(nonSaverRows).toHaveLength(0);
  });

  it("does not notify on a price increase", async () => {
    await notifyPriceDropForSavers(rvId, 4000000, 4500000, "2024 Forest River Rockwood");

    const rows = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.consumerProfileId, saverProfileId), eq(notifications.type, "price_drop")));
    // Still just the one row from the previous (genuine-drop) test.
    expect(rows).toHaveLength(1);
  });

  it("does not notify on an unchanged price", async () => {
    await notifyPriceDropForSavers(rvId, 4000000, 4000000, "2024 Forest River Rockwood");

    const rows = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.consumerProfileId, saverProfileId), eq(notifications.type, "price_drop")));
    expect(rows).toHaveLength(1);
  });
});
