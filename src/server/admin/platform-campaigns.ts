"use server";

import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/server/db/client";
import {
  attributedSales,
  behavioralEvents,
  creators,
  dealerships,
  distributionCampaigns,
  leads,
} from "@/server/db/schema";
import { requireAdmin } from "@/server/auth/guards";
import { logAudit } from "@/server/audit/log";

export interface PlatformCampaignRow {
  id: string;
  code: string;
  name: string;
  campaignType: string;
  active: boolean;
  dealershipName: string | null;
  creatorName: string | null;
  createdAt: Date;
  scans: number;
  leadsCount: number;
  verifiedSales: number;
}

/** Every distribution campaign on the platform - dealer-generated and
 * creator-referral alike - for platform-ops visibility and abuse response
 * (a creator or dealer campaign can be deactivated here independent of who
 * created it, e.g. if a link is being spammed or a creator relationship
 * ends). */
export async function listAllCampaigns(limit = 200): Promise<PlatformCampaignRow[]> {
  const campaigns = await db
    .select({
      id: distributionCampaigns.id,
      code: distributionCampaigns.code,
      name: distributionCampaigns.name,
      campaignType: distributionCampaigns.campaignType,
      active: distributionCampaigns.active,
      createdAt: distributionCampaigns.createdAt,
      dealershipName: dealerships.name,
      creatorName: creators.name,
    })
    .from(distributionCampaigns)
    .leftJoin(dealerships, eq(dealerships.id, distributionCampaigns.dealershipId))
    .leftJoin(creators, eq(creators.id, distributionCampaigns.creatorId))
    .orderBy(desc(distributionCampaigns.createdAt))
    .limit(limit);

  if (campaigns.length === 0) return [];

  const ids = campaigns.map((c) => c.id);
  const [leadRows, saleRows] = await Promise.all([
    db
      .select({ campaignId: leads.firstCampaignId, n: count() })
      .from(leads)
      .where(inArray(leads.firstCampaignId, ids))
      .groupBy(leads.firstCampaignId),
    db
      .select({ campaignId: attributedSales.firstCampaignId, n: count() })
      .from(attributedSales)
      .where(and(inArray(attributedSales.firstCampaignId, ids), eq(attributedSales.verificationStatus, "verified")))
      .groupBy(attributedSales.firstCampaignId),
  ]);
  const leadsByCampaign = new Map(leadRows.map((r) => [r.campaignId, r.n]));
  const salesByCampaign = new Map(saleRows.map((r) => [r.campaignId, r.n]));

  const results: PlatformCampaignRow[] = [];
  for (const c of campaigns) {
    const [scansRow] = await db
      .select({ n: count() })
      .from(behavioralEvents)
      .where(
        and(eq(behavioralEvents.eventType, "campaign_scan"), sql`${behavioralEvents.metadata}->>'campaignId' = ${c.id}`),
      );
    results.push({
      id: c.id,
      code: c.code,
      name: c.name,
      campaignType: c.campaignType,
      active: c.active,
      dealershipName: c.dealershipName,
      creatorName: c.creatorName,
      createdAt: c.createdAt,
      scans: scansRow?.n ?? 0,
      leadsCount: leadsByCampaign.get(c.id) ?? 0,
      verifiedSales: salesByCampaign.get(c.id) ?? 0,
    });
  }
  return results;
}

export async function setCampaignActiveAdmin(campaignId: string, active: boolean): Promise<void> {
  await requireAdmin();
  await db.update(distributionCampaigns).set({ active }).where(eq(distributionCampaigns.id, campaignId));
  await logAudit({ action: "campaign.admin_set_active", entityType: "distribution_campaign", entityId: campaignId, metadata: { active } });
  revalidatePath("/admin/campaigns");
}
