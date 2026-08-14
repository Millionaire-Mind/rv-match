import { test, expect, type Page } from "@playwright/test";

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
