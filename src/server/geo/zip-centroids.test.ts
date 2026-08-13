import { describe, expect, it } from "vitest";

import { geocodeZip, haversineMiles } from "./zip-centroids";

describe("geocodeZip", () => {
  it("resolves a known ZIP3 prefix", () => {
    const result = geocodeZip("80202");
    expect(result).not.toBeNull();
    expect(result!.label).toContain("Denver");
  });

  it("falls back to the nearest known prefix for an unlisted ZIP", () => {
    // "802" is Denver; "803" isn't in the table but should resolve to a
    // nearby entry rather than returning null.
    const result = geocodeZip("80301");
    expect(result).not.toBeNull();
  });

  it("returns null for input too short to be a ZIP", () => {
    expect(geocodeZip("12")).toBeNull();
  });
});

describe("haversineMiles", () => {
  it("returns 0 for identical points", () => {
    const point = { lat: 39.74, lng: -104.99 };
    expect(haversineMiles(point, point)).toBeCloseTo(0, 5);
  });

  it("approximates the known Denver-to-Tampa distance", () => {
    const denver = { lat: 39.74, lng: -104.99 };
    const tampa = { lat: 27.95, lng: -82.46 };
    const miles = haversineMiles(denver, tampa);
    // Real-world great-circle distance is ~1580 miles; allow a wide but
    // meaningful tolerance since this guards against gross formula errors,
    // not precision.
    expect(miles).toBeGreaterThan(1400);
    expect(miles).toBeLessThan(1750);
  });

  it("is symmetric", () => {
    const a = { lat: 34.05, lng: -118.24 };
    const b = { lat: 40.71, lng: -74.0 };
    expect(haversineMiles(a, b)).toBeCloseTo(haversineMiles(b, a), 6);
  });
});
