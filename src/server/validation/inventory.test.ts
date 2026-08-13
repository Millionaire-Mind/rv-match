import { describe, expect, it } from "vitest";

import { csvRowSchema } from "./inventory";

const validRow = {
  stock_number: "RV-1001",
  year: "2024",
  make: "Forest River",
  model: "Rockwood",
  rv_type: "travel_trailer",
  condition: "new",
  sale_price: "38900",
  bunkhouse: "true",
  outdoor_kitchen: "true",
};

describe("csvRowSchema", () => {
  it("accepts a well-formed row", () => {
    const result = csvRowSchema.safeParse(validRow);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.year).toBe(2024);
      expect(result.data.sale_price).toBe(38900);
      expect(result.data.bunkhouse).toBe(true);
    }
  });

  it("rejects a row missing a required field (stock_number)", () => {
    const rest: Record<string, string> = { ...validRow };
    delete rest.stock_number;
    const result = csvRowSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects an invalid rv_type value instead of silently coercing it", () => {
    const result = csvRowSchema.safeParse({ ...validRow, rv_type: "spaceship" });
    expect(result.success).toBe(false);
  });

  it("rejects a non-numeric sale_price", () => {
    const result = csvRowSchema.safeParse({ ...validRow, sale_price: "not-a-number" });
    expect(result.success).toBe(false);
  });

  it("rejects a year far outside any plausible RV model year", () => {
    const result = csvRowSchema.safeParse({ ...validRow, year: "1899" });
    expect(result.success).toBe(false);
  });

  it("treats optional fields as genuinely optional", () => {
    const result = csvRowSchema.safeParse(validRow);
    expect(result.success).toBe(true);
  });

  it("parses the literal string \"false\" as false, not as JS-truthy true", () => {
    // z.coerce.boolean() would get this wrong: Boolean("false") is true in
    // plain JS, since any non-empty string is truthy. A dealer's CSV/feed
    // writing "false" explicitly must import as false.
    const result = csvRowSchema.safeParse({
      ...validRow,
      bunkhouse: "false",
      toy_hauler: "false",
      outdoor_kitchen: "false",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.bunkhouse).toBe(false);
      expect(result.data.toy_hauler).toBe(false);
      expect(result.data.outdoor_kitchen).toBe(false);
    }
  });

  it("treats a blank cell as false and an unrecognized value as false, not true", () => {
    const blank = csvRowSchema.safeParse({ ...validRow, bunkhouse: "" });
    expect(blank.success && blank.data.bunkhouse).toBe(false);

    const garbage = csvRowSchema.safeParse({ ...validRow, bunkhouse: "maybe" });
    expect(garbage.success && garbage.data.bunkhouse).toBe(false);
  });

  it("accepts common truthy tokens case-insensitively", () => {
    for (const token of ["true", "TRUE", "1", "yes", "Y"]) {
      const result = csvRowSchema.safeParse({ ...validRow, bunkhouse: token });
      expect(result.success && result.data.bunkhouse).toBe(true);
    }
  });
});
