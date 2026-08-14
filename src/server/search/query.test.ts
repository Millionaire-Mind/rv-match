import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { dealerships, inventory, inventoryVideos } from "@/server/db/schema";
import { searchInventory } from "./query";

/**
 * Phase 8 integration tests: traditional search must (a) honor every filter
 * correctly, (b) never surface an RV that isn't discoveryEligible() (draft
 * status or missing a primary video), same rule as the swipe feed and Match,
 * and (c) apply radius honestly - unknown-location RVs excluded, not
 * silently counted as nearby (Phase 7 semantics).
 */

let dealershipId: string;
const suffix = Date.now();
const ids: { bunkhouseTT: string; plainTT: string; unpublished: string; noVideo: string; farAway: string } = {
  bunkhouseTT: "",
  plainTT: "",
  unpublished: "",
  noVideo: "",
  farAway: "",
};

async function makeVideo(inventoryId: string) {
  const [video] = await db
    .insert(inventoryVideos)
    .values({ inventoryId, url: `/media/videos/${inventoryId}.mp4`, source: "dealer_upload" })
    .returning({ id: inventoryVideos.id });
  await db.update(inventory).set({ primaryVideoId: video.id }).where(eq(inventory.id, inventoryId));
}

beforeAll(async () => {
  const [dealership] = await db
    .insert(dealerships)
    .values({
      name: "__test_search_query__",
      slug: `__test-search-query-${suffix}`,
      primaryContactName: "Test",
      primaryContactEmail: `search-query-${suffix}@example.com`,
      status: "approved",
    })
    .returning({ id: dealerships.id });
  dealershipId = dealership.id;

  const [bunkhouseTT] = await db
    .insert(inventory)
    .values({
      dealershipId,
      stockNumber: `SRCH-BUNK-${suffix}`,
      year: 2024,
      make: "Forest River",
      brand: "Rockwood",
      model: "Rockwood Mini Lite",
      rvType: "travel_trailer",
      condition: "new",
      salePriceCents: 3000000,
      bunkhouse: true,
      lat: "39.74",
      lng: "-104.99", // Denver
      status: "published",
      source: "manual",
    })
    .returning({ id: inventory.id });
  ids.bunkhouseTT = bunkhouseTT.id;
  await makeVideo(ids.bunkhouseTT);

  const [plainTT] = await db
    .insert(inventory)
    .values({
      dealershipId,
      stockNumber: `SRCH-PLAIN-${suffix}`,
      year: 2022,
      make: "Jayco",
      brand: "Jay Flight",
      model: "Jay Flight SLX",
      rvType: "travel_trailer",
      condition: "used",
      salePriceCents: 1500000,
      bunkhouse: false,
      lat: "39.75",
      lng: "-105.0", // near Denver too
      status: "published",
      source: "manual",
    })
    .returning({ id: inventory.id });
  ids.plainTT = plainTT.id;
  await makeVideo(ids.plainTT);

  const [unpublished] = await db
    .insert(inventory)
    .values({
      dealershipId,
      stockNumber: `SRCH-DRAFT-${suffix}`,
      year: 2024,
      make: "Forest River",
      model: "Rockwood",
      rvType: "travel_trailer",
      condition: "new",
      salePriceCents: 3000000,
      status: "draft", // NOT published - must never appear in search
      source: "manual",
    })
    .returning({ id: inventory.id });
  ids.unpublished = unpublished.id;
  await makeVideo(ids.unpublished);

  const [noVideo] = await db
    .insert(inventory)
    .values({
      dealershipId,
      stockNumber: `SRCH-NOVID-${suffix}`,
      year: 2024,
      make: "Forest River",
      model: "Rockwood",
      rvType: "travel_trailer",
      condition: "new",
      salePriceCents: 3000000,
      status: "published", // published, but no primaryVideoId - must never appear
      source: "manual",
    })
    .returning({ id: inventory.id });
  ids.noVideo = noVideo.id;

  const [farAway] = await db
    .insert(inventory)
    .values({
      dealershipId,
      stockNumber: `SRCH-FAR-${suffix}`,
      year: 2024,
      make: "Forest River",
      model: "Rockwood",
      rvType: "travel_trailer",
      condition: "new",
      salePriceCents: 3000000,
      lat: "27.95",
      lng: "-82.46", // Tampa - far from Denver
      status: "published",
      source: "manual",
    })
    .returning({ id: inventory.id });
  ids.farAway = farAway.id;
  await makeVideo(ids.farAway);
});

