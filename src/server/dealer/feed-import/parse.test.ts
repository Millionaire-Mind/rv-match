import { describe, expect, it } from "vitest";

import { applyFieldMapping, parseFeedText, validateMappedRows } from "./parse";

const baseRow = {
  StockNum: "RV-1",
  Yr: "2024",
  Mfr: "Forest River",
  Mdl: "Rockwood",
  Type: "travel_trailer",
  Cond: "new",
  Price: "35000",
};
const mapping = {
  stock_number: "StockNum",
  year: "Yr",
  make: "Mfr",
  model: "Mdl",
  rv_type: "Type",
  condition: "Cond",
  sale_price: "Price",
};

describe("parseFeedText", () => {
  it("parses CSV rows", () => {
    const csv = "StockNum,Yr,Mfr,Mdl\nRV-1,2024,Forest River,Rockwood";
    const rows = parseFeedText("csv", csv, null);
    expect(rows).toEqual([{ StockNum: "RV-1", Yr: "2024", Mfr: "Forest River", Mdl: "Rockwood" }]);
  });

  it("parses a JSON array at the root when no record path is given", () => {
    const json = JSON.stringify([baseRow]);
    const rows = parseFeedText("json", json, null);
    expect(rows).toEqual([expect.objectContaining({ StockNum: "RV-1" })]);
  });

  it("locates the record array via a JSON record path", () => {
    const json = JSON.stringify({ vehicles: [baseRow] });
    const rows = parseFeedText("json", json, "vehicles");
    expect(rows).toEqual([expect.objectContaining({ StockNum: "RV-1" })]);
  });

  it("auto-detects a single array-valued top-level key in JSON with no record path", () => {
    const json = JSON.stringify({ vehicles: [baseRow] });
    const rows = parseFeedText("json", json, undefined);
    expect(rows).toHaveLength(1);
  });

  it("throws a clear error when a JSON record path doesn't resolve to a list", () => {
    const json = JSON.stringify({ foo: "bar" });
    expect(() => parseFeedText("json", json, "missing.path")).toThrow();
  });

  it("parses XML rows via a record path", () => {
    const xml = `<Inventory><Vehicle><StockNum>RV-1</StockNum><Mfr>Forest River</Mfr></Vehicle><Vehicle><StockNum>RV-2</StockNum><Mfr>Jayco</Mfr></Vehicle></Inventory>`;
    const rows = parseFeedText("xml", xml, "Inventory.Vehicle");
    expect(rows).toHaveLength(2);
    expect(rows[0].StockNum).toBe("RV-1");
    expect(rows[1].Mfr).toBe("Jayco");
  });

  it("wraps a single XML vehicle (not an array when there's only one) into an array of one", () => {
    const xml = `<Inventory><Vehicle><StockNum>RV-1</StockNum></Vehicle></Inventory>`;
    const rows = parseFeedText("xml", xml, "Inventory.Vehicle");
    expect(rows).toHaveLength(1);
    expect(rows[0].StockNum).toBe("RV-1");
  });
});

describe("applyFieldMapping + validateMappedRows", () => {
  it("remaps a feed's own field names to canonical names and validates successfully", () => {
    const mapped = applyFieldMapping([baseRow], mapping);
    const validated = validateMappedRows(mapped);
    expect(validated[0].valid).toBe(true);
    expect(validated[0].data?.stock_number).toBe("RV-1");
    expect(validated[0].data?.year).toBe(2024);
  });

  it("falls back to the canonical name itself when no mapping entry exists for it", () => {
    const rowAlreadyCanonical = {
      stock_number: "RV-2",
      year: "2023",
      make: "Jayco",
      model: "Eagle",
      rv_type: "fifth_wheel",
      condition: "used",
      sale_price: "42000",
    };
    const mapped = applyFieldMapping([rowAlreadyCanonical], {});
    const validated = validateMappedRows(mapped);
    expect(validated[0].valid).toBe(true);
    expect(validated[0].data?.make).toBe("Jayco");
  });

  it("reports a per-row validation error without throwing, for a row a stricter type would reject", () => {
    const badRow = { ...baseRow, Price: "not-a-number" };
    const mapped = applyFieldMapping([badRow], mapping);
    const validated = validateMappedRows(mapped);
    expect(validated[0].valid).toBe(false);
    expect(validated[0].errors).toMatch(/sale_price/);
  });

  it("correctly parses the string \"false\" as false through the feed pipeline (not JS-truthy true)", () => {
    const row = { ...baseRow, bunkhouse: "false" };
    const mapped = applyFieldMapping([row], mapping);
    const validated = validateMappedRows(mapped);
    expect(validated[0].valid).toBe(true);
    expect(validated[0].data?.bunkhouse).toBe(false);
  });
});
