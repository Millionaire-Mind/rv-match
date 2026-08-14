import { and, eq, gte, inArray, sql } from "drizzle-orm";

import { db } from "@/server/db/client";
import { attributedSales, behavioralEvents, distributionCampaigns, leads } from "@/server/db/schema";
import { requireDealerRole } from "@/server/auth/guards";
import { ANALYTICS_ROLES } from "@/server/dealer/permissions";

export interface DailyPoint {
  date: string; // YYYY-MM-DD
  impressions: number;
  engagement: number;
  leads: number;
  sales: number;
}

/**
 * Daily-bucketed counts backing the Analytics page's trend charts (Gap 5) -
 * every point is a real SQL aggregation over the same event/lead/sale
 * tables getDealerKpis already reads, just grouped by day instead of
 * collapsed into one window total. Days with zero activity are included
 * (not skipped), so a chart never silently implies more days of data than
 * actually exist.
 */
export async function getDealerTimeSeries(dealershipId: string, days: number): Promise<DailyPoint[]> {
  await requireDealerRole(dealershipId, ANALYTICS_ROLES);
  const boundedDays = Math.max(1, Math.min(days, 365));
  const since = new Date(Date.now() - boundedDays * 86400000);

  const [impressionRows, engagementRows, leadRows, saleRows] = await Promise.all([
    db
      .select({ day: sql<string>`to_char(${behavioralEvents.createdAt}, 'YYYY-MM-DD')`, n: sql<number>`count(*)::int` })
      .from(behavioralEvents)
      .where(
        and(
          eq(behavioralEvents.dealershipId, dealershipId),
          eq(behavioralEvents.eventType, "video_started"),
          gte(behavioralEvents.createdAt, since),
        ),
      )
      .groupBy(sql`1`),
    db
      .select({ day: sql<string>`to_char(${behavioralEvents.createdAt}, 'YYYY-MM-DD')`, n: sql<number>`count(*)::int` })
      .from(behavioralEvents)
      .where(
        and(
          eq(behavioralEvents.dealershipId, dealershipId),
          sql`${behavioralEvents.eventType} in ('like', 'love', 'more_like_this')`,
          gte(behavioralEvents.createdAt, since),
        ),
      )
      .groupBy(sql`1`),
    db
      .select({ day: sql<string>`to_char(${leads.createdAt}, 'YYYY-MM-DD')`, n: sql<number>`count(*)::int` })
      .from(leads)
      .where(and(eq(leads.dealershipId, dealershipId), gte(leads.createdAt, since)))
      .groupBy(sql`1`),
    db
      .select({ day: sql<string>`to_char(${attributedSales.createdAt}, 'YYYY-MM-DD')`, n: sql<number>`count(*)::int` })
      .from(attributedSales)
      .where(
        and(
          eq(attributedSales.dealershipId, dealershipId),
          eq(attributedSales.verificationStatus, "verified"),
          gte(attributedSales.createdAt, since),
        ),
      )
      .groupBy(sql`1`),
  ]);

  const impressionsByDay = new Map(impressionRows.map((r) => [r.day, r.n]));
  const engagementByDay = new Map(engagementRows.map((r) => [r.day, r.n]));
  const leadsByDay = new Map(leadRows.map((r) => [r.day, r.n]));
  const salesByDay = new Map(saleRows.map((r) => [r.day, r.n]));

  const points: DailyPoint[] = [];
  for (let i = boundedDays - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    points.push({
      date: key,
      impressions: impressionsByDay.get(key) ?? 0,
      engagement: engagementByDay.get(key) ?? 0,
      leads: leadsByDay.get(key) ?? 0,
      sales: salesByDay.get(key) ?? 0,
    });
  }
  return points;
}

export interface CampaignContribution {
  campaignId: string;
  name: string;
  campaignType: string;
  leadsCount: number;
  verifiedSales: number;
}

/**
 * Which distribution links are actually producing leads/sales, not just
 * scans - the "campaign contribution" comparative chart on the Analytics
 * page. Only campaigns with at least one attributed lead are included;
 * an unused link cluttering a chart isn't a useful comparison.
 */
export async function getCampaignContribution(dealershipId: string, sinceDays: number): Promise<CampaignContribution[]> {
  await requireDealerRole(dealershipId, ANALYTICS_ROLES);
  const since = sinceDays > 0 ? new Date(Date.now() - sinceDays * 86400000) : null;

  const campaigns = await db
    .select({ id: distributionCampaigns.id, name: distributionCampaigns.name, campaignType: distributionCampaigns.campaignType })
    .from(distributionCampaigns)
    .where(eq(distributionCampaigns.dealershipId, dealershipId));
  if (campaigns.length === 0) return [];
  const ids = campaigns.map((c) => c.id);

  const leadDateFilter = since ? gte(leads.createdAt, since) : undefined;
  const leadRows = await db
    .select({ campaignId: leads.firstCampaignId, n: sql<number>`count(*)::int` })
    .from(leads)
    .where(and(inArray(leads.firstCampaignId, ids), leadDateFilter))
    .groupBy(leads.firstCampaignId);

  const saleDateFilter = since ? gte(attributedSales.createdAt, since) : undefined;
  const saleRows = await db
    .select({ campaignId: attributedSales.firstCampaignId, n: sql<number>`count(*)::int` })
    .from(attributedSales)
    .where(
      and(
        inArray(attributedSales.firstCampaignId, ids),
        eq(attributedSales.verificationStatus, "verified"),
        saleDateFilter,
      ),
    )
    .groupBy(attributedSales.firstCampaignId);

  const leadsByCampaign = new Map(leadRows.filter((r) => r.campaignId).map((r) => [r.campaignId as string, r.n]));
  const salesByCampaign = new Map(saleRows.filter((r) => r.campaignId).map((r) => [r.campaignId as string, r.n]));

  return campaigns
    .map((c) => ({
      campaignId: c.id,
      name: c.name,
      campaignType: c.campaignType,
      leadsCount: leadsByCampaign.get(c.id) ?? 0,
      verifiedSales: salesByCampaign.get(c.id) ?? 0,
    }))
    .filter((c) => c.leadsCount > 0)
    .sort((a, b) => b.leadsCount - a.leadsCount);
}
