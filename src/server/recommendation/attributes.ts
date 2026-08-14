import type { inventory } from "@/server/db/schema";

export type InventoryRow = typeof inventory.$inferSelect;

export interface PreferenceAttribute {
  attribute: string;
  value: string;
}

function priceBand(cents: number): string {
  const dollars = cents / 100;
  const bandSize = 10000;
  const lower = Math.floor(dollars / bandSize) * bandSize;
  return `${lower}-${lower + bandSize}`;
}

function lengthBand(inches: number | null): string | null {
  if (!inches) return null;
  const feet = inches / 12;
  const lower = Math.floor(feet / 6) * 6;
  return `${lower}-${lower + 6}ft`;
}

function sleepsBand(sleeps: number | null): string | null {
  if (!sleeps) return null;
  if (sleeps <= 2) return "1-2";
  if (sleeps <= 4) return "3-4";
  if (sleeps <= 6) return "5-6";
  if (sleeps <= 8) return "7-8";
  return "9+";
}

/**
 * The taxonomy of learnable attributes for a given RV. Every swipe/behavior
 * signal touches these attribute-value pairs in `consumer_preferences`.
 * Boolean amenity flags only emit a positive-presence signal (e.g.
 * `bunkhouse=yes`) — absence isn't recorded as its own value, so a pass on
 * a bunkhouse naturally drags down "bunkhouse=yes" without us having to
 * invent a "bunkhouse=no" taxonomy value.
 */
export function attributesForInventory(rv: InventoryRow): PreferenceAttribute[] {
  const attrs: PreferenceAttribute[] = [
    { attribute: "rv_type", value: rv.rvType },
    { attribute: "make", value: rv.make },
    { attribute: "condition", value: rv.condition },
    { attribute: "price_band", value: priceBand(rv.advertisedPriceCents ?? rv.salePriceCents) },
    { attribute: "dealer", value: rv.dealershipId },
  ];

  if (rv.brand) attrs.push({ attribute: "brand", value: rv.brand });
  if (rv.floorplan) attrs.push({ attribute: "floorplan", value: rv.floorplan });

  const lb = lengthBand(rv.lengthInches);
  if (lb) attrs.push({ attribute: "length_band", value: lb });

  const sb = sleepsBand(rv.sleeps);
  if (sb) attrs.push({ attribute: "sleeps_band", value: sb });

  if (rv.bunkhouse) attrs.push({ attribute: "bunkhouse", value: "yes" });
  if (rv.toyHauler) attrs.push({ attribute: "toy_hauler", value: "yes" });
  if (rv.outdoorKitchen) attrs.push({ attribute: "outdoor_kitchen", value: "yes" });
  if (rv.slideCount && rv.slideCount > 0) {
    attrs.push({ attribute: "slide_count", value: rv.slideCount >= 3 ? "3+" : String(rv.slideCount) });
  }

  return attrs;
}
