import { describe, expect, it } from "vitest";

import { leadFormSchema } from "./leads";

const base = {
  inventoryId: "123e4567-e89b-12d3-a456-426614174000",
  ctaType: "check_availability" as const,
  name: "Jamie Rivera",
  preferredContact: "email" as const,
  consent: true,
};

describe("leadFormSchema", () => {
  it("accepts a valid lead with an email", () => {
    const result = leadFormSchema.safeParse({ ...base, email: "jamie@example.com" });
    expect(result.success).toBe(true);
  });

  it("accepts a valid lead with only a phone number", () => {
    const result = leadFormSchema.safeParse({ ...base, phone: "555-123-4567" });
    expect(result.success).toBe(true);
  });

  it("rejects a lead with neither email nor phone", () => {
    const result = leadFormSchema.safeParse({ ...base });
    expect(result.success).toBe(false);
  });

  it("rejects a lead without consent, even with valid contact info", () => {
    const result = leadFormSchema.safeParse({ ...base, email: "jamie@example.com", consent: false });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed email", () => {
    const result = leadFormSchema.safeParse({ ...base, email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid inventoryId (not a UUID)", () => {
    const result = leadFormSchema.safeParse({ ...base, inventoryId: "abc", email: "jamie@example.com" });
    expect(result.success).toBe(false);
  });
});
