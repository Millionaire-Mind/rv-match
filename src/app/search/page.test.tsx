import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import {
  anonymousSessions,
  behavioralEvents,
  consumerProfiles,
  dealerships,
  inventory,
  inventoryVideos,
} from "@/server/db/schema";

/**
 * Phase 8: visiting /search with filters set must log a search_performed
 * behavioral event carrying the filters and result count (required for
 * search-behavior tracking) - but a bare, filter-less visit to /search
 * shouldn't spam an event for every render.
 */

let currentToken: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "rvm_session" && currentToken ? { value: currentToken } : undefined),
    set: () => {},
    delete: () => {},
  }),
}));

const { default: SearchPage } = await import("./page");

let dealershipId: string;
let anonymousSessionId: string;

beforeAll(async () => {
  const suffix = Date.now();
  const [dealership] = await db
    .insert(dealerships)
    .values({
      name: "__test_search_page__",
      slug: `__test-search-page-${suffix}`,
      primaryContactName: "Test",
      primaryContactEmail: `search-page-${suffix}@example.com`,
      status: "approved",
    })
    .returning({ id: dealerships.id });
  dealershipId = dealership.id;

  const [session] = await db.insert(anonymousSessions).values({}).returning({ id: anonymousSessions.id });
  anonymousSessionId = session.id;
  currentToken = anonymousSessionId;

  const [rv] = await db
    .insert(inventory)
    .values({
      dealershipId,
      stockNumber: `SPAGE-${suffix}`,
      year: 2023,
      make: "Grand Design",
      model: "Reflection",
      rvType: "fifth_wheel",
      condition: "new",
      salePriceCents: 6000000,
      status: "published",
      source: "manual",
    })
    .returning({ id: inventory.id });
  const [video] = await db
    .insert(inventoryVideos)
    .values({ inventoryId: rv.id, url: "/media/videos/spage.mp4", source: "dealer_upload" })
    .returning({ id: inventoryVideos.id });
  await db.update(inventory).set({ primaryVideoId: video.id }).where(eq(inventory.id, rv.id));
});

afterAll(async () => {
  await db.delete(consumerProfiles).where(eq(consumerProfiles.anonymousSessionId, anonymousSessionId));
  await db.delete(anonymousSessions).where(eq(anonymousSessions.id, anonymousSessionId));
  await db.delete(dealerships).where(eq(dealerships.id, dealershipId));
});

async function countSearchEvents() {
  const rows = await db
    .select()
    .from(behavioralEvents)
    .where(and(eq(behavioralEvents.eventType, "search_performed")));
  return rows.length;
}

describe("SearchPage", () => {
  it("logs a search_performed event with filters and result count when filters are present", async () => {
    const before = await countSearchEvents();

    await SearchPage({ searchParams: Promise.resolve({ rvType: "fifth_wheel", dealershipId }) });

    const rows = await db
      .select()
      .from(behavioralEvents)
      .where(and(eq(behavioralEvents.eventType, "search_performed")));
    expect(rows.length).toBe(before + 1);

    const latest = rows[rows.length - 1];
    expect(latest.metadata).toMatchObject({ filters: { rvType: "fifth_wheel" } });
    expect((latest.metadata as { resultCount: number }).resultCount).toBeGreaterThanOrEqual(1);
  });

  it("does not log a search_performed event on a bare, filter-less visit", async () => {
    const before = await countSearchEvents();

    await SearchPage({ searchParams: Promise.resolve({}) });

    const after = await countSearchEvents();
    expect(after).toBe(before);
  });
});
