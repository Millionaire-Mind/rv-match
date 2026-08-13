import { describe, expect, it } from "vitest";

import { computePilotStatus, daysRemaining } from "./logic";

const DAY = 86400000;

describe("computePilotStatus", () => {
  it("stays pending until an admin approves, regardless of sales/time", () => {
    const status = computePilotStatus({
      verifiedSalesCount: 5,
      salesThreshold: 3,
      startedAt: new Date(Date.now() - 200 * DAY),
      trialDays: 90,
      storedStatus: "pending",
    });
    expect(status).toBe("pending");
  });

  it("stays suspended even if sales/time would otherwise convert it", () => {
    const status = computePilotStatus({
      verifiedSalesCount: 5,
      salesThreshold: 3,
      startedAt: new Date(),
      trialDays: 90,
      storedStatus: "suspended",
    });
    expect(status).toBe("suspended");
  });

  it("converts once verified sales meet the threshold, even with days remaining", () => {
    const status = computePilotStatus({
      verifiedSalesCount: 3,
      salesThreshold: 3,
      startedAt: new Date(),
      trialDays: 90,
      storedStatus: "active",
    });
    expect(status).toBe("converted");
  });

  it("does not convert on sales alone below the threshold", () => {
    const status = computePilotStatus({
      verifiedSalesCount: 2,
      salesThreshold: 3,
      startedAt: new Date(),
      trialDays: 90,
      storedStatus: "active",
    });
    expect(status).toBe("active");
  });

  it("moves to conversion_due once the trial window elapses without enough sales", () => {
    const status = computePilotStatus({
      verifiedSalesCount: 1,
      salesThreshold: 3,
      startedAt: new Date(Date.now() - 91 * DAY),
      trialDays: 90,
      storedStatus: "active",
    });
    expect(status).toBe("conversion_due");
  });

  it("prefers sales-threshold conversion over conversion_due when both conditions are met", () => {
    const status = computePilotStatus({
      verifiedSalesCount: 3,
      salesThreshold: 3,
      startedAt: new Date(Date.now() - 200 * DAY),
      trialDays: 90,
      storedStatus: "active",
    });
    expect(status).toBe("converted");
  });

  it("stays active with time and sales both remaining", () => {
    const status = computePilotStatus({
      verifiedSalesCount: 0,
      salesThreshold: 3,
      startedAt: new Date(Date.now() - 5 * DAY),
      trialDays: 90,
      storedStatus: "active",
    });
    expect(status).toBe("active");
  });
});

describe("daysRemaining", () => {
  it("counts down from trialDays as time elapses", () => {
    const startedAt = new Date(Date.now() - 30 * DAY);
    expect(daysRemaining(startedAt, 90)).toBe(60);
  });

  it("never goes negative once the trial has elapsed", () => {
    const startedAt = new Date(Date.now() - 200 * DAY);
    expect(daysRemaining(startedAt, 90)).toBe(0);
  });

  it("returns the full trial length at the very start", () => {
    const startedAt = new Date();
    expect(daysRemaining(startedAt, 90)).toBe(90);
  });
});
