import { and, eq, gte, inArray, sql } from "drizzle-orm";

import { db } from "@/server/db/client";
import { attributedSales, behavioralEvents, inventory, leads, savedInventory, swipeDecisions } from "@/server/db/schema";
import { requireDealerRole } from "@/server/auth/guards";
import { ANALYTICS_ROLES } from "@/server/dealer/permissions";

export interface PerRvAnalyticsRow {
  inventoryId: string;
  year: number;
  make: string;
  model: string;
  status: "draft" | "published" | "sold" | "archived";
  impressions: number;
  completions: number;
  completionRate: number | null;
  passes: number;
  likes: number;
  loves: number;
  moreLikeThis: number;
  saves: number;
  leadsCount: number;
  verifiedSales: number;
}

/**
 * Per-RV breakdown of the same signals getDealerKpis() already aggregates
 * dealership-wide - "which units are actually working" is a different
 * question from "is the dealership working overall," and the dashboard
 * only ever answered the second one.
 */
export async function getPerRvAnalytics(dealershipId: string, sinceDays: number): Promise<PerRvAnalyticsRow[]> {
  await requireDealerRole(dealershipId, ANALYTICS_ROLES);
  const since = sinceDays > 0 ? new Date(Date.now() - sinceDays * 86400000) : null;

  const rvs = await db
    .select({ id: inventory.id, year: inventory.year, make: inventory.make, model: inventory.model, status: inventory.status })
    .from(inventory)
    .where(eq(inventory.dealershipId, dealershipId));
  if (rvs.length === 0) return [];
  const invIds = rvs.map((r) => r.id);

  const eventDateFilter = since ? gte(behavioralEvents.createdAt, since) : undefined;
  const eventRows = await db
    .select({
      inventoryId: behavioralEvents.inventoryId,
      eventType: behavioralEvents.eventType,
      n: sql<number>`count(*)::int`,
    })
    .from(behavioralEvents)
    .where(
      and(
        inArray(behavioralEvents.inventoryId, invIds),
        sql`${behavioralEvents.eventType} in ('video_started', 'video_complete')`,
        eventDateFilter,
      ),
    )
    .groupBy(behavioralEvents.inventoryId, behavioralEvents.eventType);

  const swipeDateFilter = since ? gte(swipeDecisions.createdAt, since) : undefined;
  const swipeRows = await db
    .select({ inventoryId: swipeDecisions.inventoryId, decision: swipeDecisions.decision, n: sql<number>`count(*)::int` })
    .from(swipeDecisions)
    .where(and(inArray(swipeDecisions.inventoryId, invIds), swipeDateFilter))
    .groupBy(swipeDecisions.inventoryId, swipeDecisions.decision);

  const savedDateFilter = since ? gte(savedInventory.createdAt, since) : undefined;
  const saveRows = await db
    .select({ inventoryId: savedInventory.inventoryId, n: sql<number>`count(*)::int` })
    .from(savedInventory)
    .where(and(inArray(savedInventory.inventoryId, invIds), savedDateFilter))
    .groupBy(savedInventory.inventoryId);

  const leadDateFilter = since ? gte(leads.createdAt, since) : undefined;
  const leadRows = await db
    .select({ inventoryId: leads.inventoryId, n: sql<number>`count(*)::int` })
    .from(leads)
    .where(and(inArray(leads.inventoryId, invIds), leadDateFilter))
    .groupBy(leads.inventoryId);

  const saleDateFilter = since ? gte(attributedSales.createdAt, since) : undefined;
  const saleRows = await db
    .select({ inventoryId: attributedSales.soldInventoryId, n: sql<number>`count(*)::int` })
    .from(attributedSales)
    .where(
      and(
        inArray(attributedSales.soldInventoryId, invIds),
        eq(attributedSales.verificationStatus, "verified"),
        saleDateFilter,
      ),
    )
    .groupBy(attributedSales.soldInventoryId);

  const impressionsByInv = new Map<string, number>();
  const completionsByInv = new Map<string, number>();
  for (const r of eventRows) {
    if (!r.inventoryId) continue;
    if (r.eventType === "video_started") impressionsByInv.set(r.inventoryId, r.n);
    else completionsByInv.set(r.inventoryId, r.n);
  }

  const swipesByInv = new Map<string, Record<string, number>>();
  for (const r of swipeRows) {
    const entry = swipesByInv.get(r.inventoryId) ?? {};
    entry[r.decision] = r.n;
    swipesByInv.set(r.inventoryId, entry);
  }

  const savesByInv = new Map(saveRows.map((r) => [r.inventoryId, r.n]));
  const leadsByInv = new Map(leadRows.filter((r) => r.inventoryId).map((r) => [r.inventoryId as string, r.n]));
  const salesByInv = new Map(saleRows.map((r) => [r.inventoryId, r.n]));

  return rvs.map((rv) => {
    const impressions = impressionsByInv.get(rv.id) ?? 0;
    const completions = completionsByInv.get(rv.id) ?? 0;
    const swipes = swipesByInv.get(rv.id) ?? {};
    return {
      inventoryId: rv.id,
      year: rv.year,
      make: rv.make,
      model: rv.model,
      status: rv.status,
      impressions,
      completions,
      completionRate: impressions > 0 ? completions / impressions : null,
      passes: swipes.pass ?? 0,
      likes: swipes.like ?? 0,
      loves: swipes.love ?? 0,
      moreLikeThis: swipes.more_like_this ?? 0,
      saves: savesByInv.get(rv.id) ?? 0,
      leadsCount: leadsByInv.get(rv.id) ?? 0,
      verifiedSales: salesByInv.get(rv.id) ?? 0,
    };
  });
}
