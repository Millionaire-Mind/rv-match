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
  uniqueViewers: number;
  avgWatchSeconds: number | null;
  completions: number;
  completionRate: number | null;
  passes: number;
  likes: number;
  loves: number;
  moreLikeThis: number;
  passRate: number | null;
  likeRate: number | null;
  loveRate: number | null;
  saves: number;
  saveRate: number | null;
  detailViews: number;
  detailViewRate: number | null;
  leadsCount: number;
  leadRate: number | null;
  verifiedSales: number;
  salesConversionRate: number | null;
  /** A short, deterministic, threshold-based observation - never AI
   * speculation and never a causal claim. Only set when the row has
   * enough volume (MIN_IMPRESSIONS_FOR_INSIGHT) for the rates behind it
   * to mean anything. */
  insight: string | null;
}

const MIN_IMPRESSIONS_FOR_INSIGHT = 10;

function rate(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

/** Every branch here is a fixed threshold on this row's own already-computed rates - no comparison to other RVs, no fabricated causation, nothing shown below MIN_IMPRESSIONS_FOR_INSIGHT. */
function computeInsight(row: {
  impressions: number;
  completionRate: number | null;
  passRate: number | null;
  likeRate: number | null;
  loveRate: number | null;
  leadsCount: number;
  salesConversionRate: number | null;
}): string | null {
  if (row.impressions < MIN_IMPRESSIONS_FOR_INSIGHT) return null;

  if (row.completionRate !== null && row.completionRate >= 0.6 && row.likeRate !== null && row.likeRate < 0.15) {
    return "High watch rate, low LIKE rate";
  }
  if (row.loveRate !== null && row.loveRate >= 0.25 && row.leadsCount === 0) {
    return "Strong LOVE rate but no leads yet";
  }
  if (row.passRate !== null && row.passRate >= 0.6) {
    return "High PASS rate - shoppers are deciding quickly against this listing";
  }
  if (row.leadsCount >= 3 && row.salesConversionRate === 0) {
    return "Generating leads but none have converted yet";
  }
  return null;
}

/**
 * Per-RV breakdown of the same signals getDealerKpis() already aggregates
 * dealership-wide - "which units are actually working" is a different
 * question from "is the dealership working overall," and the dashboard
 * only ever answered the second one. Extended (Gap 5) with unique
 * viewers, average watch time, and rate metrics (not just raw counts) so
 * a small-inventory dealer and a large one are still comparable.
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
        sql`${behavioralEvents.eventType} in ('video_started', 'video_complete', 'detail_view')`,
        eventDateFilter,
      ),
    )
    .groupBy(behavioralEvents.inventoryId, behavioralEvents.eventType);

  const uniqueViewerRows = await db
    .select({
      inventoryId: behavioralEvents.inventoryId,
      n: sql<number>`count(distinct ${behavioralEvents.consumerProfileId})::int`,
    })
    .from(behavioralEvents)
    .where(
      and(
        inArray(behavioralEvents.inventoryId, invIds),
        eq(behavioralEvents.eventType, "video_started"),
        eventDateFilter,
      ),
    )
    .groupBy(behavioralEvents.inventoryId);

  // Average watch time: for each distinct viewer, how far (in seconds)
  // their furthest progress milestone on this RV got - averaged across
  // viewers, not across every individual milestone event (which would
  // double-count a single viewing session's 25%/50%/75%/complete beats).
  // Built as an explicit IN-list (not `= any(${invIds})`) - postgres-js
  // binds a plain JS array parameter as a row expression, not a native
  // array, the same array-binding pitfall already documented elsewhere in
  // this codebase (see e.g. src/server/discovery/actions.ts's comments).
  const invIdList = sql.join(
    invIds.map((id) => sql`${id}`),
    sql`, `,
  );
  const watchTimeRows = await db.execute<{ inventory_id: string; avg_seconds: string | null }>(sql`
    select inventory_id, avg(max_seconds) as avg_seconds
    from (
      select inventory_id, consumer_profile_id, max((metadata->>'secondsWatched')::numeric) as max_seconds
      from behavioral_events
      where inventory_id in (${invIdList})
        and consumer_profile_id is not null
        and event_type in ('video_25', 'video_50', 'video_75', 'video_complete', 'video_paused')
        ${since ? sql`and created_at >= ${since.toISOString()}` : sql``}
      group by inventory_id, consumer_profile_id
    ) per_viewer
    group by inventory_id
  `);

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
  const detailViewsByInv = new Map<string, number>();
  for (const r of eventRows) {
    if (!r.inventoryId) continue;
    if (r.eventType === "video_started") impressionsByInv.set(r.inventoryId, r.n);
    else if (r.eventType === "video_complete") completionsByInv.set(r.inventoryId, r.n);
    else detailViewsByInv.set(r.inventoryId, r.n);
  }

  const uniqueViewersByInv = new Map(
    uniqueViewerRows.filter((r) => r.inventoryId).map((r) => [r.inventoryId as string, r.n]),
  );
  const avgWatchByInv = new Map(
    watchTimeRows.map((r) => [r.inventory_id, r.avg_seconds !== null ? Number(r.avg_seconds) : null]),
  );

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
    const passes = swipes.pass ?? 0;
    const likes = swipes.like ?? 0;
    const loves = swipes.love ?? 0;
    const moreLikeThis = swipes.more_like_this ?? 0;
    const totalDecisions = passes + likes + loves + moreLikeThis;
    const saves = savesByInv.get(rv.id) ?? 0;
    const detailViews = detailViewsByInv.get(rv.id) ?? 0;
    const leadsCount = leadsByInv.get(rv.id) ?? 0;
    const verifiedSales = salesByInv.get(rv.id) ?? 0;

    const completionRate = rate(completions, impressions);
    const passRate = rate(passes, totalDecisions);
    const likeRate = rate(likes, totalDecisions);
    const loveRate = rate(loves, totalDecisions);
    const saveRate = rate(saves, impressions);
    const detailViewRate = rate(detailViews, impressions);
    const leadRate = rate(leadsCount, impressions);
    const salesConversionRate = rate(verifiedSales, leadsCount);

    return {
      inventoryId: rv.id,
      year: rv.year,
      make: rv.make,
      model: rv.model,
      status: rv.status,
      impressions,
      uniqueViewers: uniqueViewersByInv.get(rv.id) ?? 0,
      avgWatchSeconds: avgWatchByInv.get(rv.id) ?? null,
      completions,
      completionRate,
      passes,
      likes,
      loves,
      moreLikeThis,
      passRate,
      likeRate,
      loveRate,
      saves,
      saveRate,
      detailViews,
      detailViewRate,
      leadsCount,
      leadRate,
      verifiedSales,
      salesConversionRate,
      insight: computeInsight({ impressions, completionRate, passRate, likeRate, loveRate, leadsCount, salesConversionRate }),
    };
  });
}
