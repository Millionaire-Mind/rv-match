"use server";

import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/server/db/client";
import { inventoryFeedRuns, inventoryFeedSources } from "@/server/db/schema";
import { requireDealerRole, requireFeedSourceInDealership } from "@/server/auth/guards";
import { MANAGEMENT_ROLES } from "@/server/dealer/permissions";
import { feedSourceSchema } from "@/server/validation/inventory";
import { logAudit } from "@/server/audit/log";
import { fetchFeedText, assertPublicFeedUrl } from "@/server/dealer/feed-import/fetch-feed";
import { applyFieldMapping, parseFeedText, validateMappedRows, type FeedFormat } from "@/server/dealer/feed-import/parse";
import { runFeedImport, type FeedRunSummary } from "@/server/dealer/feed-import/run";

export type FeedSourceFormState = { ok: false; error: string } | { ok: true; feedSourceId: string };

function parseFeedSourceForm(formData: FormData) {
  const mappingRaw = formData.get("fieldMapping");
  let fieldMapping: Record<string, string> = {};
  if (typeof mappingRaw === "string" && mappingRaw.trim()) {
    try {
      fieldMapping = JSON.parse(mappingRaw);
    } catch {
      return { success: false as const, error: { issues: [{ path: ["fieldMapping"], message: "Field mapping must be valid JSON." }] } };
    }
  }
  return feedSourceSchema.safeParse({
    name: formData.get("name"),
    format: formData.get("format"),
    url: formData.get("url"),
    fieldMapping,
    recordPath: formData.get("recordPath") || undefined,
    refreshIntervalMinutes: formData.get("refreshIntervalMinutes") || undefined,
  });
}

export async function createFeedSource(
  dealershipId: string,
  _prev: FeedSourceFormState,
  formData: FormData,
): Promise<FeedSourceFormState> {
  await requireDealerRole(dealershipId, MANAGEMENT_ROLES);
  const parsed = parseFeedSourceForm(formData);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check your details." };
  }
  const d = parsed.data;
  assertPublicFeedUrl(d.url);

  const [row] = await db
    .insert(inventoryFeedSources)
    .values({
      dealershipId,
      name: d.name,
      format: d.format,
      url: d.url,
      fieldMapping: d.fieldMapping,
      recordPath: d.recordPath ?? null,
      refreshIntervalMinutes: d.refreshIntervalMinutes ?? null,
    })
    .returning({ id: inventoryFeedSources.id });

  await logAudit({ action: "feed_source.create", entityType: "inventory_feed_source", entityId: row.id, dealershipId });
  revalidatePath("/dealer/inventory/feeds");
  return { ok: true, feedSourceId: row.id };
}

export async function updateFeedSource(
  dealershipId: string,
  feedSourceId: string,
  _prev: FeedSourceFormState,
  formData: FormData,
): Promise<FeedSourceFormState> {
  await requireDealerRole(dealershipId, MANAGEMENT_ROLES);
  await requireFeedSourceInDealership(dealershipId, feedSourceId);
  const parsed = parseFeedSourceForm(formData);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check your details." };
  }
  const d = parsed.data;
  assertPublicFeedUrl(d.url);

  await db
    .update(inventoryFeedSources)
    .set({
      name: d.name,
      format: d.format,
      url: d.url,
      fieldMapping: d.fieldMapping,
      recordPath: d.recordPath ?? null,
      refreshIntervalMinutes: d.refreshIntervalMinutes ?? null,
      updatedAt: new Date(),
    })
    .where(eq(inventoryFeedSources.id, feedSourceId));

  await logAudit({ action: "feed_source.update", entityType: "inventory_feed_source", entityId: feedSourceId, dealershipId });
  revalidatePath("/dealer/inventory/feeds");
  return { ok: true, feedSourceId };
}

export async function setFeedSourceActive(dealershipId: string, feedSourceId: string, active: boolean): Promise<void> {
  await requireDealerRole(dealershipId, MANAGEMENT_ROLES);
  await requireFeedSourceInDealership(dealershipId, feedSourceId);
  await db.update(inventoryFeedSources).set({ active, updatedAt: new Date() }).where(eq(inventoryFeedSources.id, feedSourceId));
  await logAudit({
    action: active ? "feed_source.activate" : "feed_source.deactivate",
    entityType: "inventory_feed_source",
    entityId: feedSourceId,
    dealershipId,
  });
  revalidatePath("/dealer/inventory/feeds");
}

export async function deleteFeedSource(dealershipId: string, feedSourceId: string): Promise<void> {
  await requireDealerRole(dealershipId, MANAGEMENT_ROLES);
  await requireFeedSourceInDealership(dealershipId, feedSourceId);
  await db.delete(inventoryFeedSources).where(eq(inventoryFeedSources.id, feedSourceId));
  await logAudit({ action: "feed_source.delete", entityType: "inventory_feed_source", entityId: feedSourceId, dealershipId });
  revalidatePath("/dealer/inventory/feeds");
}

export interface FeedPreviewResult {
  ok: boolean;
  error?: string;
  totalRows?: number;
  sample?: { stockNumber?: string; valid: boolean; errors?: string }[];
}

/**
 * Fetches and validates a feed WITHOUT writing anything to inventory - the
 * "preview" step a dealer uses to check their field mapping is right
 * before saving a feed source or triggering a real import.
 */
export async function previewFeedSource(dealershipId: string, formData: FormData): Promise<FeedPreviewResult> {
  await requireDealerRole(dealershipId, MANAGEMENT_ROLES);
  const parsed = parseFeedSourceForm(formData);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check your details." };
  }
  const d = parsed.data;

  try {
    assertPublicFeedUrl(d.url);
    const text = await fetchFeedText(d.url);
    const rawRows = parseFeedText(d.format as FeedFormat, text, d.recordPath ?? null);
    const mapped = applyFieldMapping(rawRows, d.fieldMapping);
    const validated = validateMappedRows(mapped);
    return {
      ok: true,
      totalRows: validated.length,
      sample: validated.slice(0, 10).map((r) => ({
        stockNumber: r.data?.stock_number ?? r.raw.stock_number,
        valid: r.valid,
        errors: r.errors,
      })),
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not preview this feed." };
  }
}

export async function runFeedSourceNow(dealershipId: string, feedSourceId: string): Promise<FeedRunSummary> {
  await requireDealerRole(dealershipId, MANAGEMENT_ROLES);
  await requireFeedSourceInDealership(dealershipId, feedSourceId);
  const summary = await runFeedImport(feedSourceId);
  await logAudit({
    action: "feed_source.run",
    entityType: "inventory_feed_source",
    entityId: feedSourceId,
    dealershipId,
    metadata: { status: summary.status, rowsProcessed: summary.rowsProcessed, rowsCreated: summary.rowsCreated, rowsUpdated: summary.rowsUpdated, rowsFailed: summary.rowsFailed },
  });
  revalidatePath("/dealer/inventory/feeds");
  revalidatePath("/dealer/inventory");
  return summary;
}

export async function getFeedSourceRuns(dealershipId: string, feedSourceId: string) {
  await requireDealerRole(dealershipId, MANAGEMENT_ROLES);
  await requireFeedSourceInDealership(dealershipId, feedSourceId);
  return db
    .select()
    .from(inventoryFeedRuns)
    .where(eq(inventoryFeedRuns.feedSourceId, feedSourceId))
    .orderBy(desc(inventoryFeedRuns.startedAt))
    .limit(20);
}
