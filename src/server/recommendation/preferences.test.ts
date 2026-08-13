import { describe, expect, it } from "vitest";

import { normalizedAttributeScore } from "./preferences";

describe("normalizedAttributeScore", () => {
  it("returns 0 for an attribute with no observations", () => {
    expect(normalizedAttributeScore(undefined)).toBe(0);
  });

  it("dampens a single strong signal toward neutral (low confidence)", () => {
    const oneLove = normalizedAttributeScore({ score: 2, observations: 1 });
    const fiveLoves = normalizedAttributeScore({ score: 10, observations: 5 });
    // One observation should count for meaningfully less than a consistent
    // pattern across five, even though the per-observation score is similar.
    expect(oneLove).toBeGreaterThan(0);
    expect(oneLove).toBeLessThan(fiveLoves);
  });

  it("bounds the score to roughly [-1, 1] regardless of how large the raw score is", () => {
    const extreme = normalizedAttributeScore({ score: 1000, observations: 50 });
    expect(extreme).toBeLessThanOrEqual(1);
    expect(extreme).toBeGreaterThan(0.9);
  });

  it("produces a negative score for a consistently disliked attribute", () => {
    const disliked = normalizedAttributeScore({ score: -8, observations: 5 });
    expect(disliked).toBeLessThan(0);
  });

  it("full confidence (5+ observations) is reached at 5 and does not keep growing", () => {
    const five = normalizedAttributeScore({ score: 5, observations: 5 });
    const ten = normalizedAttributeScore({ score: 5, observations: 10 });
    // Same raw score, more observations shouldn't change the bounded output
    // once confidence is already saturated.
    expect(five).toBeCloseTo(ten, 6);
  });
});
