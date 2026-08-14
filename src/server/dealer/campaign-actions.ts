"use server";

import { and, count, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/server/db/client";
import { attributedSales, behavioralEvents, distributionCampaigns, inventory, leads } from "@/server/db/schema";
import { requireCampaignInDealership, requireDealerRole, requireInventoryInDealership } from "@/server/auth/guards";
import { LEAD_WORKING_ROLES, MARKETING_ROLES } from "@/server/dealer/permissions";
import { logAudit } from "@/server/audit/log";
import { generateUniqueCampaignCode } from "@/server/distribution/campaign-code";

export type CampaignFormState = { ok: false; error: string } | { ok: true; campaignId: string };

export async function createDealerCampaign(
  dealershipId: string,
  _prev: CampaignFormState,
  formData: FormData,
): Promise<CampaignFormState> {
  await requireDealerRole(dealershipId, MARKETING_ROLES);

  const name = String(formData.get("name") ?? "").trim();
  const inventoryIdRaw = String(formData.get("inventoryId") ?? "").trim();
  const inventoryId = inventoryIdRaw && inventoryIdRaw !== "__none__" ? inventoryIdRaw : null;
  if (!name) return { ok: false, error: "Name is required." };

  if (inventoryId) {
    await requireInventoryInDealership(dealershipId, inventoryId);
  }

  const code = await generateUniqueCampaignCode();
  const [row] = await db
    .insert(distributionCampaigns)
    .values({
      dealershipId,
      inventoryId,
      code,
      name,
      campaignType: inventoryId ? "dealer_inventory" : "dealer_general",
    })
    .returning({ id: distributionCampaigns.id });

  await logAudit({ action: "campaign.create", entityType: "distribution_campaign", entityId: row.id, dealershipId });
  revalidatePath("/dealer/distribution");
  return { ok: true, campaignId: row.id };
}

export async function setCampaignActive(dealershipId: string, campaignId: string, active: boolean): Promise<void> {
  await requireDealerRole(dealershipId, MARKETING_ROLES);
  await requireCampaignInDealership(dealershipId, campaignId);
  await db.update(distributionCampaigns).set({ active }).where(eq(distributionCampaigns.id, campaignId));
  revalidatePath("/dealer/distribution");
}

export async function deleteCampaign(dealershipId: string, campaignId: string): Promise<void> {
  await requireDealerRole(dealershipId, MARKETING_ROLES);
  await requireCampaignInDealership(dealershipId, campaignId);
  await db.delete(distributionCampaigns).where(eq(distributionCampaigns.id, campaignId));
  await logAudit({ action: "campaign.delete", entityType: "distribution_campaign", entityId: campaignId, dealershipId });
  revalidatePath("/dealer/distribution");
}

export interface CampaignWithStats {
  id: string;
  code: string;
  name: string;
  campaignType: string;
  active: boolean;
  inventoryLabel: string | null;
  createdAt: Date;
  scans: number;
  leadsCount: number;
  verifiedSales: number;
}

async function campaignStats(campaignId: string): Promise<{ scans: number; leadsCount: number; verifiedSales: number }> {
  const [scansRow] = await db
    .select({ n: count() })
    .from(behavioralEvents)
    .where(
      and(
        eq(behavioralEvents.eventType, "campaign_scan"),
        sql`${behavioralEvents.metadata}->>'campaignId' = ${campaignId}`,
      ),
    );
  const [leadsRow] = await db.select({ n: count() }).from(leads).where(eq(leads.firstCampaignId, campaignId));
  const [salesRow] = await db
    .select({ n: count() })
    .from(attributedSales)
    .where(and(eq(attributedSales.firstCampaignId, campaignId), eq(attributedSales.verificationStatus, "verified")));

  return { scans: scansRow?.n ?? 0, leadsCount: leadsRow?.n ?? 0, verifiedSales: salesRow?.n ?? 0 };
}

export async function getDealerCampaigns(dealershipId: string): Promise<CampaignWithStats[]> {
  await requireDealerRole(dealershipId, MARKETING_ROLES);

  const campaigns = await db
    .select({
      id: distributionCampaigns.id,
      code: distributionCampaigns.code,
      name: distributionCampaigns.name,
      campaignType: distributionCampaigns.campaignType,
      active: distributionCampaigns.active,
      createdAt: distributionCampaigns.createdAt,
      inventoryId: distributionCampaigns.inventoryId,
      year: inventory.year,
      make: inventory.make,
      model: inventory.model,
    })
    .from(distributionCampaigns)
    .leftJoin(inventory, eq(inventory.id, distributionCampaigns.inventoryId))
    .where(eq(distributionCampaigns.dealershipId, dealershipId))
    .orderBy(desc(distributionCampaigns.createdAt));

  const results: CampaignWithStats[] = [];
  for (const c of campaigns) {
    const stats = await campaignStats(c.id);
    results.push({
      id: c.id,
      code: c.code,
      name: c.name,
      campaignType: c.campaignType,
      active: c.active,
      inventoryLabel: c.inventoryId ? `${c.year} ${c.make} ${c.model}` : null,
      createdAt: c.createdAt,
      ...stats,
    });
  }
  return results;
}

/**
 * Gap 4A: a personal, self-service referral code for any dealer staff
 * member (not just marketing/owner, who manage the shared campaign list) -
 * reused rather than re-minted on every call, mirroring
 * createOrGetPartnerInviteLink's "reuse the pending one" pattern so a
 * salesperson's printed business cards/QR stay valid indefinitely.
 */
export async function getOrCreateSalespersonCampaign(dealershipId: string): Promise<CampaignWithStats> {
  const { userId } = await requireDealerRole(dealershipId, LEAD_WORKING_ROLES);

  const [existing] = await db
    .select()
    .from(distributionCampaigns)
    .where(
      and(
        eq(distributionCampaigns.dealershipId, dealershipId),
        eq(distributionCampaigns.salespersonUserId, userId),
        eq(distributionCampaigns.campaignType, "salesperson"),
      ),
    )
    .limit(1);

  const campaign =
    existing ??
    (
      await db
        .insert(distributionCampaigns)
        .values({
          dealershipId,
          salespersonUserId: userId,
          code: await generateUniqueCampaignCode(),
          name: "My Referral Link",
          campaignType: "salesperson",
        })
        .returning()
    )[0];

  const stats = await campaignStats(campaign.id);
  return {
    id: campaign.id,
    code: campaign.code,
    name: campaign.name,
    campaignType: campaign.campaignType,
    active: campaign.active,
    inventoryLabel: null,
    createdAt: campaign.createdAt,
    ...stats,
  };
}
