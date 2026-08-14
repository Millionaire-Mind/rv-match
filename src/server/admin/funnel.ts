import { count, eq, sql } from "drizzle-orm";

import { db } from "@/server/db/client";
import { anonymousSessions, attributedSales, behavioralEvents, consumerProfiles, leads } from "@/server/db/schema";

export interface FunnelSegment {
  /** The full first-touch acquisition-source taxonomy from
   * src/server/attribution/source.ts (Gap 4F) - "dealer" | "salesperson" |
   * "qr" | "campaign" | "creator" | "social" | "organic" | "referral" |
   * "partner" | "direct" | "unknown". Never collapses social/organic/
   * referral into "direct" - the underlying data already distinguishes
   * them, this just groups by whatever classifyOrganicSource/
   * classifyCampaignSource actually recorded. */
  source: string;
  /** One anonymous session = one visitor in this cookie-based identity model. */
  sessionsStarted: number;
  discoveryStarters: number;
  threeDecisionUsers: number;
  activatedShoppers: number;
  /** Reached the 20-decision Match Results page (the real `match_completed` behavioral event). */
  matchCompleters: number;
  accountsCreated: number;
  /** A session whose last visit came meaningfully after its first (see RETURNING_THRESHOLD_MS below) - a real repeat visit, not a fabricated "loyalty" metric. */
  returningShoppers: number;
  partnerInvites: number;
  leadsCount: number;
  /** The subset of leads whose CTA was specifically "schedule a walkthrough." */
  appointmentsCount: number;
  /** Every dealer-reported sale regardless of verification status - "sold" (dealer's own claim), distinct from the admin-verified subset below. */
  reportedSales: number;
  verifiedSales: number;
}

const UNKNOWN = "unknown";
const RETURNING_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour - a later request this much after session creation is a genuine repeat visit, not just page-to-page navigation within one sitting.

/**
 * The acquisition funnel from src/server/admin/analytics.ts's
 * getActivationFunnel, but broken out per first-touch source instead of
 * aggregated - the "First 10,000" view. Independently-grouped queries
 * (one per stage/table) merged by source key, since each stage lives on a
 * different table and a single join across all of them would either drop
 * rows (inner joins) or duplicate counts (fan-out joins).
 */
export async function getAcquisitionFunnelBySource(): Promise<FunnelSegment[]> {
  const sourceExpr = sql<string>`coalesce(${anonymousSessions.firstSource}, ${UNKNOWN})`;

  // Grouped by ordinal position (GROUP BY 1) rather than repeating the
  // coalesce(...) expression in the GROUP BY clause - Postgres treats the
  // SELECT-list copy and a re-rendered GROUP BY copy of the same drizzle
  // `sql` template as textually distinct expressions (one comes out
  // qualified, the other unqualified), which it then rejects as "not in
  // GROUP BY" even though they're semantically identical.
  const [sessionRows, returningRows, profileRows, eventRows, leadRows, appointmentRows, saleRows] = await Promise.all([
    db.select({ source: sourceExpr, n: count() }).from(anonymousSessions).groupBy(sql`1`),
    db
      .select({ source: sourceExpr, n: count() })
      .from(anonymousSessions)
      .where(sql`extract(epoch from (${anonymousSessions.lastSeenAt} - ${anonymousSessions.createdAt})) * 1000 > ${RETURNING_THRESHOLD_MS}`)
      .groupBy(sql`1`),
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
      .select({
        source: sql<string>`coalesce(${anonymousSessions.firstSource}, ${UNKNOWN})`,
        discoveryStarted: sql<number>`count(distinct ${behavioralEvents.consumerProfileId}) filter (where ${behavioralEvents.eventType} = 'discovery_started')`,
        matchCompleted: sql<number>`count(distinct ${behavioralEvents.consumerProfileId}) filter (where ${behavioralEvents.eventType} = 'match_completed')`,
        partnerInvites: sql<number>`count(*) filter (where ${behavioralEvents.eventType} = 'partner_invite_created')`,
      })
      .from(behavioralEvents)
      .innerJoin(consumerProfiles, eq(behavioralEvents.consumerProfileId, consumerProfiles.id))
      .leftJoin(anonymousSessions, eq(consumerProfiles.anonymousSessionId, anonymousSessions.id))
      .groupBy(sql`1`),
    db
      .select({ source: sql<string>`coalesce(${leads.firstSource}, ${UNKNOWN})`, n: count() })
      .from(leads)
      .groupBy(sql`1`),
    db
      .select({ source: sql<string>`coalesce(${leads.firstSource}, ${UNKNOWN})`, n: count() })
      .from(leads)
      .where(eq(leads.ctaType, "schedule_walkthrough"))
      .groupBy(sql`1`),
    db
      .select({
        source: sql<string>`coalesce(${attributedSales.firstSource}, ${UNKNOWN})`,
        reported: count(),
        verified: sql<number>`count(*) filter (where ${attributedSales.verificationStatus} = 'verified')`,
      })
      .from(attributedSales)
      .groupBy(sql`1`),
  ]);

  const bySource = new Map<string, FunnelSegment>();
  function ensure(source: string): FunnelSegment {
    let seg = bySource.get(source);
    if (!seg) {
      seg = {
        source,
        sessionsStarted: 0,
        discoveryStarters: 0,
        threeDecisionUsers: 0,
        activatedShoppers: 0,
        matchCompleters: 0,
        accountsCreated: 0,
        returningShoppers: 0,
        partnerInvites: 0,
        leadsCount: 0,
        appointmentsCount: 0,
        reportedSales: 0,
        verifiedSales: 0,
      };
      bySource.set(source, seg);
    }
    return seg;
  }

  for (const r of sessionRows) ensure(r.source).sessionsStarted = r.n;
  for (const r of returningRows) ensure(r.source).returningShoppers = r.n;
  for (const r of profileRows) {
    const seg = ensure(r.source);
    seg.threeDecisionUsers = Number(r.threeDecisions);
    seg.activatedShoppers = Number(r.activated);
    seg.accountsCreated = Number(r.accounts);
  }
  for (const r of eventRows) {
    const seg = ensure(r.source);
    seg.discoveryStarters = Number(r.discoveryStarted);
    seg.matchCompleters = Number(r.matchCompleted);
    seg.partnerInvites = Number(r.partnerInvites);
  }
  for (const r of leadRows) ensure(r.source).leadsCount = r.n;
  for (const r of appointmentRows) ensure(r.source).appointmentsCount = r.n;
  for (const r of saleRows) {
    const seg = ensure(r.source);
    seg.reportedSales = Number(r.reported);
    seg.verifiedSales = Number(r.verified);
  }

  return [...bySource.values()].sort((a, b) => b.sessionsStarted - a.sessionsStarted);
}
