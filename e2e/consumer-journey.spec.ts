import { test, expect, type Page } from "@playwright/test";

const DEMO_PASSWORD = "RvMatchDemo123!";

async function swipeTimes(page: Page, count: number, key: "ArrowRight" | "ArrowLeft" | "ArrowUp") {
  for (let i = 0; i < count; i++) {
    await page.keyboard.press(key);
    await page.waitForTimeout(150);
  }
}

test.describe("Consumer journey", () => {
  test("landing page CTA launches discovery with zero friction", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("No account needed")).toBeVisible();
    await page.getByRole("link", { name: "Find My RV" }).click();
    await expect(page).toHaveURL(/\/discover/);
    // Discovery feed renders a card without ever prompting for an account.
    await expect(page.locator("h2").first()).toBeVisible({ timeout: 15000 });
  });

  test("PASS, LIKE, LOVE, and MORE LIKE THIS all advance the feed and record decisions", async ({ page }) => {
    await page.goto("/discover");
    await expect(page.locator("h2").first()).toBeVisible({ timeout: 15000 });

    const progressBefore = await page.locator("text=/^\\d+$/").first().textContent();

    await page.getByRole("button", { name: "Pass" }).click();
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: "Like", exact: true }).click();
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: "Love" }).click();
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: "More like this" }).click();
    await page.waitForTimeout(400);

    const progressAfter = await page.locator("text=/^\\d+$/").first().textContent();
    expect(Number(progressAfter)).toBeGreaterThan(Number(progressBefore ?? "0"));
  });

  test("reaching 10 decisions prompts for a ZIP code, and reaching 20 unlocks Match results", async ({
    page,
  }) => {
    await page.goto("/discover");
    await expect(page.locator("h2").first()).toBeVisible({ timeout: 15000 });

    await swipeTimes(page, 10, "ArrowRight");
    const zipDialog = page.getByRole("dialog");
    await expect(zipDialog.getByText("Want to see RVs you can actually buy near you?")).toBeVisible({
      timeout: 10000,
    });
    await zipDialog.getByRole("textbox", { name: "ZIP code" }).fill("80202");
    await zipDialog.getByRole("button", { name: "Save" }).click();
    await expect(zipDialog).not.toBeVisible({ timeout: 5000 });

    await swipeTimes(page, 10, "ArrowRight");
    await page.waitForURL(/\/match/, { timeout: 15000 });
    await expect(page.getByRole("heading", { name: "Your RV Match" })).toBeVisible();
    await expect(page.getByText("Top matching RVs available now")).toBeVisible();
  });

  test("saving an RV shows it on the Saved page, and survives creating an account", async ({ page }) => {
    await page.goto("/discover");
    await expect(page.locator("h2").first()).toBeVisible({ timeout: 15000 });
    const title = await page.locator("h2").first().textContent();

    await page.getByRole("button", { name: /^Save$/ }).click();
    await page.waitForTimeout(500);

    await page.goto("/saved");
    await expect(page.getByText(title!.split(" ").slice(1).join(" "), { exact: false })).toBeVisible({
      timeout: 10000,
    });

    // Create an account — anonymous history (the save) should carry over.
    const email = `e2e-${Date.now()}@example.com`;
    await page.goto("/signup");
    await page.getByLabel("Full name").fill("E2E Test Shopper");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL(/\/saved/, { timeout: 15000 });

    await expect(page.locator("text=No saved RVs yet")).not.toBeVisible();
  });

  test("submitting a lead from an RV detail page succeeds and reaches the dealer", async ({
    page,
    context,
  }) => {
    await page.goto("/discover");
    await expect(page.locator("h2").first()).toBeVisible({ timeout: 15000 });
    await page.getByRole("link", { name: "View full details" }).first().click();
    await page.waitForURL(/\/rv\//, { timeout: 10000 });

    const isRockyMountain = (await page.getByText("Rocky Mountain RV Center").count()) > 0;
    const dealerEmail = isRockyMountain
      ? "owner@rockymountainrv.example"
      : "owner@sunshinestatervs.example";

    await page.getByRole("button", { name: "Check Availability" }).click();
    await page.getByLabel("Name").fill("E2E Test Lead");
    await page.getByRole("textbox", { name: "Email" }).fill(`e2e-lead-${Date.now()}@example.com`);
    await page.getByLabel(/agree to be contacted/i).check();
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("Request sent")).toBeVisible({ timeout: 10000 });

    // The dealer should see it in their lead inbox.
    const dealerPage = await context.newPage();
    await dealerPage.goto("/dealer/login");
    await dealerPage.getByLabel("Email").fill(dealerEmail);
    await dealerPage.getByLabel("Password").fill(DEMO_PASSWORD);
    await dealerPage.getByRole("button", { name: "Sign in" }).click();
    await dealerPage.waitForURL(/\/dealer$/, { timeout: 15000 });
    await dealerPage.goto("/dealer/leads");
    await expect(dealerPage.getByText("E2E Test Lead").first()).toBeVisible({ timeout: 10000 });
  });
});
