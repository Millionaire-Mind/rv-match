import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { dealerships, distributionCampaigns, profiles } from "@/server/db/schema";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

let currentToken: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "rvm_auth" && currentToken ? { value: currentToken } : undefined),
    set: () => {},
    delete: () => {},
  }),
}));

const { localSignUp } = await import("@/server/auth/local-provider");
const { signSessionToken } = await import("@/server/auth/session-cookie");
const { listAllCampaigns, setCampaignActiveAdmin } = await import("@/server/admin/platform-campaigns");

let dealershipId: string;
let campaignId: string;
let adminUserId: string;
let nonAdminUserId: string;

beforeAll(async () => {
  const suffix = Date.now();
  const [dealership] = await db
    .insert(dealerships)
    .values({
      name: "__test_platform_campaigns__",
      slug: `__test-platform-campaigns-${suffix}`,
      primaryContactName: "Test",
      primaryContactEmail: `platform-campaigns-${suffix}@example.com`,
      status: "approved",
    })
    .returning({ id: dealerships.id });
  dealershipId = dealership.id;

  const [campaign] = await db
    .insert(distributionCampaigns)
    .values({ dealershipId, code: `pc-${suffix}`, name: "Lot QR Code", campaignType: "dealer_general", active: true })
    .returning({ id: distributionCampaigns.id });
  campaignId = campaign.id;

  const admin = await localSignUp({ email: `platform-campaigns-admin-${suffix}@example.com`, password: "TestPassword123!" });
  adminUserId = admin.userId;
  await db.update(profiles).set({ platformRole: "platform_admin" }).where(eq(profiles.id, adminUserId));

  const nonAdmin = await localSignUp({ email: `platform-campaigns-user-${suffix}@example.com`, password: "TestPassword123!" });
  nonAdminUserId = nonAdmin.userId;
});

afterAll(async () => {
  await db.delete(dealerships).where(eq(dealerships.id, dealershipId));
});

describe("listAllCampaigns", () => {
  it("includes campaigns across dealerships with their owner name attached", async () => {
    const rows = await listAllCampaigns();
    const row = rows.find((r) => r.id === campaignId);
    expect(row).toBeDefined();
    expect(row!.dealershipName).toBe("__test_platform_campaigns__");
    expect(row!.creatorName).toBeNull();
    expect(row!.active).toBe(true);
  });
});

describe("setCampaignActiveAdmin", () => {
  it("rejects a non-admin caller and leaves the campaign unchanged", async () => {
    currentToken = signSessionToken(nonAdminUserId);
    const { ForbiddenError } = await import("@/server/auth/guards");
    await expect(setCampaignActiveAdmin(campaignId, false)).rejects.toThrow(ForbiddenError);

    const [row] = await db.select().from(distributionCampaigns).where(eq(distributionCampaigns.id, campaignId));
    expect(row.active).toBe(true);
  });

  it("lets an admin deactivate a campaign regardless of which dealer owns it", async () => {
    currentToken = signSessionToken(adminUserId);
    await setCampaignActiveAdmin(campaignId, false);

    const [row] = await db.select().from(distributionCampaigns).where(eq(distributionCampaigns.id, campaignId));
    expect(row.active).toBe(false);
  });
});
