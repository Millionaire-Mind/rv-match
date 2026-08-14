"use server";

import { parse } from "csv-parse/sync";

import { requireDealerRole } from "@/server/auth/guards";
import { MANAGEMENT_ROLES } from "@/server/dealer/permissions";
import { csvRowSchema, unrecognizedBooleanWarning } from "@/server/validation/inventory";
import { upsertInventoryRow } from "@/server/dealer/inventory-upsert";
import { logAudit } from "@/server/audit/log";
import { logError } from "@/server/logging/log";
import { revalidatePath } from "next/cache";

export interface CsvImportRowResult {
  row: number;
  stockNumber?: string;
  status: "created" | "updated" | "error";
  message?: string;
  /** Non-fatal issues - the row still imported successfully. Empty when there are none. */
  warnings: string[];
}

export interface CsvImportReport {
  totalRows: number;
  created: number;
  updated: number;
  /** Count of rows that imported successfully but with at least one non-fatal warning. */
  warnings: number;
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
    return { totalRows: 0, created: 0, updated: 0, warnings: 0, errors: 0, rows: [] };
  }

  const text = await file.text();
  let records: Record<string, string>[];
  try {
    records = parse(text, { columns: true, skip_empty_lines: true, trim: true });
  } catch (err) {
    logError("dealer.csv_import.parse", err, { dealershipId });
    return {
      totalRows: 0,
      created: 0,
      updated: 0,
      warnings: 0,
      errors: 1,
      rows: [{ row: 0, status: "error", message: `Could not parse CSV: ${(err as Error).message}`, warnings: [] }],
    };
  }

  const results: CsvImportRowResult[] = [];
  let created = 0;
  let updated = 0;
  let warningRows = 0;
  let errors = 0;

  for (let i = 0; i < records.length; i++) {
    const rowNumber = i + 2; // +1 for header row, +1 for 1-indexing
    const parsed = csvRowSchema.safeParse(records[i]);
    if (!parsed.success) {
      results.push({
        row: rowNumber,
        stockNumber: records[i].stock_number,
        status: "error",
        message: parsed.error.issues.map((iss) => `${iss.path.join(".")}: ${iss.message}`).join("; "),
        warnings: [],
      });
      errors += 1;
      continue;
    }

    try {
      const result = await upsertInventoryRow(dealershipId, parsed.data, "csv_import");
      const rawWarnings = [
        unrecognizedBooleanWarning("bunkhouse", records[i].bunkhouse),
        unrecognizedBooleanWarning("toy_hauler", records[i].toy_hauler),
        unrecognizedBooleanWarning("outdoor_kitchen", records[i].outdoor_kitchen),
      ].filter((w): w is string => w !== null);
      const warnings = [...result.warnings, ...rawWarnings];
      results.push({ row: rowNumber, stockNumber: parsed.data.stock_number, status: result.action, warnings });
      if (result.action === "created") created += 1;
      else updated += 1;
      if (warnings.length > 0) warningRows += 1;
    } catch (err) {
      logError("dealer.csv_import.row", err, { dealershipId, row: rowNumber });
      results.push({
        row: rowNumber,
        stockNumber: parsed.data.stock_number,
        status: "error",
        message: err instanceof Error ? err.message : "Unknown error",
        warnings: [],
      });
      errors += 1;
    }
  }

  await logAudit({
    action: "inventory.csv_import",
    entityType: "dealership",
    entityId: dealershipId,
    dealershipId,
    metadata: { totalRows: records.length, created, updated, warnings: warningRows, errors },
  });

  revalidatePath("/dealer/inventory");

  return { totalRows: records.length, created, updated, warnings: warningRows, errors, rows: results };
}
