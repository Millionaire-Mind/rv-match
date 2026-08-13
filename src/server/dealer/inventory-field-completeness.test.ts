import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { dealershipUsers, dealerships, inventory } from "@/server/db/schema";

/**
 * Phase 13: widthInches, heightInches, hitchWeightLbs, bedConfiguration,
 * and interior already existed as inventory columns and in the Zod
 * validation schemas, but createInventory/updateInventory's explicit
 * `.values()`/`.set()` calls never referenced them - a dealer could type
 * a hitch weight into a form field that would validate successfully and
 * then be silently discarded. This proves the fix persists all five,
 * through both the manual form actions and CSV import.
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

beforeAll(async () => {
  const suffix = Date.now();
  const [dealership] = await db
    .insert(dealerships)
    .values({
      name: "__test_field_completeness__",
      slug: `__test-field-completeness-${suffix}`,
      primaryContactName: "Owner",
      primaryContactEmail: `field-completeness-${suffix}@example.com`,
      status: "approved",
    })
    .returning({ id: dealerships.id });
  dealershipId = dealership.id;

  const user = await localSignUp({ email: `field-completeness-${suffix}@example.com`, password: "TestPassword123!" });
  userId = user.userId;
  await db.insert(dealershipUsers).values({ dealershipId, userId, role: "owner" });
  asUser(userId);
});

afterAll(async () => {
  await db.delete(dealerships).where(eq(dealerships.id, dealershipId));
});

function baseFormData(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const defaults: Record<string, string> = {
    stockNumber: `FC-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    year: "2024",
    make: "Forest River",
    model: "Rockwood",
    rvType: "travel_trailer",
    condition: "new",
    salePrice: "35000",
    widthInches: "102",
    heightInches: "132",
    hitchWeightLbs: "650",
    sleeps: "6",
    bedConfiguration: "Queen + Bunks",
    exteriorColor: "Alpine White",
    interior: "Beige",
  };
  for (const [key, value] of Object.entries({ ...defaults, ...overrides })) {
    fd.set(key, value);
  }
  return fd;
}

describe("createInventory persists the full field set", () => {
  it("saves widthInches, heightInches, hitchWeightLbs, bedConfiguration, and interior", async () => {
    const result = await createInventory(dealershipId, { ok: false, error: "" }, baseFormData());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");

    const [row] = await db.select().from(inventory).where(eq(inventory.id, result.inventoryId));
    expect(row.widthInches).toBe(102);
    expect(row.heightInches).toBe(132);
    expect(row.hitchWeightLbs).toBe(650);
    expect(row.bedConfiguration).toBe("Queen + Bunks");
    expect(row.interior).toBe("Beige");
  });
});

describe("updateInventory persists the full field set", () => {
  it("saves updated widthInches/heightInches/hitchWeightLbs/bedConfiguration/interior", async () => {
    const created = await createInventory(dealershipId, { ok: false, error: "" }, baseFormData());
    if (!created.ok) throw new Error("unreachable");

    const updated = await updateInventory(
      dealershipId,
      created.inventoryId,
      { ok: false, error: "" },
      baseFormData({
        widthInches: "96",
        heightInches: "128",
        hitchWeightLbs: "700",
        bedConfiguration: "King",
        interior: "Charcoal",
      }),
    );
    expect(updated.ok).toBe(true);

    const [row] = await db.select().from(inventory).where(eq(inventory.id, created.inventoryId));
    expect(row.widthInches).toBe(96);
    expect(row.heightInches).toBe(128);
    expect(row.hitchWeightLbs).toBe(700);
    expect(row.bedConfiguration).toBe("King");
    expect(row.interior).toBe("Charcoal");
  });
});

describe("CSV import persists the full field set", () => {
  it("saves width_inches/height_inches/hitch_weight_lbs/bed_configuration/interior from a CSV row", async () => {
    const csv = [
      "stock_number,year,make,model,rv_type,condition,sale_price,width_inches,height_inches,hitch_weight_lbs,bed_configuration,interior",
      `FC-CSV-${Date.now()},2024,Keystone,Montana,fifth_wheel,new,55000,101,133,1200,King,Slate`,
    ].join("\n");
    const file = new File([csv], "import.csv", { type: "text/csv" });
    const fd = new FormData();
    fd.set("file", file);

    const report = await importInventoryCsv(dealershipId, fd);
    expect(report.errors).toBe(0);
    expect(report.created).toBe(1);

    const [csvRow] = await db
      .select()
      .from(inventory)
      .where(and(eq(inventory.dealershipId, dealershipId), eq(inventory.model, "Montana")));
    expect(csvRow.widthInches).toBe(101);
    expect(csvRow.heightInches).toBe(133);
    expect(csvRow.hitchWeightLbs).toBe(1200);
    expect(csvRow.bedConfiguration).toBe("King");
    expect(csvRow.interior).toBe("Slate");
  });
});
