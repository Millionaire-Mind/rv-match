import { describe, expect, it } from "vitest";

import { attributesForInventory, type InventoryRow } from "./attributes";

function makeRv(overrides: Partial<InventoryRow>): InventoryRow {
  return {
    id: "rv-1",
    dealershipId: "dealer-1",
    stockNumber: "STK-1",
    vin: null,
    year: 2024,
    make: "Forest River",
    brand: "Rockwood",
    model: "Rockwood Mini Lite",
    floorplan: "2715S",
    rvType: "travel_trailer",
    condition: "new",
    msrpCents: 4490000,
    salePriceCents: 3890000,
    advertisedPriceCents: null,
    lengthInches: 372,
    widthInches: null,
    heightInches: null,
    dryWeightLbs: 6100,
    gvwrLbs: 7800,
    hitchWeightLbs: null,
    sleeps: 6,
    slideCount: 1,
    bedConfiguration: null,
    bunkhouse: true,
    toyHauler: false,
    outdoorKitchen: true,
    exteriorColor: null,
    interior: null,
    description: null,
    city: null,
    state: null,
    zipCode: null,
    lat: null,
    lng: null,
    status: "published",
    source: "manual",
    canonicalUrl: null,
    primaryPhotoId: null,
    primaryVideoId: null,
    dateAdded: new Date(),
    dateSold: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as InventoryRow;
}

describe("attributesForInventory", () => {
  it("always includes the core taxonomy attributes", () => {
    const attrs = attributesForInventory(makeRv({}));
    const keys = attrs.map((a) => a.attribute);
    expect(keys).toContain("rv_type");
    expect(keys).toContain("make");
    expect(keys).toContain("brand");
    expect(keys).toContain("condition");
    expect(keys).toContain("price_band");
    expect(keys).toContain("dealer");
  });

  it("omits the brand attribute when brand is null", () => {
    const attrs = attributesForInventory(makeRv({ brand: null }));
    expect(attrs.map((a) => a.attribute)).not.toContain("brand");
  });

  it("uses the advertised price over sale price for the price band when present", () => {
    const attrs = attributesForInventory(makeRv({ salePriceCents: 4890000, advertisedPriceCents: 3500000 }));
    const priceBand = attrs.find((a) => a.attribute === "price_band");
    // Advertised price ($35,000) should win over sale price ($48,900),
    // landing in the 30000-40000 band rather than 40000-50000.
    expect(priceBand?.value).toBe("30000-40000");
  });

  it("only emits boolean amenity attributes when true", () => {
    const withAmenities = attributesForInventory(
      makeRv({ bunkhouse: true, toyHauler: true, outdoorKitchen: true }),
    );
    expect(withAmenities.map((a) => a.attribute)).toEqual(
      expect.arrayContaining(["bunkhouse", "toy_hauler", "outdoor_kitchen"]),
    );

    const withoutAmenities = attributesForInventory(
      makeRv({ bunkhouse: false, toyHauler: false, outdoorKitchen: false }),
    );
    expect(withoutAmenities.map((a) => a.attribute)).not.toEqual(
      expect.arrayContaining(["bunkhouse", "toy_hauler", "outdoor_kitchen"]),
    );
  });

  it("omits floorplan/length/sleeps attributes when the data is missing", () => {
    const attrs = attributesForInventory(makeRv({ floorplan: null, lengthInches: null, sleeps: null }));
    const keys = attrs.map((a) => a.attribute);
    expect(keys).not.toContain("floorplan");
    expect(keys).not.toContain("length_band");
    expect(keys).not.toContain("sleeps_band");
  });

  it("buckets length into 6-foot bands", () => {
    const attrs = attributesForInventory(makeRv({ lengthInches: 32 * 12 })); // 32 ft
    const lengthBand = attrs.find((a) => a.attribute === "length_band");
    expect(lengthBand?.value).toBe("30-36ft");
  });
});
