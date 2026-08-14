import { and, eq, isNull, lt, or, sql } from "drizzle-orm";

import { db } from "@/server/db/client";
import { inventoryFeedRuns, inventoryFeedSources } from "@/server/db/schema";
import { upsertInventoryRow } from "@/server/dealer/inventory-upsert";
import { fetchFeedText } from "./fetch-feed";
import { applyFieldMapping, parseFeedText, validateMappedRows, type FeedFormat } from "./parse";
import { logError } from "@/server/logging/log";

export interface FeedRunSummary {
  runId: string;
  status: "succeeded" | "failed";
  rowsProcessed: number;
  rowsCreated: number;
  rowsUpdated: number;
  rowsFailed: number;
  errors: string[];
}

const MAX_STORED_ERRORS = 50;

/**
 * Executes one feed source end to end: fetch -> parse -> map -> validate ->
 * upsert, recording a run row throughout so failures are visible in the
 * dealer UI rather than silently vanishing. A single bad row never aborts
 * the whole run - it's recorded as a per-row error and the rest continue,
 * the same "partial success is still useful" behavior as CSV import.
 */
export async function runFeedImport(feedSourceId: string): Promise<FeedRunSummary> {
  const [source] = await db
    .select()
    .from(inventoryFeedSources)
    .where(eq(inventoryFeedSources.id, feedSourceId))
    .limit(1);
  if (!source) throw new Error("Feed source not found.");

  const [run] = await db
    .insert(inventoryFeedRuns)
    .values({ feedSourceId, status: "running" })
    .returning({ id: inventoryFeedRuns.id });

  const errors: string[] = [];
  let rowsProcessed = 0;
  let rowsCreated = 0;
  let rowsUpdated = 0;
  let rowsFailed = 0;
  let finalStatus: "succeeded" | "failed" = "succeeded";

  try {
    const text = await fetchFeedText(source.url);
    const rawRows = parseFeedText(source.format as FeedFormat, text, source.recordPath);
    const mapped = applyFieldMapping(rawRows, (source.fieldMapping ?? {}) as Record<string, string>);
    const validated = validateMappedRows(mapped);

    rowsProcessed = validated.length;

    for (const row of validated) {
      if (!row.valid || !row.data) {
        rowsFailed += 1;
        if (errors.length < MAX_STORED_ERRORS) {
          errors.push(`${row.raw.stock_number ?? row.raw.StockNumber ?? "(unknown stock number)"}: ${row.errors}`);
        }
        continue;
      }
      try {
        const result = await upsertInventoryRow(source.dealershipId, row.data, "feed_import");
        if (result.action === "created") rowsCreated += 1;
        else rowsUpdated += 1;
      } catch (err) {
        logError("dealer.feed_import.row", err, { feedSourceId, stockNumber: row.data.stock_number });
        rowsFailed += 1;
        if (errors.length < MAX_STORED_ERRORS) {
          errors.push(`${row.data.stock_number}: ${err instanceof Error ? err.message : "Unknown error"}`);
        }
      }
    }

    if (rowsProcessed === 0) {
      finalStatus = "failed";
      errors.push("Feed contained no rows.");
    } else if (rowsFailed === rowsProcessed) {
      finalStatus = "failed";
    }
  } catch (err) {
    logError("dealer.feed_import.run", err, { feedSourceId });
    finalStatus = "failed";
    errors.push(err instanceof Error ? err.message : "Unknown error fetching/parsing the feed.");
  }

  await db
    .update(inventoryFeedRuns)
    .set({
      status: finalStatus,
      rowsProcessed,
      rowsCreated,
      rowsUpdated,
      rowsFailed,
      errors,
      completedAt: new Date(),
    })
    .where(eq(inventoryFeedRuns.id, run.id));

  await db
    .update(inventoryFeedSources)
    .set({ lastRunAt: new Date(), lastRunStatus: finalStatus, updatedAt: new Date() })
    .where(eq(inventoryFeedSources.id, feedSourceId));

  return {
    runId: run.id,
    status: finalStatus,
    rowsProcessed,
    rowsCreated,
    rowsUpdated,
    rowsFailed,
    errors,
  };
}

/**
 * Runs every active feed source whose refresh interval has elapsed since
 * its last run (a source with no refreshIntervalMinutes set is manual-only
 * and never picked up here). Called by scripts/run-feed-import.ts, the
 * dedicated worker a production deployment schedules via cron/systemd
 * timer/Docker sidecar - the same "no in-process cron" pattern already
 * used for video generation.
 */
export async function processDueFeedSources(): Promise<{ ranCount: number }> {
  const due = await db
    .select({ id: inventoryFeedSources.id })
    .from(inventoryFeedSources)
    .where(
      and(
        eq(inventoryFeedSources.active, true),
        sql`${inventoryFeedSources.refreshIntervalMinutes} is not null`,
        or(
          isNull(inventoryFeedSources.lastRunAt),
          lt(
            inventoryFeedSources.lastRunAt,
            sql`now() - (${inventoryFeedSources.refreshIntervalMinutes} || ' minutes')::interval`,
          ),
        ),
      ),
    );

  for (const source of due) {
    await runFeedImport(source.id);
  }
  return { ranCount: due.length };
}
