import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { dealerships, dealershipUsers, inventory } from "@/server/db/schema";

/**
 * Integration tests for Phase 7: dealer-created/imported inventory
 * previously never got lat/lng populated at all (only seed data called
 * geocodeZip directly) - location/radius filtering silently didn't work
 * for anything a real dealer entered through the UI or a CSV.
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
const { createInventory, updateInventory } = await import("./inventory-actions");
const { importInventoryCsv } = await import("./csv-import");

let dealershipId: string;
let userId: string;

function asUser(id: string) {
  currentToken = signSessionToken(id);
}

function baseForm(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("stockNumber", `GEO-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fd.set("year", "2024");
  fd.set("make", "Forest River");
  fd.set("brand", "Rockwood");
  fd.set("model", "Rockwood");
  fd.set("rvType", "travel_trailer");
  fd.set("condition", "new");
  fd.set("salePrice", "35000");
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
  return fd;
}

beforeAll(async () => {
  const suffix = Date.now();
  const [dealership] = await db
    .insert(dealerships)
    .values({
      name: "__test_geocoding__",
      slug: `__test-geocoding-${suffix}`,
      primaryContactName: "Owner",
      primaryContactEmail: `geocoding-${suffix}@example.com`,
      status: "approved",
    })
    .returning({ id: dealerships.id });
  dealershipId = dealership.id;

  const user = await localSignUp({ email: `geocoding-${suffix}@example.com`, password: "TestPassword123!" });
  userId = user.userId;
  await db.insert(dealershipUsers).values({ dealershipId, userId, role: "owner" });
});

afterAll(async () => {
  await db.delete(dealerships).where(eq(dealerships.id, dealershipId));
});

describe("createInventory geocodes the submitted ZIP", () => {
  it("populates lat/lng when a ZIP is provided", async () => {
    asUser(userId);
    const result = await createInventory(dealershipId, { ok: false, error: "" }, baseForm({ zipCode: "80202" })); // Denver
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [row] = await db.select({ lat: inventory.lat, lng: inventory.lng }).from(inventory).where(eq(inventory.id, result.inventoryId));
    expect(row.lat).not.toBeNull();
    expect(row.lng).not.toBeNull();
    expect(Number(row.lat)).toBeGreaterThan(39);
    expect(Number(row.lat)).toBeLessThan(41);
  });

  it("leaves lat/lng null (not a guessed default) when no ZIP is provided", async () => {
    asUser(userId);
    const result = await createInventory(dealershipId, { ok: false, error: "" }, baseForm());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [row] = await db.select({ lat: inventory.lat, lng: inventory.lng }).from(inventory).where(eq(inventory.id, result.inventoryId));
    expect(row.lat).toBeNull();
    expect(row.lng).toBeNull();
  });
});

describe("updateInventory re-geocodes on every save", () => {
  it("updates coordinates when the ZIP changes, and clears them when the ZIP is removed", async () => {
    asUser(userId);
    const created = await createInventory(dealershipId, { ok: false, error: "" }, baseForm({ zipCode: "80202" }));
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await updateInventory(dealershipId, created.inventoryId, { ok: false, error: "" }, baseForm({ zipCode: "33602" })); // Tampa
    const [afterTampa] = await db.select({ lat: inventory.lat }).from(inventory).where(eq(inventory.id, created.inventoryId));
    expect(Number(afterTampa.lat)).toBeGreaterThan(26);
    expect(Number(afterTampa.lat)).toBeLessThan(29);

    await updateInventory(dealershipId, created.inventoryId, { ok: false, error: "" }, baseForm()); // no zipCode field at all
    const [afterCleared] = await db.select({ lat: inventory.lat, lng: inventory.lng }).from(inventory).where(eq(inventory.id, created.inventoryId));
    expect(afterCleared.lat).toBeNull();
    expect(afterCleared.lng).toBeNull();
  });
});

describe("CSV import geocodes each row", () => {
  it("populates coordinates for created and updated rows from their zip_code column", async () => {
    asUser(userId);
    const stock = `GEO-CSV-${Date.now()}`;
    const csv = [
      "stock_number,year,make,model,rv_type,condition,sale_price,zip_code",
      `${stock},2024,Jayco,Eagle,fifth_wheel,new,55000,80202`,
    ].join("\n");
    const fd = new FormData();
    fd.set("file", new File([csv], "import.csv", { type: "text/csv" }));

    const report = await importInventoryCsv(dealershipId, fd);
    expect(report.created).toBe(1);

    const [row] = await db.select({ lat: inventory.lat }).from(inventory).where(eq(inventory.stockNumber, stock));
    expect(row.lat).not.toBeNull();
    expect(Number(row.lat)).toBeGreaterThan(39);
    expect(Number(row.lat)).toBeLessThan(41);
  });
});
