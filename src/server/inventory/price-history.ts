import { and, desc, eq, gte, inArray } from "drizzle-orm";

import { db } from "@/server/db/client";
import { inventoryPriceHistory } from "@/server/db/schema";

const PRICE_DROP_DISPLAY_WINDOW_DAYS = 14;

export interface PriceDropInfo {
  oldPriceCents: number;
  newPriceCents: number;
  changedAt: Date;
}

/**
 * Returns the most recent price change for this RV if it was a drop, it
 * happened within the display window, and the price hasn't moved again
 * since (i.e. `currentPriceCents` still matches what that change set it
 * to) - otherwise null. `currentPriceCents` should be the same value the
 * caller is about to render (advertisedPriceCents ?? salePriceCents), so a
 * dealer's advertised-price override silently suppresses the badge instead
 * of showing a drop that isn't reflected in what the consumer actually sees.
 */
export async function getRecentPriceDrop(
  inventoryId: string,
  currentPriceCents: number,
): Promise<PriceDropInfo | null> {
  const since = new Date(Date.now() - PRICE_DROP_DISPLAY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const [latest] = await db
    .select()
    .from(inventoryPriceHistory)
    .where(and(eq(inventoryPriceHistory.inventoryId, inventoryId), gte(inventoryPriceHistory.changedAt, since)))
    .orderBy(desc(inventoryPriceHistory.changedAt))
    .limit(1);

  if (!latest) return null;
  if (latest.newPriceCents >= latest.oldPriceCents) return null;
  if (latest.newPriceCents !== currentPriceCents) return null;

  return { oldPriceCents: latest.oldPriceCents, newPriceCents: latest.newPriceCents, changedAt: latest.changedAt };
}

/** Batch form for grids (Saved) - one query for all ids instead of N. */
export async function getRecentPriceDrops(
  inventoryIds: string[],
  currentPriceByInventoryId: Map<string, number>,
): Promise<Map<string, PriceDropInfo>> {
  if (inventoryIds.length === 0) return new Map();
  const since = new Date(Date.now() - PRICE_DROP_DISPLAY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const rows = await db
    .select()
    .from(inventoryPriceHistory)
    .where(and(inArray(inventoryPriceHistory.inventoryId, inventoryIds), gte(inventoryPriceHistory.changedAt, since)))
    .orderBy(desc(inventoryPriceHistory.changedAt));

  const result = new Map<string, PriceDropInfo>();
  for (const row of rows) {
    if (result.has(row.inventoryId)) continue;
    if (row.newPriceCents >= row.oldPriceCents) continue;
    const currentPriceCents = currentPriceByInventoryId.get(row.inventoryId);
    if (currentPriceCents === undefined || row.newPriceCents !== currentPriceCents) continue;
    result.set(row.inventoryId, {
      oldPriceCents: row.oldPriceCents,
      newPriceCents: row.newPriceCents,
      changedAt: row.changedAt,
    });
  }
  return result;
}
