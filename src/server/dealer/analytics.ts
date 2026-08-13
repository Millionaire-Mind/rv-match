import { and, count, eq, gte, inArray, sql } from "drizzle-orm";

import { db } from "@/server/db/client";
import {
  attributedSales,
  behavioralEvents,
  dealerPilots,
  inventory,
  leadActivity,
  leads,
  savedInventory,
  swipeDecisions,
} from "@/server/db/schema";
import { computePilotStatus, daysRemaining as daysRemainingFor } from "@/server/pilot/logic";

export interface DealerKpis {
  inventoryLive: number;
  videosLive: number;
  impressions: number;
  qualifiedViews: number;
  completionRate: number | null;
  passes: number;
  likes: number;
  loves: number;
  saves: number;
  leadsCount: number;
  highIntentLeads: number;
  appointments: number;
  reportedSales: number;
  verifiedSales: number;
  leadToSaleConversion: number | null;
}

const HIGH_INTENT_THRESHOLD = 70;

/** All dashboard numbers here are live SQL aggregations — nothing hardcoded. */
export async function getDealerKpis(dealershipId: string, sinceDays: number): Promise<DealerKpis> {
  const since = sinceDays > 0 ? new Date(Date.now() - sinceDays * 86400000) : null;
  const dateFilter = since ? gte(behavioralEvents.createdAt, since) : undefined;

  const dealerInventoryIds = await db
    .select({ id: inventory.id })
    .from(inventory)
    .where(eq(inventory.dealershipId, dealershipId));
  const invIds = dealerInventoryIds.map((r) => r.id);

  const [inventoryLiveRow] = await db
    .select({ n: count() })
    .from(inventory)
    .where(and(eq(inventory.dealershipId, dealershipId), eq(inventory.status, "published")));

  const [videosLiveRow] = invIds.length
    ? await db
        .select({ n: count() })
        .from(inventory)
        .where(
          and(
            eq(inventory.dealershipId, dealershipId),
            eq(inventory.status, "published"),
            sql`${inventory.primaryVideoId} is not null`,
          ),
        )
    : [{ n: 0 }];

  async function eventCount(eventType: string): Promise<number> {
    if (invIds.length === 0) return 0;
    const [row] = await db
      .select({ n: count() })
      .from(behavioralEvents)
      .where(
        and(
          eq(behavioralEvents.dealershipId, dealershipId),
          eq(behavioralEvents.eventType, eventType),
          dateFilter,
        ),
      );
    return row?.n ?? 0;
  }

  const impressions = await eventCount("video_started");
  const qualifiedViews = await eventCount("video_complete");

  const swipeDateFilter = since ? gte(swipeDecisions.createdAt, since) : undefined;
  const decisionRows = invIds.length
    ? await db
        .select({ decision: swipeDecisions.decision, n: count() })
        .from(swipeDecisions)
        .where(and(inArray(swipeDecisions.inventoryId, invIds), swipeDateFilter))
        .groupBy(swipeDecisions.decision)
    : [];
  const byDecision = Object.fromEntries(decisionRows.map((d) => [d.decision, d.n]));

  const savedDateFilter = since ? gte(savedInventory.createdAt, since) : undefined;
  const [savesRow] = invIds.length
    ? await db
        .select({ n: count() })
        .from(savedInventory)
        .where(and(inArray(savedInventory.inventoryId, invIds), savedDateFilter))
    : [{ n: 0 }];

  const leadDateFilter = since ? gte(leads.createdAt, since) : undefined;
  const [leadsRow] = await db
    .select({ n: count() })
    .from(leads)
    .where(and(eq(leads.dealershipId, dealershipId), leadDateFilter));

  const [highIntentRow] = await db
    .select({ n: count() })
    .from(leads)
    .where(
      and(
        eq(leads.dealershipId, dealershipId),
        sql`${leads.intentScore} >= ${HIGH_INTENT_THRESHOLD}`,
        leadDateFilter,
      ),
    );

  const appointmentDateFilter = since ? gte(leadActivity.createdAt, since) : undefined;
  const [appointmentsRow] = await db
    .select({ n: count(sql`distinct ${leadActivity.leadId}`) })
    .from(leadActivity)
    .innerJoin(leads, eq(leadActivity.leadId, leads.id))
    .where(
      and(
        eq(leads.dealershipId, dealershipId),
        eq(leadActivity.toStatus, "appointment"),
        appointmentDateFilter,
      ),
    );

  const saleDateFilter = since ? gte(attributedSales.createdAt, since) : undefined;
  const [reportedSalesRow] = await db
    .select({ n: count() })
    .from(attributedSales)
    .where(and(eq(attributedSales.dealershipId, dealershipId), saleDateFilter));
  const [verifiedSalesRow] = await db
    .select({ n: count() })
    .from(attributedSales)
    .where(
      and(
        eq(attributedSales.dealershipId, dealershipId),
        eq(attributedSales.verificationStatus, "verified"),
        saleDateFilter,
      ),
    );

  const leadsCount = leadsRow?.n ?? 0;
  const verifiedSales = verifiedSalesRow?.n ?? 0;

  return {
    inventoryLive: inventoryLiveRow?.n ?? 0,
    videosLive: videosLiveRow?.n ?? 0,
    impressions,
    qualifiedViews,
    completionRate: impressions > 0 ? qualifiedViews / impressions : null,
    passes: byDecision.pass ?? 0,
    likes: byDecision.like ?? 0,
    loves: byDecision.love ?? 0,
    saves: savesRow?.n ?? 0,
    leadsCount,
    highIntentLeads: highIntentRow?.n ?? 0,
    appointments: appointmentsRow?.n ?? 0,
    reportedSales: reportedSalesRow?.n ?? 0,
    verifiedSales,
    leadToSaleConversion: leadsCount > 0 ? verifiedSales / leadsCount : null,
  };
}

export interface PilotSummary {
  status: "pending" | "active" | "conversion_due" | "converted" | "expired" | "suspended";
  daysRemaining: number;
  trialDays: number;
  salesThreshold: number;
  verifiedSalesCount: number;
  startedAt: Date;
}

export async function getPilotSummary(dealershipId: string): Promise<PilotSummary | null> {
  const [pilot] = await db
    .select()
    .from(dealerPilots)
    .where(eq(dealerPilots.dealershipId, dealershipId))
    .limit(1);
  if (!pilot) return null;

  return {
    status: computePilotStatus({
      verifiedSalesCount: pilot.verifiedSalesCount,
      salesThreshold: pilot.salesThreshold,
      startedAt: pilot.startedAt,
      trialDays: pilot.trialDays,
      storedStatus: pilot.status,
    }),
    daysRemaining: daysRemainingFor(pilot.startedAt, pilot.trialDays),
    trialDays: pilot.trialDays,
    salesThreshold: pilot.salesThreshold,
    verifiedSalesCount: pilot.verifiedSalesCount,
    startedAt: pilot.startedAt,
  };
}
