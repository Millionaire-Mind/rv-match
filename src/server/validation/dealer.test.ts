import { describe, expect, it } from "vitest";

import { dealerApplicationSchema } from "./dealer";

const base = {
  dealershipName: "Pacific Coast RVs",
  addressLine1: "500 Ocean Ave",
  city: "San Diego",
  state: "CA",
  zipCode: "92101",
  phone: "555-222-3333",
  primaryContactName: "Alex Rivera",
  email: "alex@pacificcoastrvs.example",
  password: "supersecret1",
  agreement: true,
};

describe("dealerApplicationSchema", () => {
  it("accepts a complete, valid application", () => {
    expect(dealerApplicationSchema.safeParse(base).success).toBe(true);
  });

  it("rejects an application that doesn't accept the dealer agreement", () => {
    const result = dealerApplicationSchema.safeParse({ ...base, agreement: false });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid ZIP code", () => {
    const result = dealerApplicationSchema.safeParse({ ...base, zipCode: "ABCDE" });
    expect(result.success).toBe(false);
  });

  it("rejects a password shorter than the minimum length", () => {
    const result = dealerApplicationSchema.safeParse({ ...base, password: "short" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid website URL when provided", () => {
    const result = dealerApplicationSchema.safeParse({ ...base, website: "not a url" });
    expect(result.success).toBe(false);
  });

  it("allows omitting the optional website field", () => {
    const result = dealerApplicationSchema.safeParse({ ...base, website: "" });
    expect(result.success).toBe(true);
  });
});
