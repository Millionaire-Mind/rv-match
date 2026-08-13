import { test, expect } from "@playwright/test";

const DEMO_PASSWORD = "RvMatchDemo123!";

async function loginAsAdmin(page: import("@playwright/test").Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill("admin@rvmatch.app");
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/admin$/, { timeout: 15000 });
}

async function loginAsDealer(page: import("@playwright/test").Page) {
  await page.goto("/dealer/login");
  await page.getByLabel("Email").fill("owner@rockymountainrv.example");
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/dealer$/, { timeout: 15000 });
}

test.describe("Admin journey", () => {
  test("admin can approve a newly-submitted dealer application", async ({ page, context }) => {
    const dealershipName = `E2E Test Dealership ${Date.now()}`;
    const email = `e2e-admin-${Date.now()}@example.com`;

    await page.goto("/dealer/apply");
    await page.getByLabel("Dealership name").fill(dealershipName);
    await page.getByLabel("Address").fill("1 Test Way");
    await page.getByLabel("City").fill("Boulder");
    await page.getByLabel("State").fill("CO");
    await page.getByLabel("ZIP").fill("80301");
    await page.getByLabel("Phone").fill("555-000-1111");
    await page.getByLabel("Primary contact").fill("Test Owner");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(DEMO_PASSWORD);
    await page.getByLabel(/Dealer Agreement/).check();
    await page.getByRole("button", { name: "Submit Application" }).click();
    await expect(page.getByText("Application submitted")).toBeVisible({ timeout: 10000 });

    const adminPage = await context.newPage();
    await loginAsAdmin(adminPage);
    await adminPage.goto("/admin/dealers");
    const row = adminPage.locator("tr", { hasText: dealershipName });
    await expect(row).toBeVisible();
    await expect(row.getByText("Pending")).toBeVisible();

    await row.getByRole("button", { name: "Approve" }).click();
    await expect(row.getByText("Approved")).toBeVisible({ timeout: 10000 });

    // The new dealer owner should now see their dashboard instead of the
    // "pending approval" gate.
    const dealerPage = await context.newPage();
    await dealerPage.goto("/dealer/login");
    await dealerPage.getByLabel("Email").fill(email);
    await dealerPage.getByLabel("Password").fill(DEMO_PASSWORD);
    await dealerPage.getByRole("button", { name: "Sign in" }).click();
    await dealerPage.waitForURL(/\/dealer$/, { timeout: 15000 });
    await expect(dealerPage.getByText("Is RV Match producing value")).toBeVisible();
  });

  test("verifying a reported sale increments the dealer's pilot progress", async ({ page, browser }) => {
    // Consumer submits a lead on a Rocky Mountain RV.
    await page.goto("/discover");
    await expect(page.locator("h2").first()).toBeVisible({ timeout: 15000 });
    for (let i = 0; i < 10; i++) {
      const isRocky = (await page.getByText("Rocky Mountain RV Center").count()) > 0;
      if (isRocky) break;
      await page.getByRole("button", { name: "Pass" }).click();
      await page.waitForTimeout(300);
    }

    await page.getByRole("link", { name: "View full details" }).first().click();
    await page.waitForURL(/\/rv\//, { timeout: 10000 });
    await page.getByRole("button", { name: "Check Availability" }).click();
    const leadName = `E2E Sale Test ${Date.now()}`;
    await page.getByLabel("Name").fill(leadName);
    await page.getByRole("textbox", { name: "Email" }).fill(`${Date.now()}@example.com`);
    await page.getByLabel(/agree to be contacted/i).check();
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("Request sent")).toBeVisible({ timeout: 10000 });

    // Dealer marks it sold. Uses its own isolated browser context (not
    // just a new tab) so its session cookie can't be clobbered by the
    // admin login below — browser contexts share a cookie jar across all
    // pages/tabs opened from the same context.
    const dealerContext = await browser.newContext();
    const dealerPage = await dealerContext.newPage();
    await loginAsDealer(dealerPage);

    await dealerPage.goto("/dealer/pilot");
    const pilotBefore = await dealerPage.getByTestId("pilot-verified-sales").textContent();

    await dealerPage.goto("/dealer/leads");
    await dealerPage.locator("tr", { hasText: leadName }).getByRole("link").first().click();
    await dealerPage.waitForURL(/\/dealer\/leads\/[0-9a-f-]+$/);
    await dealerPage.locator('button[role="combobox"]').nth(0).click();
    await dealerPage.getByRole("option", { name: "sold" }).click();
    await dealerPage.getByRole("button", { name: "Confirm Sale" }).click();
    await expect(dealerPage.getByText("Sold").first()).toBeVisible({ timeout: 10000 });

    // Admin verifies the sale, in its own isolated context for the same
    // cookie-isolation reason as dealerContext above.
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await loginAsAdmin(adminPage);
    await adminPage.goto("/admin/sales");
    const saleRow = adminPage.locator("tr", { hasText: "Dealer Reported" }).first();
    await expect(saleRow).toBeVisible({ timeout: 10000 });
    await saleRow.getByRole("button", { name: "Verify" }).click();
    await expect(adminPage.getByText("Verified").first()).toBeVisible({ timeout: 10000 });

    // Pilot progress on the dealer side should now reflect one more
    // verified sale than before.
    await dealerPage.goto("/dealer/pilot");
    const pilotAfter = await dealerPage.getByTestId("pilot-verified-sales").textContent();
    const before = Number(pilotBefore?.split("/")[0]?.trim() ?? "0");
    const after = Number(pilotAfter?.split("/")[0]?.trim() ?? "0");
    expect(after).toBeGreaterThan(before);
  });
});
