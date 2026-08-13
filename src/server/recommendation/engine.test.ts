import { describe, expect, it } from "vitest";

import { distanceScore, type ConsumerContext } from "./engine";

const DENVER = { lat: "39.74", lng: "-104.99" };
const nearDenver: ConsumerContext = { lat: 39.75, lng: -105.0, radiusMiles: 100 };
const tampaConsumer: ConsumerContext = { lat: 27.95, lng: -82.46, radiusMiles: 100 };

describe("distanceScore (radius/distance filtering)", () => {
  it("treats an RV within the consumer's radius as eligible", () => {
    const result = distanceScore(DENVER, nearDenver, 60);
    expect(result.withinRadius).toBe(true);
    expect(result.miles).not.toBeNull();
    expect(result.miles!).toBeLessThan(10);
  });

  it("excludes an RV far outside the consumer's radius", () => {
    const result = distanceScore(DENVER, tampaConsumer, 60);
    expect(result.withinRadius).toBe(false);
    expect(result.miles!).toBeGreaterThan(tampaConsumer.radiusMiles);
  });

  it("respects a widened radius for the same distance", () => {
    const narrow = distanceScore(DENVER, { ...tampaConsumer, radiusMiles: 100 }, 60);
    const wide = distanceScore(DENVER, { ...tampaConsumer, radiusMiles: 5000 }, 60);
    expect(narrow.withinRadius).toBe(false);
    expect(wide.withinRadius).toBe(true);
  });

  it("scores closer RVs higher than farther ones", () => {
    const close = distanceScore(DENVER, nearDenver, 60);
    const far = distanceScore(DENVER, tampaConsumer, 60);
    expect(close.score).toBeGreaterThan(far.score);
  });

  it("does NOT count an RV with unknown coordinates as within a consumer's set radius (Phase 7: honest geography)", () => {
    const noLocationRv = { lat: null, lng: null };
    const result = distanceScore(noLocationRv, nearDenver, 60);
    expect(result.withinRadius).toBe(false);
    expect(result.miles).toBeNull();
  });

  it("treats a consumer with no location set as neutral", () => {
    const noLocationConsumer: ConsumerContext = { lat: null, lng: null, radiusMiles: 100 };
    const result = distanceScore(DENVER, noLocationConsumer, 60);
    expect(result.withinRadius).toBe(true);
    expect(result.miles).toBeNull();
  });
});
