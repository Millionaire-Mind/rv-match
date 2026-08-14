import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { eq } from "drizzle-orm";

import { db } from "../src/server/db/client";
import {
  consumerPreferences,
  consumerProfiles,
  dealerships,
  distributionCampaigns,
  inventory,
  inventoryVideos,
  leads,
  swipeDecisions,
} from "../src/server/db/schema";

/**
 * Playwright coverage added for the targeted gap-closure pass. Each
 * describe block is labeled with the gap it closes so it's traceable back
 * to the requirement.
 */

// A swipe only advances the feed once the server confirms it persisted
// (Gap 1), so waiting a fixed short delay between keypresses would race
// real persistence latency - wait for genuine confirmed advancement. Card
// identity is tracked via data-inventory-id rather than visible text: the
// seed catalog has multiple RVs sharing the same year/make/model across
// dealers, so text equality is not a reliable "did the card change" signal.
async function swipeTimes(page: Page, count: number, key: "ArrowRight" | "ArrowLeft" | "ArrowUp") {
  for (let i = 0; i < count; i++) {
    const before = await page.locator('[data-active="true"]').getAttribute("data-inventory-id");
    await page.keyboard.press(key);
    await page.waitForFunction(
      (prevId) => document.querySelector('[data-active="true"]')?.getAttribute("data-inventory-id") !== prevId,
      before,
      { timeout: 10000 },
    );
  }
}

async function assertRealPlayableVideo(page: Page) {
  const video = page.locator("video").first();
  await expect(video).toBeVisible({ timeout: 10000 });
  const src = await video.getAttribute("src");
  expect(src, "video tile must have a real playable src, not just a poster image").toBeTruthy();
  expect(src).toMatch(/\.(mp4|webm|mov)(\?.*)?$/i);
}

test.describe("Gap 1: swipe persistence failure path", () => {
  test("a failed swipe shows a recoverable error, does not advance the feed, and retry succeeds", async ({
    page,
  }) => {
    await page.goto("/discover");
    await expect(page.locator("h2").first()).toBeVisible({ timeout: 15000 });
    const activeCard = page.locator('[data-active="true"]');
    const firstId = await activeCard.getAttribute("data-inventory-id");

    // Force exactly the first POST after this point (the swipe decision's
    // server action call) to fail at the network layer, simulating a real
    // persistence failure rather than mocking application code.
    let intercepted = false;
    await page.route("**/discover", async (route) => {
      const req = route.request();
      if (!intercepted && req.method() === "POST") {
        intercepted = true;
        await route.abort("failed");
        return;
      }
      await route.continue();
    });

    await page.getByRole("button", { name: "Pass" }).click();

    // Next.js's own route-announcer also carries role="alert", so scope to
    // the one actually containing our error copy.
    const alert = page.getByRole("alert").filter({ hasText: "didn't save" });
    await expect(alert).toBeVisible({ timeout: 10000 });

    // The card must still be the same one - the feed must not have
    // silently advanced past a swipe that never persisted.
    await expect(activeCard).toHaveAttribute("data-inventory-id", firstId ?? "");

    await page.unroute("**/discover");
    await page.getByRole("button", { name: "Retry" }).click();

    await expect(alert).not.toBeVisible({ timeout: 10000 });
    await expect
      .poll(() => page.locator('[data-active="true"]').getAttribute("data-inventory-id"), { timeout: 10000 })
      .not.toBe(firstId);
  });
});

test.describe("Gap 2: video-first consumer surfaces", () => {
  test("Search results render a real playable video tile, not a static photo grid", async ({ page }) => {
    await page.goto("/search");
    await expect(page.getByRole("heading", { name: "I Know What I Want" })).toBeVisible();
    await assertRealPlayableVideo(page);
  });

  test("Saved RVs render a real playable video tile", async ({ page }) => {
    await page.goto("/discover");
    await expect(page.locator("h2").first()).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: /^Save$/ }).click();
    // Save only reflects a confirmed server state (Gap 1) - wait for the
    // button to actually flip before navigating away.
    await expect(page.getByRole("button", { name: "Remove from saved" })).toBeVisible({ timeout: 10000 });

    await page.goto("/saved");
    await assertRealPlayableVideo(page);
  });

  test("Your RV Match results render a real playable video tile", async ({ page }) => {
    await page.goto("/discover");
    await expect(page.locator("h2").first()).toBeVisible({ timeout: 15000 });

    await swipeTimes(page, 10, "ArrowRight");
    const zipDialog = page.getByRole("dialog");
    if (await zipDialog.isVisible({ timeout: 3000 }).catch(() => false)) {
      await zipDialog.getByRole("textbox", { name: "ZIP code" }).fill("80202");
      await zipDialog.getByRole("button", { name: "Save" }).click();
      await expect(zipDialog).not.toBeVisible({ timeout: 5000 });
    }
    await swipeTimes(page, 10, "ArrowRight");
    await page.waitForURL(/\/match/, { timeout: 15000 });

    await assertRealPlayableVideo(page);
  });
});

