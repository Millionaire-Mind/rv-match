import { z } from "zod";

import { rvConditionSchema, rvTypeSchema } from "./enums";

/**
 * A raw CSV/feed cell's string value, coerced to a real boolean. Not
 * z.coerce.boolean(): that calls JS's Boolean(), which is true for *any*
 * non-empty string - including the literal text "false" - so a dealer's
 * feed explicitly writing "false" would silently import as true. Only
 * recognizable truthy tokens count as true; everything else (including a
 * blank cell) is false.
 */
const TRUTHY_TOKENS = ["true", "1", "yes", "y"];
const FALSY_TOKENS = ["false", "0", "no", "n"];

const csvBooleanSchema = z
  .string()
  .transform((v) => TRUTHY_TOKENS.includes(v.trim().toLowerCase()))
  .optional();

/**
 * Gap 7: a boolean-ish CSV/feed cell (bunkhouse/toy_hauler/outdoor_kitchen)
 * that's non-blank but neither a recognized truthy nor falsy token (e.g. a
 * dealer feed writing "TBD" or "call for details") silently becomes false
 * via csvBooleanSchema above - correct for import to keep proceeding, but
 * worth surfacing as a non-fatal warning rather than a silent data loss.
 */
export function unrecognizedBooleanWarning(column: string, rawValue: string | undefined): string | null {
  if (!rawValue) return null;
  const normalized = rawValue.trim().toLowerCase();
  if (!normalized) return null;
  if (TRUTHY_TOKENS.includes(normalized) || FALSY_TOKENS.includes(normalized)) return null;
  return `Unrecognized value "${rawValue}" for "${column}" — treated as No. Use true/false, yes/no, 1/0, or y/n.`;
}

export const inventoryFormSchema = z.object({
  stockNumber: z.string().trim().min(1, "Stock number is required.").max(64),
  vin: z.string().trim().max(32).optional(),
  year: z.coerce.number().int().min(1980).max(2100),
  make: z.string().trim().min(1, "Make is required.").max(100),
  brand: z.string().trim().min(1, "Brand is required.").max(100),
  model: z.string().trim().min(1, "Model is required.").max(100),
  floorplan: z.string().trim().max(100).optional(),
  rvType: rvTypeSchema,
  condition: rvConditionSchema,
  msrp: z.coerce.number().nonnegative().max(10_000_000).optional(),
  salePrice: z.coerce.number().positive("Sale price is required.").max(10_000_000),
  advertisedPrice: z.coerce.number().nonnegative().max(10_000_000).optional(),
  lengthFeet: z.coerce.number().positive().max(100).optional(),
  widthInches: z.coerce.number().positive().max(200).optional(),
  heightInches: z.coerce.number().positive().max(300).optional(),
  dryWeightLbs: z.coerce.number().nonnegative().max(100_000).optional(),
  gvwrLbs: z.coerce.number().nonnegative().max(100_000).optional(),
  hitchWeightLbs: z.coerce.number().nonnegative().max(100_000).optional(),
  sleeps: z.coerce.number().int().nonnegative().max(50).optional(),
  slideCount: z.coerce.number().int().nonnegative().max(20).optional(),
  bedConfiguration: z.string().trim().max(100).optional(),
  bunkhouse: z.boolean().default(false),
  toyHauler: z.boolean().default(false),
  outdoorKitchen: z.boolean().default(false),
  exteriorColor: z.string().trim().max(100).optional(),
  interior: z.string().trim().max(100).optional(),
  description: z.string().trim().max(4000).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(2).optional(),
  zipCode: z.string().trim().max(10).optional(),
  features: z.string().trim().max(2000).optional(), // comma-separated in the form
  canonicalUrl: z.union([z.string().trim().url("Enter a valid URL."), z.literal("")]).optional(),
});

export type InventoryFormInput = z.infer<typeof inventoryFormSchema>;

export const csvRowSchema = z.object({
  stock_number: z.string().trim().min(1),
  vin: z.string().trim().optional(),
  year: z.coerce.number().int().min(1980).max(2100),
  make: z.string().trim().min(1),
  // Optional here (unlike the manual dealer form) so a bulk CSV/feed
  // import from a dealer whose source system doesn't yet map a brand
  // column still succeeds - Gap 7's warnings channel flags its absence
  // as a non-fatal "missing optional field" warning instead.
  brand: z.string().trim().optional(),
  model: z.string().trim().min(1),
  floorplan: z.string().trim().optional(),
  rv_type: rvTypeSchema,
  condition: rvConditionSchema,
  msrp: z.coerce.number().nonnegative().max(10_000_000).optional(),
  sale_price: z.coerce.number().positive().max(10_000_000),
  advertised_price: z.coerce.number().nonnegative().max(10_000_000).optional(),
  length_feet: z.coerce.number().positive().max(100).optional(),
  width_inches: z.coerce.number().positive().max(200).optional(),
  height_inches: z.coerce.number().positive().max(300).optional(),
  dry_weight_lbs: z.coerce.number().nonnegative().max(100_000).optional(),
  gvwr_lbs: z.coerce.number().nonnegative().max(100_000).optional(),
  hitch_weight_lbs: z.coerce.number().nonnegative().max(100_000).optional(),
  sleeps: z.coerce.number().int().nonnegative().max(50).optional(),
  slide_count: z.coerce.number().int().nonnegative().max(20).optional(),
  bed_configuration: z.string().trim().optional(),
  bunkhouse: csvBooleanSchema,
  toy_hauler: csvBooleanSchema,
  outdoor_kitchen: csvBooleanSchema,
  exterior_color: z.string().trim().optional(),
  interior: z.string().trim().optional(),
  description: z.string().trim().optional(),
  city: z.string().trim().optional(),
  state: z.string().trim().optional(),
  zip_code: z.string().trim().optional(),
  features: z.string().trim().optional(),
  canonical_url: z.string().trim().optional(),
});

export type CsvRowInput = z.infer<typeof csvRowSchema>;

export const feedSourceSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(200),
  format: z.enum(["csv", "json", "xml"]),
  url: z.string().trim().url("Enter a valid URL."),
  fieldMapping: z.record(z.string(), z.string()).default({}),
  recordPath: z.string().trim().max(200).optional(),
  refreshIntervalMinutes: z.coerce.number().int().positive().max(10_080).optional(), // 1 week
});
export type FeedSourceInput = z.infer<typeof feedSourceSchema>;

export const CSV_TEMPLATE_HEADERS = [
  "stock_number",
  "vin",
  "year",
  "make",
  "brand",
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
  "canonical_url",
] as const;
