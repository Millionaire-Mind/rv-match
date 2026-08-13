import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, and } from "drizzle-orm";

import { db } from "@/server/db/client";
import {
  anonymousSessions,
  behavioralEvents,
  consumerPreferences,
  consumerProfiles,
  dealerships,
  inventory,
  inventoryVideos,
} from "@/server/db/schema";

/**
 * Phase 8: "Show Me Similar RVs" (from a search result or RV detail page)
 * must (a) feed the selected RV into the consumer's preference profile the
 * same way MORE LIKE THIS does mid-swipe, (b) log a show_me_similar
 * behavioral event, and (c) send the consumer into personalized discovery
 * rather than a second, disconnected results list.
 */

let currentToken: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "rvm_session" && currentToken ? { value: currentToken } : undefined),
    set: () => {},
    delete: () => {},
  }),
}));

const redirectCalls: string[] = [];
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    redirectCalls.push(path);
    throw new Error("NEXT_REDIRECT_TEST_SENTINEL");
  },
}));

const { showMeSimilarRvs } = await import("./actions");

let dealershipId: string;
let anonymousSessionId: string;
let consumerProfileId: string;
let invId: string;

beforeAll(async () => {
  const suffix = Date.now();
  const [dealership] = await db
    .insert(dealerships)
    .values({
      name: "__test_show_me_similar__",
      slug: `__test-show-me-similar-${suffix}`,
      primaryContactName: "Test",
      primaryContactEmail: `show-me-similar-${suffix}@example.com`,
      status: "approved",
    })
    .returning({ id: dealerships.id });
  dealershipId = dealership.id;

  const [session] = await db.insert(anonymousSessions).values({}).returning({ id: anonymousSessions.id });
  anonymousSessionId = session.id;
  currentToken = anonymousSessionId;

  const [profile] = await db
    .insert(consumerProfiles)
    .values({ anonymousSessionId })
    .returning({ id: consumerProfiles.id });
  consumerProfileId = profile.id;

  const [rv] = await db
    .insert(inventory)
    .values({
      dealershipId,
      stockNumber: `SMS-${suffix}`,
      year: 2024,
      make: "Forest River",
      model: "Rockwood",
      rvType: "fifth_wheel",
      condition: "new",
      salePriceCents: 5500000,
      status: "published",
      source: "manual",
    })
    .returning({ id: inventory.id });
  invId = rv.id;
  const [video] = await db
    .insert(inventoryVideos)
    .values({ inventoryId: invId, url: "/media/videos/sms.mp4", source: "dealer_upload" })
    .returning({ id: inventoryVideos.id });
  await db.update(inventory).set({ primaryVideoId: video.id }).where(eq(inventory.id, invId));
});

afterAll(async () => {
  await db.delete(consumerProfiles).where(eq(consumerProfiles.id, consumerProfileId));
  await db.delete(anonymousSessions).where(eq(anonymousSessions.id, anonymousSessionId));
  await db.delete(dealerships).where(eq(dealerships.id, dealershipId));
});

describe("showMeSimilarRvs", () => {
  it("applies a preference delta for the RV's attributes, logs a show_me_similar event, and redirects to /discover", async () => {
    await expect(showMeSimilarRvs(invId)).rejects.toThrow("NEXT_REDIRECT_TEST_SENTINEL");

    expect(redirectCalls).toContain("/discover");

    const prefRows = await db
      .select()
      .from(consumerPreferences)
      .where(eq(consumerPreferences.consumerProfileId, consumerProfileId));
    const rvTypePref = prefRows.find((r) => r.attribute === "rv_type" && r.value === "fifth_wheel");
    expect(rvTypePref).toBeDefined();
    expect(Number(rvTypePref!.score)).toBeGreaterThan(0);

    const [event] = await db
      .select()
      .from(behavioralEvents)
      .where(
        and(
          eq(behavioralEvents.consumerProfileId, consumerProfileId),
          eq(behavioralEvents.eventType, "show_me_similar"),
          eq(behavioralEvents.inventoryId, invId),
        ),
      )
      .limit(1);
    expect(event).toBeDefined();
    expect(event!.dealershipId).toBe(dealershipId);
  });
});
