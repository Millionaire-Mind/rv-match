import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { anonymousSessions, consumerProfiles, dealerships, inventory, inventoryVideos } from "@/server/db/schema";
import { getDiscoveryBatch } from "@/server/recommendation/engine";
import { getTopMatches } from "@/server/recommendation/top-matches";

/**
 * Integration test proving the core Phase 4 requirement end to end against
 * real Postgres: a published RV with no video is never surfaced by either
 * consumer-facing listing surface (the discovery feed or Match results),
 * even though its status alone would otherwise make it eligible. RV Match
 * is video-first by design - "published" is necessary but not sufficient.
 */

let dealershipId: string;
let consumerProfileId: string;
let anonymousSessionId: string;
let publishedWithVideoId: string;
let publishedNoVideoId: string;

beforeAll(async () => {
  const suffix = Date.now();
  const [dealership] = await db
    .insert(dealerships)
    .values({
      name: "__test_video_eligibility__",
      slug: `__test-video-eligibility-${suffix}`,
      primaryContactName: "Test Contact",
      primaryContactEmail: `video-eligibility-${suffix}@example.com`,
      status: "approved",
    })
    .returning({ id: dealerships.id });
  dealershipId = dealership.id;

  const [session] = await db.insert(anonymousSessions).values({}).returning({ id: anonymousSessions.id });
  anonymousSessionId = session.id;
  const [profile] = await db
    .insert(consumerProfiles)
    .values({ anonymousSessionId })
    .returning({ id: consumerProfiles.id });
  consumerProfileId = profile.id;

  const [withVideo] = await db
    .insert(inventory)
    .values({
      dealershipId,
      stockNumber: `ELIG-VIDEO-${suffix}`,
      year: 2024,
      make: "Forest River",
      model: "Rockwood",
      rvType: "travel_trailer",
      condition: "new",
      salePriceCents: 3500000,
      status: "published",
      source: "manual",
    })
    .returning({ id: inventory.id });
  publishedWithVideoId = withVideo.id;

  const [video] = await db
    .insert(inventoryVideos)
    .values({ inventoryId: publishedWithVideoId, url: "/media/videos/test.mp4", source: "dealer_upload" })
    .returning({ id: inventoryVideos.id });
  await db.update(inventory).set({ primaryVideoId: video.id }).where(eq(inventory.id, publishedWithVideoId));

  // Published but never got a video - this must never reach a consumer, no
  // matter how it happened (published before this gate existed, a bug
  // elsewhere, a direct DB edit).
  const [noVideo] = await db
    .insert(inventory)
    .values({
      dealershipId,
      stockNumber: `ELIG-NOVIDEO-${suffix}`,
      year: 2024,
      make: "Jayco",
      model: "Eagle",
      rvType: "fifth_wheel",
      condition: "new",
      salePriceCents: 5500000,
      status: "published",
      source: "manual",
    })
    .returning({ id: inventory.id });
  publishedNoVideoId = noVideo.id;
});

afterAll(async () => {
  await db.delete(consumerProfiles).where(eq(consumerProfiles.id, consumerProfileId));
  await db.delete(anonymousSessions).where(eq(anonymousSessions.id, anonymousSessionId));
  await db.delete(dealerships).where(eq(dealerships.id, dealershipId));
});

describe("video-first eligibility", () => {
  it("excludes a published-but-video-less RV from the discovery feed", async () => {
    const batch = await getDiscoveryBatch(consumerProfileId, 400);
    const ids = batch.map((c) => c.inventory.id);
    expect(ids).toContain(publishedWithVideoId);
    expect(ids).not.toContain(publishedNoVideoId);
  });

  it("excludes a published-but-video-less RV from Match results", async () => {
    const matches = await getTopMatches(consumerProfileId, 500);
    const ids = matches.map((m) => m.inventory.id);
    expect(ids).toContain(publishedWithVideoId);
    expect(ids).not.toContain(publishedNoVideoId);
  });
});
