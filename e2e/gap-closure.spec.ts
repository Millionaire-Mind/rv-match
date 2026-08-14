import { test, expect } from "@playwright/test";

/**
 * Playwright coverage added for the targeted gap-closure pass. Each
 * describe block is labeled with the gap it closes so it's traceable back
 * to the requirement.
 */

test.describe("Gap 1: swipe persistence failure path", () => {
  test("a failed swipe shows a recoverable error, does not advance the feed, and retry succeeds", async ({
    page,
  }) => {
    await page.goto("/discover");
    await expect(page.locator("h2").first()).toBeVisible({ timeout: 15000 });
    const firstTitle = await page.locator("h2").first().textContent();

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
    await expect(page.locator("h2").first()).toHaveText(firstTitle ?? "");

    await page.unroute("**/discover");
    await page.getByRole("button", { name: "Retry" }).click();

    await expect(alert).not.toBeVisible({ timeout: 10000 });
    await expect(page.locator("h2").first()).not.toHaveText(firstTitle ?? "", { timeout: 10000 });
  });
});
