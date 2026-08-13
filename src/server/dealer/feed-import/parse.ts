import { parse as parseCsv } from "csv-parse/sync";
import { XMLParser } from "fast-xml-parser";

import { csvRowSchema, type CsvRowInput } from "@/server/validation/inventory";

export type FeedFormat = "csv" | "json" | "xml";

/** The canonical field names csv_row_schema (and therefore upsertInventoryRow) validates against - what a dealer's field_mapping maps *to*. */
export const CANONICAL_FEED_FIELDS = [
  "stock_number",
  "vin",
  "year",
  "make",
  "model",
  "floorplan",
  "rv_type",
  "condition",
  "msrp",
  "sale_price",
  "advertised_price",
  "length_feet",
  "width_inches",
  "height_inches",
  "dry_weight_lbs",
  "gvwr_lbs",
  "hitch_weight_lbs",
  "sleeps",
  "slide_count",
  "bed_configuration",
  "bunkhouse",
  "toy_hauler",
  "outdoor_kitchen",
  "exterior_color",
  "interior",
  "description",
  "city",
  "state",
  "zip_code",
  "features",
] as const;

/** Walks a dot-separated path ("Inventory.Vehicle") into a parsed JSON/XML object to find the array of per-vehicle records. */
function locateArray(root: unknown, recordPath: string | null | undefined): unknown[] {
  if (!recordPath) {
    if (Array.isArray(root)) return root;
    if (root && typeof root === "object") {
      const arrayValuedKeys = Object.entries(root as Record<string, unknown>).filter(([, v]) => Array.isArray(v));
      if (arrayValuedKeys.length === 1) return arrayValuedKeys[0][1] as unknown[];
    }
    throw new Error(
      "Could not automatically find the list of vehicles in this feed. Set a record path (e.g. \"vehicles\" or \"Inventory.Vehicle\") in the feed source settings.",
    );
  }

  let node: unknown = root;
  for (const segment of recordPath.split(".").filter(Boolean)) {
    if (!node || typeof node !== "object") {
      throw new Error(`Record path "${recordPath}" does not exist in this feed.`);
    }
    node = (node as Record<string, unknown>)[segment];
  }
  if (Array.isArray(node)) return node;
  if (node && typeof node === "object") return [node]; // a feed with exactly one vehicle often isn't wrapped in an array
  throw new Error(`Record path "${recordPath}" did not resolve to a list of vehicles.`);
}

/** Every value stringified so CSV, JSON, and XML feeds all feed the same string-based csvRowSchema regardless of the source's native types (JSON booleans/numbers vs. XML/CSV text). */
function stringifyRow(row: unknown): Record<string, string> {
  if (!row || typeof row !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
    if (value === null || value === undefined) continue;
    out[key] = typeof value === "object" ? JSON.stringify(value) : String(value);
  }
  return out;
}

/** Parses raw feed text into an array of flat, string-valued rows, still keyed by the *feed's own* field names - mapping to our canonical names happens separately in applyFieldMapping. */
export function parseFeedText(
  format: FeedFormat,
  text: string,
  recordPath: string | null | undefined,
): Record<string, string>[] {
  if (format === "csv") {
    const records: Record<string, string>[] = parseCsv(text, { columns: true, skip_empty_lines: true, trim: true });
    return records;
  }

  if (format === "json") {
    const parsed: unknown = JSON.parse(text);
    return locateArray(parsed, recordPath).map(stringifyRow);
  }

  // xml
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  const parsed: unknown = parser.parse(text);
  return locateArray(parsed, recordPath).map(stringifyRow);
}

export interface MappedRow {
  raw: Record<string, string>;
  canonical: Record<string, string>;
}

/**
 * Remaps a feed's own field names to our canonical csv_row_schema names.
 * A canonical field with no mapping entry falls back to the feed already
 * using that exact name (common when a dealer's feed happens to already
 * match our headers) so a partial mapping - or none at all for a feed
 * that already speaks our vocabulary - still works.
 */
export function applyFieldMapping(
  rows: Record<string, string>[],
  fieldMapping: Record<string, string>,
): MappedRow[] {
  return rows.map((raw) => {
    const canonical: Record<string, string> = {};
    for (const field of CANONICAL_FEED_FIELDS) {
      const sourceKey = fieldMapping[field] || field;
      const value = raw[sourceKey];
      if (value !== undefined) canonical[field] = value;
    }
    return { raw, canonical };
  });
}

export interface FeedRowValidation {
  raw: Record<string, string>;
  valid: boolean;
  data?: CsvRowInput;
  errors?: string;
}

export function validateMappedRows(rows: MappedRow[]): FeedRowValidation[] {
  return rows.map(({ raw, canonical }) => {
    const parsed = csvRowSchema.safeParse(canonical);
    if (parsed.success) return { raw, valid: true, data: parsed.data };
    return {
      raw,
      valid: false,
      errors: parsed.error.issues.map((iss) => `${iss.path.join(".")}: ${iss.message}`).join("; "),
    };
  });
}
