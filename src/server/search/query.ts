import { and, asc, desc, eq, gte, ilike, inArray, lte, sql } from "drizzle-orm";

import { db } from "@/server/db/client";
import { dealerships, inventory, inventoryPhotos, inventoryVideos } from "@/server/db/schema";
import { discoveryEligible } from "@/server/inventory/eligibility";
import { haversineMiles, geocodeZip } from "@/server/geo/zip-centroids";
import type { SearchFilters } from "@/server/validation/search";
import { rvTypeLabels, type RvType } from "@/server/validation/enums";

export interface SearchResultCard {
  id: string;
  year: number;
  make: string;
  brand: string | null;
  model: string;
  floorplan: string | null;
  rvTypeLabel: string;
  rvType: string;
  condition: "new" | "used";
  priceCents: number;
  photoUrl: string | null;
  videoUrl: string | null;
  dealerName: string;
  dealershipId: string;
  distanceMiles: number | null;
}

export interface SearchResults {
  totalCount: number;
  results: SearchResultCard[];
}

const PAGE_SIZE = 24;

/**
 * "I Know What I Want" traditional search: every eligible result still
 * obeys the video-first requirement (discoveryEligible()), the same as
 * the swipe feed and Match results - search is a second entry path into
 * the same video-required inventory, not a way around it.
 */
export async function searchInventory(filters: SearchFilters, page = 1): Promise<SearchResults> {
  const conditions = [discoveryEligible()];

  if (filters.rvType) conditions.push(eq(inventory.rvType, filters.rvType));
  if (filters.make) conditions.push(ilike(inventory.make, `%${filters.make}%`));
  if (filters.brand) conditions.push(ilike(inventory.brand, `%${filters.brand}%`));
  if (filters.model) conditions.push(ilike(inventory.model, `%${filters.model}%`));
  if (filters.floorplan) conditions.push(ilike(inventory.floorplan, `%${filters.floorplan}%`));
  if (filters.condition) conditions.push(eq(inventory.condition, filters.condition));
  if (filters.dealershipId) conditions.push(eq(inventory.dealershipId, filters.dealershipId));
  if (filters.yearMin) conditions.push(gte(inventory.year, filters.yearMin));
  if (filters.yearMax) conditions.push(lte(inventory.year, filters.yearMax));
  if (filters.priceMin) conditions.push(gte(sql`coalesce(${inventory.advertisedPriceCents}, ${inventory.salePriceCents})`, Math.round(filters.priceMin * 100)));
  if (filters.priceMax) conditions.push(lte(sql`coalesce(${inventory.advertisedPriceCents}, ${inventory.salePriceCents})`, Math.round(filters.priceMax * 100)));
  if (filters.lengthMinFeet) conditions.push(gte(inventory.lengthInches, Math.round(filters.lengthMinFeet * 12)));
  if (filters.lengthMaxFeet) conditions.push(lte(inventory.lengthInches, Math.round(filters.lengthMaxFeet * 12)));
  if (filters.sleepsMin) conditions.push(gte(inventory.sleeps, filters.sleepsMin));
  if (filters.dryWeightMaxLbs) conditions.push(lte(inventory.dryWeightLbs, filters.dryWeightMaxLbs));
  if (filters.bunkhouse) conditions.push(eq(inventory.bunkhouse, true));
  if (filters.toyHauler) conditions.push(eq(inventory.toyHauler, true));
  if (filters.outdoorKitchen) conditions.push(eq(inventory.outdoorKitchen, true));

  const where = and(...conditions);

  const orderBy =
    filters.sort === "price_asc"
      ? asc(sql`coalesce(${inventory.advertisedPriceCents}, ${inventory.salePriceCents})`)
      : filters.sort === "price_desc"
        ? desc(sql`coalesce(${inventory.advertisedPriceCents}, ${inventory.salePriceCents})`)
        : desc(inventory.dateAdded);

  const [{ count: totalCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(inventory)
    .where(where);

  const rows = await db
    .select({ inventory, dealershipName: dealerships.name })
    .from(inventory)
    .innerJoin(dealerships, eq(dealerships.id, inventory.dealershipId))
    .where(where)
    .orderBy(orderBy)
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  const ids = rows.map((r) => r.inventory.id);
  const [photoRows, videoRows] = await Promise.all([
    ids.length ? db.select().from(inventoryPhotos).where(inArray(inventoryPhotos.inventoryId, ids)) : Promise.resolve([]),
    ids.length ? db.select().from(inventoryVideos).where(inArray(inventoryVideos.inventoryId, ids)) : Promise.resolve([]),
  ]);
  const photoByInv = new Map<string, string>();
  for (const p of photoRows) if (!photoByInv.has(p.inventoryId)) photoByInv.set(p.inventoryId, p.url);
  const videoById = new Map(videoRows.map((v) => [v.id, v]));

  const consumerGeo = filters.zipCode ? geocodeZip(filters.zipCode) : null;

  const results: SearchResultCard[] = rows.map(({ inventory: rv, dealershipName }) => {
    const video = rv.primaryVideoId ? videoById.get(rv.primaryVideoId) : undefined;
    const distanceMiles =
      consumerGeo && rv.lat && rv.lng
        ? haversineMiles(consumerGeo, { lat: Number(rv.lat), lng: Number(rv.lng) })
        : null;
    return {
      id: rv.id,
      year: rv.year,
      make: rv.make,
      brand: rv.brand,
      model: rv.model,
      floorplan: rv.floorplan,
      rvType: rv.rvType,
      rvTypeLabel: rvTypeLabels[rv.rvType as RvType] ?? rv.rvType,
      condition: rv.condition,
      priceCents: rv.advertisedPriceCents ?? rv.salePriceCents,
      photoUrl: photoByInv.get(rv.id) ?? null,
      videoUrl: video?.url ?? null,
      dealerName: dealershipName,
      dealershipId: rv.dealershipId,
      distanceMiles,
    };
  });

  // Radius is applied after fetching (rather than in SQL) since it needs
  // the geocoded consumer point computed above - consistent with how
  // distance filtering works elsewhere (src/server/recommendation/engine.ts).
  // An RV with unknown coordinates is honestly excluded from a
  // radius-filtered search, same reasoning as discovery/Match (Phase 7):
  // unknown location must never be silently counted as "nearby."
  const radiusFiltered =
    consumerGeo && filters.radiusMiles
      ? results.filter((r) => r.distanceMiles !== null && r.distanceMiles <= filters.radiusMiles!)
      : results;

  return { totalCount, results: radiusFiltered };
}
