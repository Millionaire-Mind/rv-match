import { z } from "zod";

import { rvConditionSchema, rvTypeSchema } from "./enums";

/**
 * "I Know What I Want" traditional search filters - the second consumer
 * browse path the original spec explicitly requires alongside the swipe
 * feed, not a replacement for it. All fields optional; an empty filter set
 * returns every video-eligible published RV (see discoveryEligible()).
 */
export const searchFiltersSchema = z.object({
  rvType: rvTypeSchema.optional(),
  make: z.string().trim().min(1).max(100).optional(),
  model: z.string().trim().min(1).max(100).optional(),
  floorplan: z.string().trim().min(1).max(100).optional(),
  yearMin: z.coerce.number().int().min(1970).max(2100).optional(),
  yearMax: z.coerce.number().int().min(1970).max(2100).optional(),
  condition: rvConditionSchema.optional(),
  priceMin: z.coerce.number().nonnegative().optional(),
  priceMax: z.coerce.number().nonnegative().optional(),
  lengthMinFeet: z.coerce.number().nonnegative().optional(),
  lengthMaxFeet: z.coerce.number().nonnegative().optional(),
  sleepsMin: z.coerce.number().int().nonnegative().optional(),
  dryWeightMaxLbs: z.coerce.number().nonnegative().optional(),
  bunkhouse: z.coerce.boolean().optional(),
  toyHauler: z.coerce.boolean().optional(),
  outdoorKitchen: z.coerce.boolean().optional(),
  dealershipId: z.uuid().optional(),
  radiusMiles: z.coerce.number().positive().optional(),
  zipCode: z.string().trim().max(10).optional(),
  sort: z.enum(["relevance", "price_asc", "price_desc", "newest"]).default("newest"),
});

export type SearchFilters = z.infer<typeof searchFiltersSchema>;

/** Parses filters out of URLSearchParams (the search page's source of truth is the URL, so results are shareable/bookmarkable). */
export function parseSearchParams(params: URLSearchParams): SearchFilters {
  const raw: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    if (value) raw[key] = value;
  }
  const parsed = searchFiltersSchema.safeParse(raw);
  return parsed.success ? parsed.data : { sort: "newest" };
}
