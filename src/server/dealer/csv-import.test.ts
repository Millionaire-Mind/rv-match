import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { dealershipUsers, dealerships, inventory } from "@/server/db/schema";

/**
 * Gap 7 (targeted gap-closure pass): CSV import needs a non-fatal warnings
 * channel distinct from the fatal errors a row is already rejected for -
 * a row with a missing-but-optional field, an unrecognized boolean
 * feature-flag token, or an unlocatable ZIP still imports successfully,
 * but the dealer should see it flagged.
 */

let currentToken: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "rvm_auth" && currentToken ? { value: currentToken } : undefined),
    set: () => {},
    delete: () => {},
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { localSignUp } = await import("@/server/auth/local-provider");
const { signSessionToken } = await import("@/server/auth/session-cookie");
const { importInventoryCsv } = await import("./csv-import");

let dealershipId: string;

beforeAll(async () => {
  const suffix = Date.now();
  const [dealership] = await db
    .insert(dealerships)
    .values({
      name: "__test_csv_warnings__",
      slug: `__test-csv-warnings-${suffix}`,
      primaryContactName: "Owner",
      primaryContactEmail: `csv-warnings-${suffix}@example.com`,
      status: "approved",
    })
    .returning({ id: dealerships.id });
  dealershipId = dealership.id;

  const owner = await localSignUp({ email: `csv-warnings-owner-${suffix}@example.com`, password: "TestPassword123!" });
  await db.insert(dealershipUsers).values({ dealershipId, userId: owner.userId, role: "owner" });
  currentToken = signSessionToken(owner.userId);
});

afterAll(async () => {
  await db.delete(dealerships).where(eq(dealerships.id, dealershipId));
});

describe("importInventoryCsv warnings channel", () => {
  it("still creates a row with a missing ZIP, missing MSRP, and no features, but flags each as a non-fatal warning", async () => {
    const stockNumber = `WARN-NOZIP-${Date.now()}`;
    const csv = [
      "stock_number,year,make,model,rv_type,condition,sale_price",
      `${stockNumber},2024,Forest River,Rockwood,travel_trailer,new,35000`,
    ].join("\n");
    const file = new File([csv], "import.csv", { type: "text/csv" });
    const fd = new FormData();
    fd.set("file", file);

    const report = await importInventoryCsv(dealershipId, fd);
    expect(report.errors).toBe(0);
    expect(report.created).toBe(1);
    expect(report.warnings).toBe(1);

    const row = report.rows[0];
    expect(row.status).toBe("created");
    expect(row.warnings.some((w) => w.includes("ZIP"))).toBe(true);
    expect(row.warnings.some((w) => w.includes("MSRP"))).toBe(true);
    expect(row.warnings.some((w) => w.includes("features"))).toBe(true);

    const [rv] = await db.select().from(inventory).where(eq(inventory.stockNumber, stockNumber));
    expect(rv).toBeDefined();
    expect(rv.status).toBe("draft");
  });

  it("flags a ZIP code that can't be located as a coordinate-unavailable warning, not a fatal error", async () => {
    const stockNumber = `WARN-BADZIP-${Date.now()}`;
    const csv = [
      "stock_number,year,make,model,rv_type,condition,sale_price,zip_code",
      `${stockNumber},2024,Forest River,Rockwood,travel_trailer,new,35000,ab`,
    ].join("\n");
    const file = new File([csv], "import.csv", { type: "text/csv" });
    const fd = new FormData();
    fd.set("file", file);

    const report = await importInventoryCsv(dealershipId, fd);
    expect(report.errors).toBe(0);
    expect(report.created).toBe(1);
    expect(report.rows[0].warnings.some((w) => w.includes("could not be located"))).toBe(true);
  });

  it("flags an unrecognized boolean value for bunkhouse/toy_hauler/outdoor_kitchen without rejecting the row", async () => {
    const stockNumber = `WARN-BOOL-${Date.now()}`;
    const csv = [
      "stock_number,year,make,model,rv_type,condition,sale_price,zip_code,msrp,features,bunkhouse",
      `${stockNumber},2024,Forest River,Rockwood,travel_trailer,new,35000,80202,38000,Solar Prep,TBD`,
    ].join("\n");
    const file = new File([csv], "import.csv", { type: "text/csv" });
    const fd = new FormData();
    fd.set("file", file);

    const report = await importInventoryCsv(dealershipId, fd);
    expect(report.errors).toBe(0);
    expect(report.created).toBe(1);
    expect(report.warnings).toBe(1);
    expect(report.rows[0].warnings.some((w) => w.includes('Unrecognized value "TBD"'))).toBe(true);

    const [rv] = await db.select().from(inventory).where(eq(inventory.stockNumber, stockNumber));
    expect(rv.bunkhouse).toBe(false);
  });

  it("produces no warnings for a fully-specified row", async () => {
    const stockNumber = `WARN-CLEAN-${Date.now()}`;
    const csv = [
      "stock_number,year,make,brand,model,rv_type,condition,sale_price,zip_code,msrp,features",
      `${stockNumber},2024,Forest River,Rockwood,Rockwood Mini Lite,travel_trailer,new,35000,80202,38000,Solar Prep`,
    ].join("\n");
    const file = new File([csv], "import.csv", { type: "text/csv" });
    const fd = new FormData();
    fd.set("file", file);

    const report = await importInventoryCsv(dealershipId, fd);
    expect(report.warnings).toBe(0);
    expect(report.rows[0].warnings).toEqual([]);
  });
});
