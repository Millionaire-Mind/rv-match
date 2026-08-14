import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { dealerships, inventory, inventoryPriceHistory } from "@/server/db/schema";
import { getRecentPriceDrop, getRecentPriceDrops } from "@/server/inventory/price-history";

let dealershipId: string;
let dropId: string;
let noDropId: string;
let staleDropId: string;
let revertedDropId: string;

async function makeInventory(suffix: string, salePriceCents: number) {
  const [rv] = await db
    .insert(inventory)
    .values({
      dealershipId,
      stockNumber: `PRICE-HIST-${suffix}`,
      year: 2024,
      make: "Forest River",
      model: "Rockwood",
      rvType: "travel_trailer",
      condition: "new",
      salePriceCents,
      status: "published",
      source: "manual",
    })
    .returning({ id: inventory.id });
  return rv.id;
}

beforeAll(async () => {
  const suffix = Date.now();
  const [dealership] = await db
    .insert(dealerships)
    .values({
      name: "__test_price_history__",
      slug: `__test-price-history-${suffix}`,
      primaryContactName: "Test Contact",
      primaryContactEmail: `price-history-${suffix}@example.com`,
      status: "approved",
    })
    .returning({ id: dealerships.id });
  dealershipId = dealership.id;

  dropId = await makeInventory(`${suffix}-drop`, 4000000);
  await db.insert(inventoryPriceHistory).values({ inventoryId: dropId, oldPriceCents: 4500000, newPriceCents: 4000000 });

  noDropId = await makeInventory(`${suffix}-nodrop`, 5000000);
  await db.insert(inventoryPriceHistory).values({ inventoryId: noDropId, oldPriceCents: 4500000, newPriceCents: 5000000 });

  staleDropId = await makeInventory(`${suffix}-stale`, 4000000);
  const [staleRow] = await db
    .insert(inventoryPriceHistory)
    .values({ inventoryId: staleDropId, oldPriceCents: 4500000, newPriceCents: 4000000 })
    .returning({ id: inventoryPriceHistory.id });
  await db
    .update(inventoryPriceHistory)
    .set({ changedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) })
    .where(eq(inventoryPriceHistory.id, staleRow.id));

  revertedDropId = await makeInventory(`${suffix}-reverted`, 4600000);
  await db.insert(inventoryPriceHistory).values({
    inventoryId: revertedDropId,
    oldPriceCents: 4500000,
    newPriceCents: 4000000,
  });
  await db.insert(inventoryPriceHistory).values({
    inventoryId: revertedDropId,
    oldPriceCents: 4000000,
    newPriceCents: 4600000,
  });
});

afterAll(async () => {
  await db.delete(dealerships).where(eq(dealerships.id, dealershipId));
});

describe("getRecentPriceDrop", () => {
  it("returns the drop when the current price matches the latest decrease", async () => {
    const result = await getRecentPriceDrop(dropId, 4000000);
    expect(result).not.toBeNull();
    expect(result?.oldPriceCents).toBe(4500000);
    expect(result?.newPriceCents).toBe(4000000);
  });

  it("returns null for a price increase", async () => {
    const result = await getRecentPriceDrop(noDropId, 5000000);
    expect(result).toBeNull();
  });

  it("returns null once the drop falls outside the display window", async () => {
    const result = await getRecentPriceDrop(staleDropId, 4000000);
    expect(result).toBeNull();
  });

  it("returns null when a later change moved the price again", async () => {
    const result = await getRecentPriceDrop(revertedDropId, 4600000);
    expect(result).toBeNull();
  });

  it("returns null when there is no history at all", async () => {
    const freshId = await makeInventory(`${Date.now()}-fresh`, 4200000);
    const result = await getRecentPriceDrop(freshId, 4200000);
    expect(result).toBeNull();
  });
});

describe("getRecentPriceDrops", () => {
  it("batches drop lookups for multiple inventory ids at once", async () => {
    const priceByInv = new Map([
      [dropId, 4000000],
      [noDropId, 5000000],
      [staleDropId, 4000000],
    ]);
    const result = await getRecentPriceDrops([dropId, noDropId, staleDropId], priceByInv);
    expect(result.has(dropId)).toBe(true);
    expect(result.get(dropId)?.oldPriceCents).toBe(4500000);
    expect(result.has(noDropId)).toBe(false);
    expect(result.has(staleDropId)).toBe(false);
  });

  it("returns an empty map for an empty id list", async () => {
    const result = await getRecentPriceDrops([], new Map());
    expect(result.size).toBe(0);
  });
});
