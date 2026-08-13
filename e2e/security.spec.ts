import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";

import { db } from "../src/server/db/client";
import { dealerships, inventory, leads } from "../src/server/db/schema";

const DEMO_PASSWORD = "RvMatchDemo123!";

async function loginAsDealer(page: import("@playwright/test").Page, email: string) {
  await page.goto("/dealer/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/dealer$/, { timeout: 15000 });
}

test.describe("Security: tenant isolation and route protection", () => {
  test("Dealer A cannot view Dealer B's lead by guessing its URL", async ({ page }) => {
    const [sunshineDealer] = await db
      .select({ id: dealerships.id })
      .from(dealerships)
      .where(eq(dealerships.slug, "sunshine-state-rv-superstore"))
      .limit(1);
    const [sunshineLead] = await db
      .select({ id: leads.id })
      .from(leads)
      .where(eq(leads.dealershipId, sunshineDealer.id))
      .limit(1);
    expect(sunshineLead, "seed data must include at least one Sunshine State lead").toBeTruthy();

    await loginAsDealer(page, "owner@rockymountainrv.example");
    const response = await page.goto(`/dealer/leads/${sunshineLead.id}`);
    // Next.js renders the not-found boundary with a 200 by default for App
    // Router; what matters is that Dealer B's lead data never renders.
    expect(response?.status()).toBeLessThan(500);
    await expect(page.getByText(sunshineLead.id)).toHaveCount(0);
    const bodyText = await page.textContent("body");
    expect(bodyText).not.toContain("@sunshinestatervs");
  });

  test("Dealer A cannot edit Dealer B's inventory by guessing its URL", async ({ page }) => {
    const [sunshineDealer] = await db
      .select({ id: dealerships.id })
      .from(dealerships)
      .where(eq(dealerships.slug, "sunshine-state-rv-superstore"))
      .limit(1);
    const [sunshineRv] = await db
      .select({ id: inventory.id, stockNumber: inventory.stockNumber })
      .from(inventory)
      .where(eq(inventory.dealershipId, sunshineDealer.id))
      .limit(1);
    expect(sunshineRv).toBeTruthy();

    await loginAsDealer(page, "owner@rockymountainrv.example");
    await page.goto(`/dealer/inventory/${sunshineRv.id}`);
    // The edit form must not load with Dealer B's stock number/data.
    const bodyText = await page.textContent("body");
    expect(bodyText).not.toContain(sunshineRv.stockNumber);
  });

  test("an unauthenticated visitor is redirected away from the dealer dashboard", async ({ page }) => {
    await page.goto("/dealer");
    await page.waitForURL(/\/dealer\/login/, { timeout: 10000 });
  });

  test("an unauthenticated visitor is redirected away from the admin dashboard", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForURL(/\/admin\/login/, { timeout: 10000 });
  });

  test("a signed-in dealer (non-admin) cannot reach the admin dashboard", async ({ page }) => {
    await loginAsDealer(page, "owner@rockymountainrv.example");
    await page.goto("/admin");
    await page.waitForURL(/\/admin\/login/, { timeout: 10000 });
    await expect(page.getByText("Platform admin")).toBeVisible();
  });

  test("a signed-in consumer cannot reach dealer or admin routes", async ({ page }) => {
    const email = `e2e-consumer-${Date.now()}@example.com`;
    await page.goto("/signup");
    await page.getByLabel("Full name").fill("E2E Consumer");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL(/\/saved/, { timeout: 15000 });

    await page.goto("/dealer");
    await page.waitForURL(/\/dealer\/(login|apply)/, { timeout: 10000 });

    await page.goto("/admin");
    await page.waitForURL(/\/admin\/login/, { timeout: 10000 });
  });
});
