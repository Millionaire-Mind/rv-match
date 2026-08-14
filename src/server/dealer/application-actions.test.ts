import { afterAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { dealerships, profiles } from "@/server/db/schema";

let currentToken: string | undefined;
let realIpHeader: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "rvm_auth" && currentToken ? { value: currentToken } : undefined),
    set: (name: string, value: string) => {
      if (name === "rvm_auth") currentToken = value;
    },
    delete: () => {
      currentToken = undefined;
    },
  }),
  headers: async () => ({
    get: (name: string) => (name === "x-real-ip" ? realIpHeader : undefined),
  }),
}));

const { submitDealerApplication } = await import("./application-actions");

const suffix = Date.now();
const createdUserIds: string[] = [];
const createdDealershipIds: string[] = [];

afterAll(async () => {
  for (const id of createdDealershipIds) await db.delete(dealerships).where(eq(dealerships.id, id));
  for (const id of createdUserIds) await db.delete(profiles).where(eq(profiles.id, id));
});

function formData(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const base: Record<string, string> = {
    dealershipName: `Test Dealership ${Date.now()}-${Math.random()}`,
    addressLine1: "123 Main St",
    city: "Denver",
    state: "CO",
    zipCode: "80202",
    phone: "3035551234",
    primaryContactName: "Test Owner",
    email: `dealer-apply-${Date.now()}-${Math.random()}@example.com`,
    password: "TestPassword123!",
    agreement: "on",
  };
  for (const [k, v] of Object.entries({ ...base, ...overrides })) fd.set(k, v);
  return fd;
}

describe("submitDealerApplication rate limiting", () => {
  it("blocks further applications from the same IP after the threshold", async () => {
    realIpHeader = `203.0.113.${(suffix + 2) % 200}`;

    for (let i = 0; i < 5; i++) {
      const email = `dealer-apply-${suffix}-${i}@example.com`;
      const result = await submitDealerApplication({ ok: false, error: "" }, formData({ email }));
      expect(result.ok).toBe(true);

      const [user] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.email, email));
      if (user) createdUserIds.push(user.id);
      const [dealership] = await db
        .select({ id: dealerships.id })
        .from(dealerships)
        .where(eq(dealerships.primaryContactEmail, email));
      if (dealership) createdDealershipIds.push(dealership.id);
    }

    const blocked = await submitDealerApplication(
      { ok: false, error: "" },
      formData({ email: `dealer-apply-${suffix}-overflow@example.com` }),
    );
    expect(blocked).toEqual({ ok: false, error: "Too many applications submitted. Please try again later." });
  });
});

describe("submitDealerApplication social-profile URLs (Gap 10)", () => {
  it("persists optional Facebook/Instagram URLs alongside website when provided", async () => {
    realIpHeader = `203.0.113.${(suffix + 50) % 200}`;
    const email = `dealer-apply-social-${suffix}@example.com`;
    const result = await submitDealerApplication(
      { ok: false, error: "" },
      formData({
        email,
        website: "https://example-dealer.test",
        facebookUrl: "https://facebook.com/exampledealer",
        instagramUrl: "https://instagram.com/exampledealer",
      }),
    );
    expect(result.ok).toBe(true);

    const [dealership] = await db.select().from(dealerships).where(eq(dealerships.primaryContactEmail, email));
    expect(dealership.facebookUrl).toBe("https://facebook.com/exampledealer");
    expect(dealership.instagramUrl).toBe("https://instagram.com/exampledealer");

    const [user] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.email, email));
    if (user) createdUserIds.push(user.id);
    createdDealershipIds.push(dealership.id);
  });

  it("leaves social URLs null when not provided - never mandatory", async () => {
    realIpHeader = `203.0.113.${(suffix + 51) % 200}`;
    const email = `dealer-apply-nosocial-${suffix}@example.com`;
    const result = await submitDealerApplication({ ok: false, error: "" }, formData({ email }));
    expect(result.ok).toBe(true);

    const [dealership] = await db.select().from(dealerships).where(eq(dealerships.primaryContactEmail, email));
    expect(dealership.facebookUrl).toBeNull();
    expect(dealership.instagramUrl).toBeNull();

    const [user] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.email, email));
    if (user) createdUserIds.push(user.id);
    createdDealershipIds.push(dealership.id);
  });

  it("rejects a malformed Facebook URL", async () => {
    realIpHeader = `203.0.113.${(suffix + 52) % 200}`;
    const result = await submitDealerApplication(
      { ok: false, error: "" },
      formData({ email: `dealer-apply-badsocial-${suffix}@example.com`, facebookUrl: "not-a-url" }),
    );
    expect(result.ok).toBe(false);
  });
});
