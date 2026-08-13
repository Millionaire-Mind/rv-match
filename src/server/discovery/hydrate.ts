import { inArray } from "drizzle-orm";

import { db } from "@/server/db/client";
import { dealerships, inventoryPhotos } from "@/server/db/schema";
import type { ScoredInventory } from "@/server/recommendation/engine";
import { toDiscoveryCardDTO, type DiscoveryCardDTO } from "./dto";

export async function hydrateScoredInventory(scored: ScoredInventory[]): Promise<DiscoveryCardDTO[]> {
  if (scored.length === 0) return [];

  const dealerIds = [...new Set(scored.map((s) => s.inventory.dealershipId))];
  const dealerRows = await db
    .select({ id: dealerships.id, name: dealerships.name })
    .from(dealerships)
    .where(inArray(dealerships.id, dealerIds));
  const dealerMap = new Map(dealerRows.map((d) => [d.id, d]));

  const invIds = scored.map((s) => s.inventory.id);
  const photoRows = await db
    .select()
    .from(inventoryPhotos)
    .where(inArray(inventoryPhotos.inventoryId, invIds))
    .orderBy(inventoryPhotos.position);
  const photosByInv = new Map<string, string[]>();
  for (const p of photoRows) {
    const list = photosByInv.get(p.inventoryId) ?? [];
    list.push(p.url);
    photosByInv.set(p.inventoryId, list);
  }

  return scored.map((s) =>
    toDiscoveryCardDTO(
      s,
      dealerMap.get(s.inventory.dealershipId) ?? { id: s.inventory.dealershipId, name: "RV Dealer" },
      photosByInv.get(s.inventory.id) ?? (s.primaryPhotoUrl ? [s.primaryPhotoUrl] : []),
    ),
  );
}
