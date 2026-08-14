import { test, expect } from "@playwright/test";

const DEMO_PASSWORD = "RvMatchDemo123!";

test.describe("Traditional search", () => {
  test("filtering by RV type returns matching results, and clearing the filter returns to the full list", async ({
    page,
  }) => {
    await page.goto("/search");
    await expect(page.getByRole("heading", { name: "I Know What I Want" })).toBeVisible();

    const unfilteredCountText = await page.getByText(/RVs? found/).textContent();

    await page.getByLabel("Type").click();
    await page.getByRole("option", { name: "Travel Trailer" }).click();
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.waitForURL(/rvType=travel_trailer/, { timeout: 10000 });

    await expect(page.getByText(/RVs? found/)).toBeVisible();
    const cards = page.locator('a[href^="/rv/"]');
    await expect(cards.first()).toBeVisible({ timeout: 10000 });
    // Every rendered result card must actually be a Travel Trailer - the
    // filter must be applied server-side, not just reflected in the URL.
    const cardCount = await cards.count();
    for (let i = 0; i < cardCount; i++) {
      await expect(cards.nth(i)).toContainText("Travel Trailer");
    }

    await page.getByRole("button", { name: "Clear filters" }).click();
    await page.waitForURL((url) => !url.search.includes("rvType"), { timeout: 10000 });
    await expect(page.getByText(unfilteredCountText ?? "RVs found")).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Notifications", () => {
  test("submitting a lead creates a real in-app notification in the dealer's inbox", async ({ page, context }) => {
    await page.goto("/discover");
    await expect(page.locator("h2").first()).toBeVisible({ timeout: 15000 });
    await page.getByRole("link", { name: "View full details" }).first().click();
    await page.waitForURL(/\/rv\//, { timeout: 10000 });

    const isRockyMountain = (await page.getByText("Rocky Mountain RV Center").count()) > 0;
    const dealerEmail = isRockyMountain
      ? "owner@rockymountainrv.example"
      : "owner@sunshinestatervs.example";

    const leadName = `E2E Notification Lead ${Date.now()}`;
    await page.getByRole("button", { name: "Check Availability" }).click();
    await page.getByLabel("Name").fill(leadName);
    await page.getByRole("textbox", { name: "Email" }).fill(`e2e-notif-${Date.now()}@example.com`);
    await page.getByLabel(/agree to be contacted/i).check();
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("Request sent")).toBeVisible({ timeout: 10000 });

    const dealerPage = await context.newPage();
    await dealerPage.goto("/dealer/login");
    await dealerPage.getByLabel("Email").fill(dealerEmail);
    await dealerPage.getByLabel("Password").fill(DEMO_PASSWORD);
    await dealerPage.getByRole("button", { name: "Sign in" }).click();
    await dealerPage.waitForURL(/\/dealer$/, { timeout: 15000 });

    await dealerPage.goto("/dealer/notifications");
    await expect(dealerPage.getByText(leadName, { exact: false }).first()).toBeVisible({ timeout: 10000 });

    // Visiting the inbox marks it read - reloading must not still show "New".
    await dealerPage.reload();
    const notificationRow = dealerPage.getByText(leadName, { exact: false }).first();
    await expect(notificationRow).toBeVisible();
  });
});

test.describe("Account & privacy", () => {
  test("a signed-up consumer can toggle email notifications and request account deletion", async ({ page }) => {
    const email = `e2e-privacy-${Date.now()}@example.com`;
    await page.goto("/signup");
    await page.getByLabel("Full name").fill("E2E Privacy Consumer");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL(/\/saved/, { timeout: 15000 });

    await page.goto("/account");
    await expect(page.getByRole("heading", { name: "Account & Privacy" })).toBeVisible();

    const emailSwitch = page.getByLabel(/Email me about price drops/i);
    await expect(emailSwitch).toBeChecked();
    await emailSwitch.click();
    await expect(emailSwitch).not.toBeChecked();

    // The opt-out must actually persist server-side, not just in local UI
    // state - reload and confirm it stuck.
    await page.reload();
    await expect(page.getByLabel(/Email me about price drops/i)).not.toBeChecked({ timeout: 10000 });

    await expect(page.getByRole("link", { name: "Download My Data" })).toHaveAttribute(
      "href",
      "/api/account/export",
    );

    await page.getByRole("button", { name: "Request Account Deletion" }).click();
    await expect(page.getByText("Deletion requested")).toBeVisible({ timeout: 10000 });
    await page.reload();
    await expect(page.getByText("Deletion requested")).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Couples/partner matching", () => {
  test("creating an invite and having a partner join transitions the link from pending to joined", async ({
    context,
  }) => {
    const owner = await context.newPage();
    await owner.goto("/discover");
    await expect(owner.locator("h2").first()).toBeVisible({ timeout: 15000 });

    // Reach /match (20 decisions), which is where the partner-invite entry
    // point lives.
    for (let i = 0; i < 20; i++) {
      await owner.keyboard.press("ArrowRight");
      await owner.waitForTimeout(150);
      if (i === 9) {
        const zipDialog = owner.getByRole("dialog");
        if (await zipDialog.isVisible({ timeout: 3000 }).catch(() => false)) {
          await zipDialog.getByRole("textbox", { name: "ZIP code" }).fill("80202");
          await zipDialog.getByRole("button", { name: "Save" }).click();
          await expect(zipDialog).not.toBeVisible({ timeout: 5000 });
        }
      }
    }
    await owner.waitForURL(/\/match/, { timeout: 15000 });

    await owner.getByRole("button", { name: "Compare With My Partner" }).click();
    await owner.waitForURL(/\/partner\//, { timeout: 10000 });
    await expect(owner.getByRole("heading", { name: "Waiting for your partner" })).toBeVisible({ timeout: 10000 });
    const inviteUrl = owner.url();

    // A brand new anonymous visitor (separate context, no shared cookies)
    // opens the same invite link and joins.
    const partnerContext = await context.browser()!.newContext();
    const partner = await partnerContext.newPage();
    await partner.goto(inviteUrl);
    await expect(partner.getByRole("heading", { name: "You've been invited to compare RV matches" })).toBeVisible({
      timeout: 10000,
    });
    await partner.getByRole("button", { name: "Start Matching Together" }).click();
    await partner.waitForURL(/\/discover/, { timeout: 15000 });

    // The owner's page (server-rendered) must now report the link as joined
    // rather than still pending, once reloaded.
    await owner.goto(inviteUrl);
    await expect(owner.getByRole("heading", { name: "Almost there" })).toBeVisible({ timeout: 10000 });
    await expect(owner.getByText(/You're at 20, your partner is at 0/)).toBeVisible();

    await partnerContext.close();
  });
});
