import { count, eq, sql } from "drizzle-orm";

import { db } from "@/server/db/client";
import { anonymousSessions, attributedSales, consumerProfiles, leads } from "@/server/db/schema";

export interface FunnelSegment {
  /** "direct" | "qr" | "creator" | "partner" | "unknown" - real values as
   * actually recorded by getOrCreateAnonymousSessionId, /go/[code], and the
   * partner-invite flow. Never fabricates "social"/"organic" buckets - this
   * platform has no UTM-parameter capture yet, so a visit from social media
   * or a search engine is indistinguishable from "direct" today. */
  source: string;
  sessionsStarted: number;
  threeDecisionUsers: number;
  activatedShoppers: number;
  accountsCreated: number;
  leadsCount: number;
  verifiedSales: number;
}

const UNKNOWN = "unknown";

/**
 * The acquisition funnel from src/server/admin/analytics.ts's
 * getActivationFunnel, but broken out per first-touch source instead of
 * aggregated - the "First 10,000" view. Four independently-grouped queries
 * (sessions, consumer-profile stages, leads, verified sales) merged by
 * source key, since each stage lives on a different table and a single
 * join across all of them would either drop rows (inner joins) or
 * duplicate counts (fan-out joins).
 */
export async function getAcquisitionFunnelBySource(): Promise<FunnelSegment[]> {
  const sourceExpr = sql<string>`coalesce(${anonymousSessions.firstSource}, ${UNKNOWN})`;

  // Grouped by ordinal position (GROUP BY 1) rather than repeating the
  // coalesce(...) expression in the GROUP BY clause - Postgres treats the
  // SELECT-list copy and a re-rendered GROUP BY copy of the same drizzle
  // `sql` template as textually distinct expressions (one comes out
  // qualified, the other unqualified), which it then rejects as "not in
  // GROUP BY" even though they're semantically identical.
  const [sessionRows, profileRows, leadRows, saleRows] = await Promise.all([
    db.select({ source: sourceExpr, n: count() }).from(anonymousSessions).groupBy(sql`1`),
    db
      .select({
        source: sourceExpr,
        threeDecisions: sql<number>`count(*) filter (where ${consumerProfiles.decisionsCount} >= 3)`,
        activated: sql<number>`count(*) filter (where ${consumerProfiles.decisionsCount} >= 10)`,
        accounts: sql<number>`count(*) filter (where ${consumerProfiles.userId} is not null)`,
      })
      .from(consumerProfiles)
      .leftJoin(anonymousSessions, eq(consumerProfiles.anonymousSessionId, anonymousSessions.id))
      .groupBy(sql`1`),
    db
      .select({ source: sql<string>`coalesce(${leads.firstSource}, ${UNKNOWN})`, n: count() })
      .from(leads)
      .groupBy(sql`1`),
    db
      .select({ source: sql<string>`coalesce(${attributedSales.firstSource}, ${UNKNOWN})`, n: count() })
      .from(attributedSales)
      .where(eq(attributedSales.verificationStatus, "verified"))
      .groupBy(sql`1`),
  ]);

  const bySource = new Map<string, FunnelSegment>();
  function ensure(source: string): FunnelSegment {
    let seg = bySource.get(source);
    if (!seg) {
      seg = {
        source,
        sessionsStarted: 0,
        threeDecisionUsers: 0,
        activatedShoppers: 0,
        accountsCreated: 0,
        leadsCount: 0,
        verifiedSales: 0,
      };
      bySource.set(source, seg);
    }
    return seg;
  }

  for (const r of sessionRows) ensure(r.source).sessionsStarted = r.n;
  for (const r of profileRows) {
    const seg = ensure(r.source);
    seg.threeDecisionUsers = Number(r.threeDecisions);
    seg.activatedShoppers = Number(r.activated);
    seg.accountsCreated = Number(r.accounts);
  }
  for (const r of leadRows) ensure(r.source).leadsCount = r.n;
  for (const r of saleRows) ensure(r.source).verifiedSales = r.n;

  return [...bySource.values()].sort((a, b) => b.sessionsStarted - a.sessionsStarted);
}
