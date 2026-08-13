import { desc, eq, inArray } from "drizzle-orm";

import { db } from "@/server/db/client";
import { dealerships, inventory, inventoryPhotos, savedInventory } from "@/server/db/schema";
import { getOrCreateConsumerProfileId } from "@/server/auth/anonymous";
import { scoreOneInventory } from "@/server/recommendation/engine";

export interface SavedCardData {
  savedId: string;
  inventoryId: string;
  year: number;
  make: string;
  model: string;
  priceCents: number;
  status: "draft" | "published" | "sold" | "archived";
  photoUrl: string | null;
  hasVideo: boolean;
  dealerName: string;
  fitScore: number | null;
  savedAt: Date;
}

export async function getSavedInventory(): Promise<SavedCardData[]> {
  const consumerProfileId = await getOrCreateConsumerProfileId();

  const rows = await db
    .select({
      savedId: savedInventory.id,
      inventoryId: savedInventory.inventoryId,
      savedAt: savedInventory.createdAt,
    })
    .from(savedInventory)
    .where(eq(savedInventory.consumerProfileId, consumerProfileId))
    .orderBy(desc(savedInventory.createdAt));

  if (rows.length === 0) return [];

  const invIds = rows.map((r) => r.inventoryId);
  const [invRows, photoRows] = await Promise.all([
    db.select().from(inventory).where(inArray(inventory.id, invIds)),
    db.select().from(inventoryPhotos).where(inArray(inventoryPhotos.inventoryId, invIds)),
  ]);
  const dealerIds = [...new Set(invRows.map((r) => r.dealershipId))];
  const dealerRows = dealerIds.length
    ? await db.select().from(dealerships).where(inArray(dealerships.id, dealerIds))
    : [];
  const dealerMap = new Map(dealerRows.map((d) => [d.id, d.name]));
  const invMap = new Map(invRows.map((r) => [r.id, r]));
  const photoByInv = new Map<string, string>();
  for (const p of photoRows) {
    if (!photoByInv.has(p.inventoryId)) photoByInv.set(p.inventoryId, p.url);
  }

  const results: SavedCardData[] = [];
  for (const row of rows) {
    const rv = invMap.get(row.inventoryId);
    if (!rv) continue;
    const match = await scoreOneInventory(consumerProfileId, rv);
    results.push({
      savedId: row.savedId,
      inventoryId: rv.id,
      year: rv.year,
      make: rv.make,
      model: rv.model,
      priceCents: rv.advertisedPriceCents ?? rv.salePriceCents,
      status: rv.status,
      photoUrl: photoByInv.get(rv.id) ?? null,
      hasVideo: Boolean(rv.primaryVideoId),
      dealerName: dealerMap.get(rv.dealershipId) ?? "RV Dealer",
      fitScore: match.fitScore,
      savedAt: row.savedAt,
    });
  }
  return results;
}
