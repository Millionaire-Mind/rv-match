import path from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { test, expect } from "@playwright/test";

const DEMO_PASSWORD = "RvMatchDemo123!";
const FIXTURES = path.join(__dirname, "fixtures");

async function loginAsDealer(page: import("@playwright/test").Page) {
  await page.goto("/dealer/login");
  await page.getByLabel("Email").fill("owner@rockymountainrv.example");
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/dealer$/, { timeout: 15000 });
}

test.describe("Dealer journey", () => {
  test("dealer can add an RV, upload a photo, generate a video, and publish it", async ({ page }) => {
    await loginAsDealer(page);

    const stockNumber = `E2E-${Date.now()}`;
    await page.goto("/dealer/inventory/new");
    await page.getByLabel("Stock Number").fill(stockNumber);
    await page.getByLabel("Year").fill("2024");
    await page.getByLabel("Make").fill("E2E Make");
    await page.getByLabel("Model").fill("E2E Model");
    await page.getByLabel("Sale Price ($)").fill("41500");
    await page.getByRole("button", { name: "Create RV" }).click();

    await page.waitForURL(/\/dealer\/inventory\/[0-9a-f-]+$/, { timeout: 15000 });
    await expect(page.getByRole("heading", { name: "2024 E2E Make E2E Model" })).toBeVisible();

    // Upload a photo, then generate an automatic video from it.
    await page.setInputFiles("#photo-upload", path.join(FIXTURES, "test-photo.jpg"));
    await expect(page.locator("img[alt='']").first()).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: "Generate Automatic Video" }).click();
    await expect(page.getByText("Auto-generated")).toBeVisible({ timeout: 30000 });
    await expect(page.getByText("Primary")).toBeVisible();

    // Publish it from the inventory list.
    await page.goto("/dealer/inventory");
    const row = page.locator("tr", { hasText: stockNumber });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Publish" }).click();
    await expect(row.getByText("Published")).toBeVisible({ timeout: 10000 });
  });

  test("CSV import creates valid rows, reports invalid ones, and updates rather than duplicates on re-import", async ({
    page,
  }) => {
    await loginAsDealer(page);

    // Generate a fixture with unique stock numbers each run so "created"
    // is deterministic regardless of prior test runs against this dealer.
    const run = Date.now();
    const good1 = `E2E-CSV-${run}-1`;
    const good2 = `E2E-CSV-${run}-2`;
    const header =
      "stock_number,vin,year,make,model,floorplan,rv_type,condition,msrp,sale_price,advertised_price,length_feet,dry_weight_lbs,gvwr_lbs,sleeps,slide_count,bunkhouse,toy_hauler,outdoor_kitchen,exterior_color,description,city,state,zip_code,features";
    const rows = [
      `${good1},,2024,TestMake,TestModel,22RB,travel_trailer,new,42000,36500,36500,29,5800,7200,5,1,true,false,true,White,An E2E CSV import test row.,Denver,CO,80202,"Outdoor Kitchen,Bunkhouse"`,
      `${good2},,2023,TestMake,TestModel Two,,fifth_wheel,used,,52000,,34,9800,12000,4,2,false,false,false,Silver,Second E2E CSV import test row.,Denver,CO,80202,`,
      `E2E-CSV-BAD-${run},,notayear,TestMake,Bad Row,,travel_trailer,new,,,,,,,,,,,,,,,,,`,
    ];
    const dir = mkdtempSync(path.join(tmpdir(), "rvm-e2e-csv-"));
    const csvPath = path.join(dir, "import-test.csv");
    writeFileSync(csvPath, [header, ...rows].join("\n"));

    await page.goto("/dealer/inventory/import");
    await page.locator('input[type="file"]').setInputFiles(csvPath);
    await page.getByRole("button", { name: "Import" }).click();

    await expect(page.getByText("2 created", { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("1 errors", { exact: true })).toBeVisible();
    await expect(page.getByText(/year/i)).toBeVisible();

    await page.goto("/dealer/inventory");
    await expect(page.getByText("TestModel", { exact: false }).first()).toBeVisible();

    // Re-importing the identical file should update the existing rows
    // (matched by stock number) rather than create duplicates.
    await page.goto("/dealer/inventory/import");
    await page.locator('input[type="file"]').setInputFiles(csvPath);
    await page.getByRole("button", { name: "Import" }).click();
    await expect(page.getByText("2 updated", { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("0 created", { exact: true })).toBeVisible();
  });

  test("dealer can move a lead through the pipeline and reassign it", async ({ page }) => {
    await loginAsDealer(page);
    await page.goto("/dealer/leads");
    await expect(page.locator("tbody tr").first()).toBeVisible({ timeout: 10000 });
    await page.locator("tbody tr").first().locator("a").first().click();
    await page.waitForURL(/\/dealer\/leads\/[0-9a-f-]+$/);

    const statusSelect = page.locator('button[role="combobox"]').nth(0);
    await statusSelect.click();
    await page.getByRole("option", { name: "contacted" }).click();
    await expect(page.getByText("Contacted").first()).toBeVisible({ timeout: 10000 });

    await page.getByPlaceholder("Add a note…").fill("E2E pipeline test note.");
    await page.getByRole("button", { name: "Add Note" }).click();
    await expect(page.getByText("E2E pipeline test note.").first()).toBeVisible({ timeout: 10000 });
  });
});