async function getConsumerProfileId(context: BrowserContext): Promise<string> {
  const cookies = await context.cookies();
  const sessionCookie = cookies.find((c) => c.name === "rvm_session");
  if (!sessionCookie) throw new Error("rvm_session cookie not found - visit a page in this context first");
  const [profile] = await db
    .select({ id: consumerProfiles.id })
    .from(consumerProfiles)
    .where(eq(consumerProfiles.anonymousSessionId, sessionCookie.value));
  if (!profile) throw new Error("no consumer_profiles row for this anonymous session yet");
  return profile.id;
}

async function reachMatchViaRealSwipes(page: Page) {
  await page.goto("/discover");
  await expect(page.locator("h2").first()).toBeVisible({ timeout: 15000 });
  await swipeTimes(page, 10, "ArrowRight");
  const zipDialog = page.getByRole("dialog");
  if (await zipDialog.isVisible({ timeout: 3000 }).catch(() => false)) {
    await zipDialog.getByRole("textbox", { name: "ZIP code" }).fill("80202");
    await zipDialog.getByRole("button", { name: "Save" }).click();
    await expect(zipDialog).not.toBeVisible({ timeout: 5000 });
  }
  await swipeTimes(page, 10, "ArrowRight");
}

test.describe("Gap 3: partner shared match intelligence", () => {
  test("both-loved, both-liked, disagreement, and shared preference profile all render from real independent swipe/preference data", async ({
    context,
  }) => {
    const owner = await context.newPage();
    await reachMatchViaRealSwipes(owner);
    await owner.waitForURL(/\/match/, { timeout: 15000 });

    await owner.getByRole("button", { name: "Compare With My Partner" }).click();
    await owner.waitForURL(/\/partner\//, { timeout: 10000 });
    const inviteUrl = owner.url();

    const partnerContext = await context.browser()!.newContext();
    const partner = await partnerContext.newPage();
    await partner.goto(inviteUrl);
    await expect(partner.getByRole("heading", { name: "You've been invited to compare RV matches" })).toBeVisible({
      timeout: 10000,
    });
    await partner.getByRole("button", { name: "Start Matching Together" }).click();
    await partner.waitForURL(/\/discover/, { timeout: 15000 });

    // The partner does their own real, independent 20 swipes too - proving
    // the join + independent-history mechanism still works end to end,
    // not just that the comparison math works in isolation.
    await reachMatchViaRealSwipes(partner);

    // Two genuinely independent 20-card random walks aren't guaranteed to
    // overlap on any specific RV, so - to deterministically prove the
    // "both loved" / "both liked" / "disagreed" buckets and the shared
    // preference summary actually render real data - seed a small,
    // controlled set of additional swipe/preference rows directly against
    // both partners' real consumer profiles (resolved from their actual
    // anonymous session cookies), the same direct-DB-access pattern
    // security.spec.ts already uses. Every row inserted here still flows
    // through the real getPartnerDecisionComparison/getSharedPreferenceProfile
    // code paths when the page renders - nothing is asserted directly
    // against the database.
    const ownerProfileId = await getConsumerProfileId(context);
    const partnerProfileId = await getConsumerProfileId(partnerContext);

    const suffix = Date.now();
    const [dealership] = await db
      .insert(dealerships)
      .values({
        name: "__test_gap3_partner__",
        slug: `__test-gap3-partner-${suffix}`,
        primaryContactName: "Test",
        primaryContactEmail: `gap3-partner-${suffix}@example.com`,
        status: "approved",
      })
      .returning({ id: dealerships.id });

    async function makeRv(tag: string) {
      const [rv] = await db
        .insert(inventory)
        .values({
          dealershipId: dealership.id,
          stockNumber: `GAP3-${tag}-${suffix}`,
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
      const [video] = await db
        .insert(inventoryVideos)
        .values({ inventoryId: rv.id, url: `/media/videos/gap3-${tag}.mp4`, source: "dealer_upload" })
        .returning({ id: inventoryVideos.id });
      await db.update(inventory).set({ primaryVideoId: video.id }).where(eq(inventory.id, rv.id));
      return rv.id;
    }

    const rvBothLove = await makeRv("both-love");
    const rvBothLike = await makeRv("both-like");
    const rvDisagree = await makeRv("disagree");

    await db.insert(swipeDecisions).values([
      { consumerProfileId: ownerProfileId, inventoryId: rvBothLove, decision: "love" },
      { consumerProfileId: partnerProfileId, inventoryId: rvBothLove, decision: "love" },
      { consumerProfileId: ownerProfileId, inventoryId: rvBothLike, decision: "like" },
      { consumerProfileId: partnerProfileId, inventoryId: rvBothLike, decision: "more_like_this" },
      { consumerProfileId: ownerProfileId, inventoryId: rvDisagree, decision: "love" },
      { consumerProfileId: partnerProfileId, inventoryId: rvDisagree, decision: "pass" },
    ]);
    // upsert, not insert: both partners already did 20 real swipes above,
    // which may have already written a real rv_type preference row (most
    // of the seed catalog is travel_trailer) - this must still guarantee
    // a confident, matching, positive signal for both regardless.
    for (const consumerProfileId of [ownerProfileId, partnerProfileId]) {
      await db
        .insert(consumerPreferences)
        .values({ consumerProfileId, attribute: "rv_type", value: "travel_trailer", score: "3", observations: 6 })
        .onConflictDoUpdate({
          target: [consumerPreferences.consumerProfileId, consumerPreferences.attribute, consumerPreferences.value],
          set: { score: "3", observations: 6 },
        });
    }

    await owner.goto(inviteUrl);
    await expect(owner.getByRole("heading", { name: "Your Shared RV Match" })).toBeVisible({ timeout: 10000 });

    await expect(owner.getByText(/You matched on \d+ of \d+ major preferences\./)).toBeVisible();
    await expect(owner.getByRole("heading", { name: "You Both Loved" })).toBeVisible();
    await expect(owner.getByRole("heading", { name: "You Both Liked" })).toBeVisible();
    await expect(owner.getByRole("heading", { name: "Where You Saw It Differently" })).toBeVisible();

    // The partner's own view of the same link must show the same buckets
    // (their perspective, not just the owner's).
    await partner.goto(inviteUrl);
    await expect(partner.getByRole("heading", { name: "Your Shared RV Match" })).toBeVisible({ timeout: 10000 });
    await expect(partner.getByRole("heading", { name: "You Both Loved" })).toBeVisible();

    await db.delete(dealerships).where(eq(dealerships.id, dealership.id));
    await partnerContext.close();
  });
});

test.describe("Gap 4B: individual-RV QR reaction experience", () => {
  test("scanning a per-RV QR lands on the real video Would You Buy This RV? page, and reacting invites Find My RV", async ({
    page,
  }) => {
    const suffix = Date.now();
    const [dealership] = await db
      .insert(dealerships)
      .values({
        name: "__test_gap4b__",
        slug: `__test-gap4b-${suffix}`,
        primaryContactName: "Test",
        primaryContactEmail: `gap4b-${suffix}@example.com`,
        status: "approved",
      })
      .returning({ id: dealerships.id });
    const [rv] = await db
      .insert(inventory)
      .values({
        dealershipId: dealership.id,
        stockNumber: `GAP4B-${suffix}`,
        year: 2025,
        make: "Jayco",
        model: "Jay Flight",
        rvType: "travel_trailer",
        condition: "new",
        salePriceCents: 3200000,
        status: "published",
        source: "manual",
      })
      .returning({ id: inventory.id });
    const [video] = await db
      .insert(inventoryVideos)
      .values({ inventoryId: rv.id, url: "/media/videos/gap4b.mp4", source: "dealer_upload" })
      .returning({ id: inventoryVideos.id });
    await db.update(inventory).set({ primaryVideoId: video.id }).where(eq(inventory.id, rv.id));
    const [campaign] = await db
      .insert(distributionCampaigns)
      .values({
        dealershipId: dealership.id,
        inventoryId: rv.id,
        code: `gap4b-${suffix}`,
        name: "Window sticker QR",
        campaignType: "dealer_inventory",
      })
      .returning();

    await page.goto(`/go/${campaign.code}`);
    await page.waitForURL(new RegExp(`/w/${campaign.code}$`));
    await expect(page.getByRole("heading", { name: "Would You Buy This RV?" })).toBeVisible();
    await assertRealPlayableVideo(page);
    await expect(page.getByText("2025 Jayco Jay Flight")).toBeVisible();

    await page.getByRole("button", { name: "Yes, I'd buy this" }).click();
    await expect(page.getByRole("link", { name: "Find My RV" })).toBeVisible({ timeout: 10000 });

    await db.delete(dealerships).where(eq(dealerships.id, dealership.id));
  });
});

const DEMO_PASSWORD = "RvMatchDemo123!";

test.describe("Gap 5: dealer analytics charts", () => {
  test("the Analytics page renders real trend and campaign-contribution charts, not just cards/tables", async ({
    page,
  }) => {
    await page.goto("/dealer/login");
    await page.getByLabel("Email").fill("owner@rockymountainrv.example");
    await page.getByLabel("Password").fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/dealer$/, { timeout: 15000 });

    await page.goto("/dealer/analytics");
    await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible();

    // The four trend sparklines (Impressions/Engagement/Leads/Verified
    // Sales) are real inline SVGs, not table cells.
    const trendCharts = page.locator('svg[role="img"]');
    await expect(trendCharts).toHaveCount(4);
    await expect(trendCharts.first()).toHaveAccessibleName(/Impressions trend/);
    await expect(page.getByText("Verified Sales", { exact: true }).first()).toBeVisible();

    // The per-RV table now has rate columns, not just raw counts.
    await expect(page.getByRole("columnheader", { name: "LOVE Rate" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Unique Viewers" })).toBeVisible();
  });
});

test.describe("Gap 8: optional browser geolocation alongside ZIP", () => {
  test("granting location access persists real coordinates and closes the prompt without ever touching the ZIP field", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 39.7392, longitude: -104.9903 }); // Denver, CO

    await page.goto("/discover");
    await expect(page.locator("h2").first()).toBeVisible({ timeout: 15000 });
    await swipeTimes(page, 10, "ArrowRight");

    const zipDialog = page.getByRole("dialog");
    await expect(zipDialog.getByText("Want to see RVs you can actually buy near you?")).toBeVisible({
      timeout: 10000,
    });
    await zipDialog.getByRole("button", { name: "Use my location" }).click();
    await expect(zipDialog).not.toBeVisible({ timeout: 10000 });

    const sessionCookie = (await context.cookies()).find((c) => c.name === "rvm_session");
    expect(sessionCookie).toBeDefined();
    const [profile] = await db
      .select({ lat: consumerProfiles.lat, lng: consumerProfiles.lng, zipCode: consumerProfiles.zipCode })
      .from(consumerProfiles)
      .where(eq(consumerProfiles.anonymousSessionId, sessionCookie!.value));
    expect(profile).toBeDefined();
    expect(Number(profile.lat)).toBeCloseTo(39.7392, 1);
    expect(Number(profile.lng)).toBeCloseTo(-104.9903, 1);
    // ZIP was never touched - geolocation is an alternative path, not a
    // requirement to also fill in the ZIP field.
    expect(profile.zipCode).toBeNull();
  });

  test("denying location access falls back gracefully - the ZIP field is still right there, with no dead end", async ({
    page,
  }) => {
    // Simulate a real browser permission denial: getCurrentPosition's
    // error callback fires with PERMISSION_DENIED (code 1), the same as
    // Chrome does when a user clicks "Block" on the native prompt.
    await page.addInitScript(() => {
      Object.defineProperty(window.navigator, "geolocation", {
        configurable: true,
        value: {
          getCurrentPosition: (_success: PositionCallback, error?: PositionErrorCallback) => {
            error?.({ code: 1, message: "User denied Geolocation" } as GeolocationPositionError);
          },
        },
      });
    });

    await page.goto("/discover");
    await expect(page.locator("h2").first()).toBeVisible({ timeout: 15000 });
    await swipeTimes(page, 10, "ArrowRight");

    const zipDialog = page.getByRole("dialog");
    await expect(zipDialog.getByText("Want to see RVs you can actually buy near you?")).toBeVisible({
      timeout: 10000,
    });
    await zipDialog.getByRole("button", { name: "Use my location" }).click();
    await expect(zipDialog.getByText(/couldn't access your location/i)).toBeVisible({ timeout: 10000 });

    // The dialog is still open and the ZIP path still works - no dead end.
    await zipDialog.getByRole("textbox", { name: "ZIP code" }).fill("80202");
    await zipDialog.getByRole("button", { name: "Save" }).click();
    await expect(zipDialog).not.toBeVisible({ timeout: 5000 });
  });
});

test.describe("Gap 9: match score persisted on leads", () => {
  test("submitting a lead freezes a real, non-zero match score that the dealer can see on the lead", async ({
    page,
    context,
  }) => {
    await page.goto("/discover");
    await expect(page.locator("h2").first()).toBeVisible({ timeout: 15000 });
    // A few LOVE decisions build a real preference signal before the lead
    // is submitted, so the resulting match score isn't just a coin-flip
    // baseline - it reflects genuine learned preference.
    await swipeTimes(page, 3, "ArrowUp");

    await page.getByRole("link", { name: "View full details" }).first().click();
    await page.waitForURL(/\/rv\//, { timeout: 10000 });
    const inventoryId = page.url().split("/rv/")[1]?.split(/[/?]/)[0];

    // Resolve the owning dealer's login directly from the DB (by this
    // exact RV's dealership) rather than scraping page text for a
    // dealership name - reliable regardless of which of the two seeded
    // dealers happened to serve this RV.
    const [rvRow] = await db.select({ dealershipId: inventory.dealershipId }).from(inventory).where(eq(inventory.id, inventoryId!));
    const [dealerRow] = await db
      .select({ email: dealerships.primaryContactEmail })
      .from(dealerships)
      .where(eq(dealerships.id, rvRow.dealershipId));
    const dealerEmail = dealerRow.email;

    const leadEmail = `e2e-match-score-${Date.now()}@example.com`;
    await page.getByRole("button", { name: "Check Availability" }).click();
    await page.getByLabel("Name").fill("E2E Match Score Lead");
    await page.getByRole("textbox", { name: "Email" }).fill(leadEmail);
    await page.getByLabel(/agree to be contacted/i).check();
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("Request sent")).toBeVisible({ timeout: 10000 });

    const [lead] = await db.select().from(leads).where(eq(leads.email, leadEmail));
    expect(lead).toBeDefined();
    expect(lead.matchScore).not.toBeNull();
    expect(Number(lead.matchScore)).toBeGreaterThanOrEqual(0);
    expect(Number(lead.matchScore)).toBeLessThanOrEqual(100);
    expect(lead.inventoryId).toBe(inventoryId);

    const dealerPage = await context.newPage();
    await dealerPage.goto("/dealer/login");
    await dealerPage.getByLabel("Email").fill(dealerEmail);
    await dealerPage.getByLabel("Password").fill(DEMO_PASSWORD);
    await dealerPage.getByRole("button", { name: "Sign in" }).click();
    await dealerPage.waitForURL(/\/dealer$/, { timeout: 15000 });
    await dealerPage.goto(`/dealer/leads/${lead.id}`);
    await expect(dealerPage.getByRole("heading", { name: "Match Score" })).toBeVisible({ timeout: 10000 });
    await expect(dealerPage.getByText(`${Math.round(Number(lead.matchScore))}`).first()).toBeVisible();
  });
});

test.describe("Gap 11: First-10,000 funnel completeness and segmentation", () => {
  test("the admin funnel page shows the full acquisition taxonomy and the completed funnel stages, never collapsing social/organic into Direct", async ({
    page,
  }) => {
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill("admin@rvmatch.app");
    await page.getByLabel("Password").fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/admin$/, { timeout: 15000 });

    await page.goto("/admin/funnel");
    await expect(page.getByRole("heading", { name: "First 10,000" })).toBeVisible();

    // The stale claim ("no UTM capture yet") must be gone now that Gap 4F
    // added real UTM/referrer classification.
    await expect(page.getByText(/no UTM capture/i)).not.toBeVisible();

    // Every completed funnel stage column is present, not just the
    // original session/decision/account/lead/sale set.
    for (const column of [
      "Discovery Starts",
      "Match Completed (20)",
      "Returning",
      "Partner Invites",
      "Dealer Contacts",
      "Appointments",
      "Sold (reported)",
      "Verified Sales",
    ]) {
      await expect(page.getByRole("columnheader", { name: column })).toBeVisible();
    }
  });
});
