import { afterAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { anonymousSessions, consumerProfiles } from "@/server/db/schema";

let currentCookieValue: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "rvm_session" && currentCookieValue ? { value: currentCookieValue } : undefined),
    set: () => {},
    delete: () => {},
  }),
}));

const { setSearchRadius, submitGeolocation } = await import("./location");

const anonymousSessionIds: string[] = [];
const consumerProfileIds: string[] = [];

async function newSession(): Promise<{ consumerProfileId: string }> {
  const [session] = await db.insert(anonymousSessions).values({}).returning({ id: anonymousSessions.id });
  anonymousSessionIds.push(session.id);
  currentCookieValue = session.id;
  const [profile] = await db
    .insert(consumerProfiles)
    .values({ anonymousSessionId: session.id, radiusMiles: 100 })
    .returning({ id: consumerProfiles.id });
  consumerProfileIds.push(profile.id);
  return { consumerProfileId: profile.id };
}

afterAll(async () => {
  for (const id of consumerProfileIds) await db.delete(consumerProfiles).where(eq(consumerProfiles.id, id));
  for (const id of anonymousSessionIds) await db.delete(anonymousSessions).where(eq(anonymousSessions.id, id));
});

describe("setSearchRadius", () => {
  it("persists a valid radius", async () => {
    const { consumerProfileId } = await newSession();
    await setSearchRadius(250);
    const [row] = await db.select({ radiusMiles: consumerProfiles.radiusMiles }).from(consumerProfiles).where(eq(consumerProfiles.id, consumerProfileId));
    expect(row.radiusMiles).toBe(250);
  });

  it("silently rejects an out-of-bounds radius, leaving the prior value untouched", async () => {
    const { consumerProfileId } = await newSession();
    await setSearchRadius(999_999_999);
    const [row] = await db.select({ radiusMiles: consumerProfiles.radiusMiles }).from(consumerProfiles).where(eq(consumerProfiles.id, consumerProfileId));
    expect(row.radiusMiles).toBe(100); // unchanged from the seeded default

    await setSearchRadius(-5);
    const [afterNegative] = await db.select({ radiusMiles: consumerProfiles.radiusMiles }).from(consumerProfiles).where(eq(consumerProfiles.id, consumerProfileId));
    expect(afterNegative.radiusMiles).toBe(100);

    await setSearchRadius(Number.NaN);
    const [afterNaN] = await db.select({ radiusMiles: consumerProfiles.radiusMiles }).from(consumerProfiles).where(eq(consumerProfiles.id, consumerProfileId));
    expect(afterNaN.radiusMiles).toBe(100);
  });
});

describe("submitGeolocation", () => {
  it("persists valid coordinates, rounded to ~110m rather than the browser's exact precision (Gap 8: don't over-expose precise coordinates)", async () => {
    const { consumerProfileId } = await newSession();
    await submitGeolocation(39.7392, -104.9903); // Denver, CO
    const [row] = await db.select({ lat: consumerProfiles.lat, lng: consumerProfiles.lng }).from(consumerProfiles).where(eq(consumerProfiles.id, consumerProfileId));
    expect(Number(row.lat)).toBeCloseTo(39.7392, 2);
    expect(Number(row.lng)).toBeCloseTo(-104.9903, 2);
    expect(Number(row.lat).toFixed(3)).toBe("39.739");
    expect(Number(row.lng).toFixed(3)).toBe("-104.990");
  });

  it("silently rejects out-of-range coordinates", async () => {
    const { consumerProfileId } = await newSession();
    await submitGeolocation(999, -104.9903);
    const [row] = await db.select({ lat: consumerProfiles.lat, lng: consumerProfiles.lng }).from(consumerProfiles).where(eq(consumerProfiles.id, consumerProfileId));
    expect(row.lat).toBeNull();
    expect(row.lng).toBeNull();
  });
});
