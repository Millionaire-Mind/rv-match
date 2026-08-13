import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { dealershipUsers, dealerships, distributionCampaigns, inventory } from "@/server/db/schema";

/**
 * IDOR test for the Phase 17-19 campaign guard (requireCampaignInDealership),
 * following the same pattern already proven for inventory/video/feed-source
 * ownership: Dealer A is a legitimate member of Dealership A, but must
 * still be rejected when the campaign id they supply belongs to Dealership B.
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
const { ForbiddenError } = await import("@/server/auth/guards");
const { createDealerCampaign, setCampaignActive, deleteCampaign } = await import("./campaign-actions");

let dealershipAId: string;
let dealershipBId: string;
let userAId: string;
let campaignBId: string;
let invBId: string;

function asUser(userId: string) {
  currentToken = signSessionToken(userId);
}

beforeAll(async () => {
  const suffix = Date.now();
  const [dealershipA] = await db
    .insert(dealerships)
    .values({
      name: "__test_campaign_dealer_A__",
      slug: `__test-campaign-dealer-a-${suffix}`,
      primaryContactName: "A Owner",
      primaryContactEmail: `campaign-a-${suffix}@example.com`,
      status: "approved",
    })
    .returning({ id: dealerships.id });
  dealershipAId = dealershipA.id;

  const [dealershipB] = await db
    .insert(dealerships)
    .values({
      name: "__test_campaign_dealer_B__",
      slug: `__test-campaign-dealer-b-${suffix}`,
      primaryContactName: "B Owner",
      primaryContactEmail: `campaign-b-${suffix}@example.com`,
      status: "approved",
    })
    .returning({ id: dealerships.id });
  dealershipBId = dealershipB.id;

  const userA = await localSignUp({ email: `campaign-idor-a-${suffix}@example.com`, password: "TestPassword123!" });
  userAId = userA.userId;
  const userB = await localSignUp({ email: `campaign-idor-b-${suffix}@example.com`, password: "TestPassword123!" });

  await db.insert(dealershipUsers).values([
    { dealershipId: dealershipAId, userId: userAId, role: "owner" },
    { dealershipId: dealershipBId, userId: userB.userId, role: "owner" },
  ]);

  const [invB] = await db
    .insert(inventory)
    .values({
      dealershipId: dealershipBId,
      stockNumber: `CAMPAIGN-B-${suffix}`,
      year: 2024,
      make: "Jayco",
      model: "Eagle",
      rvType: "fifth_wheel",
      condition: "new",
      salePriceCents: 5500000,
      status: "published",
      source: "manual",
    })
    .returning({ id: inventory.id });
  invBId = invB.id;

  const [campaignB] = await db
    .insert(distributionCampaigns)
    .values({ dealershipId: dealershipBId, code: `campaign-b-${suffix}`, name: "B's Campaign", campaignType: "dealer_general" })
    .returning({ id: distributionCampaigns.id });
  campaignBId = campaignB.id;
});

afterAll(async () => {
  await db.delete(dealerships).where(eq(dealerships.id, dealershipAId));
  await db.delete(dealerships).where(eq(dealerships.id, dealershipBId));
});

describe("campaign ownership guard (IDOR)", () => {
  it("blocks Dealer A from pausing/resuming Dealer B's campaign", async () => {
    asUser(userAId);
    await expect(setCampaignActive(dealershipAId, campaignBId, false)).rejects.toThrow(ForbiddenError);

    const [row] = await db.select({ active: distributionCampaigns.active }).from(distributionCampaigns).where(eq(distributionCampaigns.id, campaignBId));
    expect(row.active).toBe(true);
  });

  it("blocks Dealer A from deleting Dealer B's campaign", async () => {
    asUser(userAId);
    await expect(deleteCampaign(dealershipAId, campaignBId)).rejects.toThrow(ForbiddenError);

    const [row] = await db.select({ id: distributionCampaigns.id }).from(distributionCampaigns).where(eq(distributionCampaigns.id, campaignBId));
    expect(row).toBeDefined();
  });

  it("blocks Dealer A from creating a campaign targeting Dealer B's inventory", async () => {
    asUser(userAId);
    const fd = new FormData();
    fd.set("name", "Sneaky campaign");
    fd.set("inventoryId", invBId);
    await expect(createDealerCampaign(dealershipAId, { ok: false, error: "" }, fd)).rejects.toThrow(ForbiddenError);

    const rows = await db.select().from(distributionCampaigns).where(eq(distributionCampaigns.name, "Sneaky campaign"));
    expect(rows).toHaveLength(0);
  });
});

describe("campaign role gate (marketing, not just management)", () => {
  it("allows a marketing-role user to create a campaign - the role the permission matrix defines this feature for", async () => {
    const suffix = Date.now();
    const marketer = await localSignUp({ email: `campaign-marketing-${suffix}@example.com`, password: "TestPassword123!" });
    await db.insert(dealershipUsers).values({ dealershipId: dealershipAId, userId: marketer.userId, role: "marketing" });
    asUser(marketer.userId);

    const fd = new FormData();
    fd.set("name", "Marketing-created link");
    const result = await createDealerCampaign(dealershipAId, { ok: false, error: "" }, fd);
    expect(result.ok).toBe(true);
  });

  it("rejects a sales_manager - campaigns/distribution is scoped to owner/marketing, not sales management", async () => {
    const suffix = Date.now();
    const salesManager = await localSignUp({ email: `campaign-salesmgr-${suffix}@example.com`, password: "TestPassword123!" });
    await db.insert(dealershipUsers).values({ dealershipId: dealershipAId, userId: salesManager.userId, role: "sales_manager" });
    asUser(salesManager.userId);

    const fd = new FormData();
    fd.set("name", "Should be blocked");
    await expect(createDealerCampaign(dealershipAId, { ok: false, error: "" }, fd)).rejects.toThrow(ForbiddenError);
  });
});
