"use server";

import { parse } from "csv-parse/sync";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { inventory, inventoryFeatures, inventoryPriceHistory } from "@/server/db/schema";
import { requireDealerRole } from "@/server/auth/guards";
import { MANAGEMENT_ROLES } from "@/server/dealer/permissions";
import { csvRowSchema } from "@/server/validation/inventory";
import { logAudit } from "@/server/audit/log";
import { revalidatePath } from "next/cache";

export interface CsvImportRowResult {
  row: number;
  stockNumber?: string;
  status: "created" | "updated" | "error";
  message?: string;
}

export interface CsvImportReport {
  totalRows: number;
  created: number;
  updated: number;
  errors: number;
  rows: CsvImportRowResult[];
}

export async function importInventoryCsv(
  dealershipId: string,
  formData: FormData,
): Promise<CsvImportReport> {
  await requireDealerRole(dealershipId, MANAGEMENT_ROLES);

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { totalRows: 0, created: 0, updated: 0, errors: 0, rows: [] };
  }

  const text = await file.text();
  let records: Record<string, string>[];
  try {
    records = parse(text, { columns: true, skip_empty_lines: true, trim: true });
  } catch (err) {
    return {
      totalRows: 0,
      created: 0,
      updated: 0,
      errors: 1,
      rows: [{ row: 0, status: "error", message: `Could not parse CSV: ${(err as Error).message}` }],
    };
  }

  const results: CsvImportRowResult[] = [];
  let created = 0;
  let updated = 0;
  let errors = 0;

  const existingStockNumbers = await db
    .select({ id: inventory.id, stockNumber: inventory.stockNumber, salePriceCents: inventory.salePriceCents })
    .from(inventory)
    .where(eq(inventory.dealershipId, dealershipId));
  const existingByStock = new Map(existingStockNumbers.map((r) => [r.stockNumber, r]));

  for (let i = 0; i < records.length; i++) {
    const rowNumber = i + 2; // +1 for header row, +1 for 1-indexing
    const parsed = csvRowSchema.safeParse(records[i]);
    if (!parsed.success) {
      results.push({
        row: rowNumber,
        stockNumber: records[i].stock_number,
        status: "error",
        message: parsed.error.issues.map((iss) => `${iss.path.join(".")}: ${iss.message}`).join("; "),
      });
      errors += 1;
      continue;
    }
    const d = parsed.data;

    try {
      const existing = existingByStock.get(d.stock_number);
      const salePriceCents = Math.round(d.sale_price * 100);

      if (existing) {
        if (existing.salePriceCents !== salePriceCents) {
          await db.insert(inventoryPriceHistory).values({
            inventoryId: existing.id,
            oldPriceCents: existing.salePriceCents,
            newPriceCents: salePriceCents,
          });
        }
        await db
          .update(inventory)
          .set({
            vin: d.vin,
            year: d.year,
            make: d.make,
            model: d.model,
            floorplan: d.floorplan,
            rvType: d.rv_type,
            condition: d.condition,
            msrpCents: d.msrp ? Math.round(d.msrp * 100) : null,
            salePriceCents,
            advertisedPriceCents: d.advertised_price ? Math.round(d.advertised_price * 100) : null,
            lengthInches: d.length_feet ? Math.round(d.length_feet * 12) : null,
            dryWeightLbs: d.dry_weight_lbs,
            gvwrLbs: d.gvwr_lbs,
            sleeps: d.sleeps,
            slideCount: d.slide_count ?? 0,
            bunkhouse: Boolean(d.bunkhouse),
            toyHauler: Boolean(d.toy_hauler),
            outdoorKitchen: Boolean(d.outdoor_kitchen),
            exteriorColor: d.exterior_color,
            description: d.description,
            city: d.city,
            state: d.state,
            zipCode: d.zip_code,
            source: "csv_import",
          })
          .where(eq(inventory.id, existing.id));
        await setFeaturesFromCsv(existing.id, d.features);
        results.push({ row: rowNumber, stockNumber: d.stock_number, status: "updated" });
        updated += 1;
      } else {
        const [rv] = await db
          .insert(inventory)
          .values({
            dealershipId,
            stockNumber: d.stock_number,
            vin: d.vin,
            year: d.year,
            make: d.make,
            model: d.model,
            floorplan: d.floorplan,
            rvType: d.rv_type,
            condition: d.condition,
            msrpCents: d.msrp ? Math.round(d.msrp * 100) : null,
            salePriceCents,
            advertisedPriceCents: d.advertised_price ? Math.round(d.advertised_price * 100) : null,
            lengthInches: d.length_feet ? Math.round(d.length_feet * 12) : null,
            dryWeightLbs: d.dry_weight_lbs,
            gvwrLbs: d.gvwr_lbs,
            sleeps: d.sleeps,
            slideCount: d.slide_count ?? 0,
            bunkhouse: Boolean(d.bunkhouse),
            toyHauler: Boolean(d.toy_hauler),
            outdoorKitchen: Boolean(d.outdoor_kitchen),
            exteriorColor: d.exterior_color,
            description: d.description,
            city: d.city,
            state: d.state,
            zipCode: d.zip_code,
            status: "draft",
            source: "csv_import",
          })
          .returning({ id: inventory.id });
        await setFeaturesFromCsv(rv.id, d.features);
        results.push({ row: rowNumber, stockNumber: d.stock_number, status: "created" });
        created += 1;
      }
    } catch (err) {
      results.push({
        row: rowNumber,
        stockNumber: d.stock_number,
        status: "error",
        message: err instanceof Error ? err.message : "Unknown error",
      });
      errors += 1;
    }
  }

  await logAudit({
    action: "inventory.csv_import",
    entityType: "dealership",
    entityId: dealershipId,
    dealershipId,
    metadata: { totalRows: records.length, created, updated, errors },
  });

  revalidatePath("/dealer/inventory");

  return { totalRows: records.length, created, updated, errors, rows: results };
}

async function setFeaturesFromCsv(inventoryId: string, featuresCsv: string | undefined) {
  if (!featuresCsv) return;
  await db.delete(inventoryFeatures).where(eq(inventoryFeatures.inventoryId, inventoryId));
  const features = featuresCsv
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);
  if (features.length) {
    await db.insert(inventoryFeatures).values(features.map((feature) => ({ inventoryId, feature })));
  }
}
