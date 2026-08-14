import { and, eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { inventory, inventoryFeatures, inventoryPriceHistory } from "@/server/db/schema";
import { geocodeZip } from "@/server/geo/zip-centroids";
import type { CsvRowInput } from "@/server/validation/inventory";
import { notifyPriceDropForSavers } from "@/server/notifications/price-drop";

/** Mirrors inventory-actions.ts's geocodeForZip - a row with no/unrecognizable ZIP honestly gets no coordinates rather than a guessed default. */
function geocodeForZip(zipCode: string | undefined): { lat: string | null; lng: string | null } {
  if (!zipCode) return { lat: null, lng: null };
  const geo = geocodeZip(zipCode);
  if (!geo) return { lat: null, lng: null };
  return { lat: geo.lat.toFixed(6), lng: geo.lng.toFixed(6) };
}

export interface UpsertInventoryResult {
  action: "created" | "updated";
  id: string;
}

/**
 * The one create-or-update-by-stock-number code path for bulk inventory
 * ingestion. Both the manual CSV upload (csv-import.ts) and the generic
 * feed import framework (feed-import/) call this, instead of each
 * reimplementing price-history tracking, geocoding, and feature-list
 * replacement separately and risking them drifting apart.
 */
export async function upsertInventoryRow(
  dealershipId: string,
  row: CsvRowInput,
  source: "csv_import" | "feed_import",
): Promise<UpsertInventoryResult> {
  const salePriceCents = Math.round(row.sale_price * 100);
  const geo = geocodeForZip(row.zip_code);

  const fields = {
    vin: row.vin,
    year: row.year,
    make: row.make,
    model: row.model,
    floorplan: row.floorplan,
    rvType: row.rv_type,
    condition: row.condition,
    msrpCents: row.msrp ? Math.round(row.msrp * 100) : null,
    salePriceCents,
    advertisedPriceCents: row.advertised_price ? Math.round(row.advertised_price * 100) : null,
    lengthInches: row.length_feet ? Math.round(row.length_feet * 12) : null,
    widthInches: row.width_inches ? Math.round(row.width_inches) : null,
    heightInches: row.height_inches ? Math.round(row.height_inches) : null,
    dryWeightLbs: row.dry_weight_lbs ?? null,
    gvwrLbs: row.gvwr_lbs ?? null,
    hitchWeightLbs: row.hitch_weight_lbs ?? null,
    sleeps: row.sleeps ?? null,
    slideCount: row.slide_count ?? 0,
    bedConfiguration: row.bed_configuration,
    bunkhouse: Boolean(row.bunkhouse),
    toyHauler: Boolean(row.toy_hauler),
    outdoorKitchen: Boolean(row.outdoor_kitchen),
    exteriorColor: row.exterior_color,
    interior: row.interior,
    description: row.description,
    city: row.city,
    state: row.state,
    zipCode: row.zip_code,
    lat: geo.lat,
    lng: geo.lng,
  };

  const result = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: inventory.id, salePriceCents: inventory.salePriceCents })
      .from(inventory)
      .where(and(eq(inventory.dealershipId, dealershipId), eq(inventory.stockNumber, row.stock_number)))
      .limit(1);

    if (existing) {
      if (existing.salePriceCents !== salePriceCents) {
        await tx.insert(inventoryPriceHistory).values({
          inventoryId: existing.id,
          oldPriceCents: existing.salePriceCents,
          newPriceCents: salePriceCents,
        });
      }
      await tx
        .update(inventory)
        .set({ ...fields, source })
        .where(eq(inventory.id, existing.id));
      await setFeaturesFromRow(tx, existing.id, row.features);
      return { action: "updated" as const, id: existing.id, oldPriceCents: existing.salePriceCents };
    }

    const [created] = await tx
      .insert(inventory)
      .values({ dealershipId, stockNumber: row.stock_number, ...fields, status: "draft", source })
      .returning({ id: inventory.id });
    await setFeaturesFromRow(tx, created.id, row.features);
    return { action: "created" as const, id: created.id, oldPriceCents: null };
  });

  if (result.action === "updated" && result.oldPriceCents !== null) {
    await notifyPriceDropForSavers(result.id, result.oldPriceCents, salePriceCents, `${row.year} ${row.make} ${row.model}`);
  }

  return { action: result.action, id: result.id };
}

type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

async function setFeaturesFromRow(executor: Executor, inventoryId: string, featuresCsv: string | undefined) {
  // A blank/omitted features cell leaves existing features untouched
  // (rather than wiping them) - a feed re-sync that temporarily drops the
  // column shouldn't erase manually-curated feature lists.
  if (!featuresCsv) return;
  await executor.delete(inventoryFeatures).where(eq(inventoryFeatures.inventoryId, inventoryId));
  const features = featuresCsv
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);
  if (features.length) {
    await executor.insert(inventoryFeatures).values(features.map((feature) => ({ inventoryId, feature })));
  }
}
