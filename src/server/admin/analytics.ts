import { count, countDistinct, eq, gte, sql } from "drizzle-orm";

import { db } from "@/server/db/client";
import {
  attributedSales,
  behavioralEvents,
  consumerProfiles,
  dealerships,
  inventory,
  leads,
} from "@/server/db/schema";

export interface PlatformTotals {
  dealershipsApproved: number;
  dealershipsPending: number;
  inventoryPublished: number;
  consumersTotal: number;
  consumersRegistered: number;
  leadsTotal: number;
  appointmentsTotal: number;
  salesReported: number;
  salesVerified: number;
}

export async function getPlatformTotals(): Promise<PlatformTotals> {
  const [
    approvedRow,
    pendingRow,
    inventoryRow,
    consumersRow,
    registeredRow,
    leadsRow,
    appointmentsRow,
    reportedRow,
    verifiedRow,
  ] = await Promise.all([
    db.select({ n: count() }).from(dealerships).where(eq(dealerships.status, "approved")),
    db.select({ n: count() }).from(dealerships).where(eq(dealerships.status, "pending")),
    db.select({ n: count() }).from(inventory).where(eq(inventory.status, "published")),
    db.select({ n: count() }).from(consumerProfiles),
    db.select({ n: count() }).from(consumerProfiles).where(sql`${consumerProfiles.userId} is not null`),
    db.select({ n: count() }).from(leads),
    db.select({ n: count() }).from(leads).where(eq(leads.status, "appointment")),
    db.select({ n: count() }).from(attributedSales),
    db.select({ n: count() }).from(attributedSales).where(eq(attributedSales.verificationStatus, "verified")),
  ]);

  return {
    dealershipsApproved: approvedRow[0]?.n ?? 0,
    dealershipsPending: pendingRow[0]?.n ?? 0,
    inventoryPublished: inventoryRow[0]?.n ?? 0,
    consumersTotal: consumersRow[0]?.n ?? 0,
    consumersRegistered: registeredRow[0]?.n ?? 0,
    leadsTotal: leadsRow[0]?.n ?? 0,
    appointmentsTotal: appointmentsRow[0]?.n ?? 0,
    salesReported: reportedRow[0]?.n ?? 0,
    salesVerified: verifiedRow[0]?.n ?? 0,
  };
}

export interface ActivationFunnel {
  discoveryStarters: number;
  threeDecisionUsers: number;
  activatedShoppers: number;
  matchCompleters: number;
  accountsCreated: number;
  leads: number;
}

/**
 * The core acquisition funnel. Simplified for V1: aggregate counts only,
 * not segmented by dealer/campaign/creator (that's explicitly deferred —
 * see IMPLEMENTATION_PLAN.md).
 */
export async function getActivationFunnel(): Promise<ActivationFunnel> {
  const [discoveryStarted, threeDecisions, activated, matchCompleted, accounts, leadsCount] =
    await Promise.all([
      db
        .select({ n: countDistinct(behavioralEvents.consumerProfileId) })
        .from(behavioralEvents)
        .where(eq(behavioralEvents.eventType, "discovery_started")),
      db
        .select({ n: count() })
        .from(consumerProfiles)
        .where(gte(consumerProfiles.decisionsCount, 3)),
      db
        .select({ n: count() })
        .from(consumerProfiles)
        .where(gte(consumerProfiles.decisionsCount, 10)),
      db
        .select({ n: countDistinct(behavioralEvents.consumerProfileId) })
        .from(behavioralEvents)
        .where(eq(behavioralEvents.eventType, "match_completed")),
      db.select({ n: count() }).from(consumerProfiles).where(sql`${consumerProfiles.userId} is not null`),
      db.select({ n: count() }).from(leads),
    ]);

  return {
    discoveryStarters: discoveryStarted[0]?.n ?? 0,
    threeDecisionUsers: threeDecisions[0]?.n ?? 0,
    activatedShoppers: activated[0]?.n ?? 0,
    matchCompleters: matchCompleted[0]?.n ?? 0,
    accountsCreated: accounts[0]?.n ?? 0,
    leads: leadsCount[0]?.n ?? 0,
  };
}