afterAll(async () => {
  await db.delete(dealerships).where(eq(dealerships.id, dealershipId));
});

describe("searchInventory filters", () => {
  it("filters by bunkhouse", async () => {
    const { results } = await searchInventory({ sort: "newest", bunkhouse: true, dealershipId });
    expect(results.map((r) => r.id)).toContain(ids.bunkhouseTT);
    expect(results.map((r) => r.id)).not.toContain(ids.plainTT);
  });

  it("filters by brand (Gap 10: distinct from make/manufacturer)", async () => {
    const { results } = await searchInventory({ sort: "newest", brand: "Rockwood", dealershipId });
    const foundIds = results.map((r) => r.id);
    expect(foundIds).toContain(ids.bunkhouseTT);
    expect(foundIds).not.toContain(ids.plainTT);
    const found = results.find((r) => r.id === ids.bunkhouseTT);
    expect(found?.brand).toBe("Rockwood");
    expect(found?.model).toBe("Rockwood Mini Lite");
  });

  it("filters by price range", async () => {
    const { results } = await searchInventory({ sort: "newest", priceMin: 20000, priceMax: 50000, dealershipId });
    const foundIds = results.map((r) => r.id);
    expect(foundIds).toContain(ids.bunkhouseTT);
    expect(foundIds).not.toContain(ids.plainTT); // $15k, below priceMin
  });

  it("filters by condition", async () => {
    const { results } = await searchInventory({ sort: "newest", condition: "used", dealershipId });
    const foundIds = results.map((r) => r.id);
    expect(foundIds).toContain(ids.plainTT);
    expect(foundIds).not.toContain(ids.bunkhouseTT);
  });

  it("sorts by price ascending and descending", async () => {
    const asc = await searchInventory({ sort: "price_asc", dealershipId });
    const ascPrices = asc.results.map((r) => r.priceCents);
    expect(ascPrices).toEqual([...ascPrices].sort((a, b) => a - b));

    const desc = await searchInventory({ sort: "price_desc", dealershipId });
    const descPrices = desc.results.map((r) => r.priceCents);
    expect(descPrices).toEqual([...descPrices].sort((a, b) => b - a));
  });
});

describe("searchInventory video-first eligibility", () => {
  it("never returns an unpublished (draft) RV", async () => {
    const { results } = await searchInventory({ sort: "newest", dealershipId });
    expect(results.map((r) => r.id)).not.toContain(ids.unpublished);
  });

  it("never returns a published RV with no primary video", async () => {
    const { results } = await searchInventory({ sort: "newest", dealershipId });
    expect(results.map((r) => r.id)).not.toContain(ids.noVideo);
  });

  it("only returns RVs with a resolvable videoUrl", async () => {
    const { results } = await searchInventory({ sort: "newest", dealershipId });
    for (const r of results) {
      expect(r.videoUrl).toBeTruthy();
    }
  });
});

describe("searchInventory radius honesty (Phase 7 semantics)", () => {
  it("excludes an RV outside the radius and includes one inside it", async () => {
    const { results } = await searchInventory({
      sort: "newest",
      dealershipId,
      zipCode: "80202", // Denver
      radiusMiles: 50,
    });
    const foundIds = results.map((r) => r.id);
    expect(foundIds).toContain(ids.bunkhouseTT);
    expect(foundIds).not.toContain(ids.farAway);
  });
});
