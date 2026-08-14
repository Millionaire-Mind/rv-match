import { describe, expect, it } from "vitest";

import { searchFiltersSchema } from "./search";

describe("searchFiltersSchema bounds", () => {
  it("accepts realistic filter values", () => {
    const result = searchFiltersSchema.safeParse({
      priceMin: "20000",
      priceMax: "80000",
      lengthMinFeet: "20",
      lengthMaxFeet: "35",
      sleepsMin: "6",
      dryWeightMaxLbs: "9000",
      radiusMiles: "250",
    });
    expect(result.success).toBe(true);
  });

  it("rejects physically implausible unbounded values", () => {
    expect(searchFiltersSchema.safeParse({ priceMax: "999999999999" }).success).toBe(false);
    expect(searchFiltersSchema.safeParse({ lengthMaxFeet: "99999" }).success).toBe(false);
    expect(searchFiltersSchema.safeParse({ sleepsMin: "9999" }).success).toBe(false);
    expect(searchFiltersSchema.safeParse({ dryWeightMaxLbs: "99999999" }).success).toBe(false);
    expect(searchFiltersSchema.safeParse({ radiusMiles: "999999999" }).success).toBe(false);
  });
});
