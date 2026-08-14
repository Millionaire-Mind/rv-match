import { desc, eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { dealerships, inventory } from "@/server/db/schema";

export interface PlatformInventoryRow {
  id: string;
  year: number;
  make: string;
  model: string;
  dealershipName: string;
  status: "draft" | "published" | "sold" | "archived";
  hasVideo: boolean;
  priceCents: number;
  dateAdded: Date;
}

/** Cross-dealer inventory visibility for platform ops - most recently added first. */
export async function listPlatformInventory(limit = 200): Promise<PlatformInventoryRow[]> {
  const rows = await db
    .select({
      id: inventory.id,
      year: inventory.year,
      make: inventory.make,
      model: inventory.model,
      dealershipName: dealerships.name,
      status: inventory.status,
      primaryVideoId: inventory.primaryVideoId,
      priceCents: inventory.salePriceCents,
      dateAdded: inventory.dateAdded,
    })
    .from(inventory)
    .innerJoin(dealerships, eq(inventory.dealershipId, dealerships.id))
    .orderBy(desc(inventory.dateAdded))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    year: r.year,
    make: r.make,
    model: r.model,
    dealershipName: r.dealershipName,
    status: r.status,
    hasVideo: r.primaryVideoId !== null,
    priceCents: r.priceCents,
    dateAdded: r.dateAdded,
  }));
}
