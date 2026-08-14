"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/server/db/client";
import { dealerships, inventory, videoGenerationJobs } from "@/server/db/schema";
import { requireAdmin } from "@/server/auth/guards";
import { logAudit } from "@/server/audit/log";

export interface VideoJobRow {
  id: string;
  dealershipName: string;
  rvLabel: string;
  status: "queued" | "processing" | "completed" | "failed";
  attempts: number;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const STATUS_PRIORITY: Record<VideoJobRow["status"], number> = {
  failed: 0,
  processing: 1,
  queued: 2,
  completed: 3,
};

/** Every video-generation job, failed/stuck ones surfaced first - this is
 * the only place in the platform that lists video_generation_jobs across
 * dealerships (the worker and the dealer-scoped IDOR guard are the only
 * other readers of this table). */
export async function listVideoJobs(limit = 200): Promise<VideoJobRow[]> {
  const rows = await db
    .select({
      id: videoGenerationJobs.id,
      dealershipName: dealerships.name,
      year: inventory.year,
      make: inventory.make,
      model: inventory.model,
      status: videoGenerationJobs.status,
      attempts: videoGenerationJobs.attempts,
      errorMessage: videoGenerationJobs.errorMessage,
      createdAt: videoGenerationJobs.createdAt,
      updatedAt: videoGenerationJobs.updatedAt,
    })
    .from(videoGenerationJobs)
    .innerJoin(inventory, eq(videoGenerationJobs.inventoryId, inventory.id))
    .innerJoin(dealerships, eq(inventory.dealershipId, dealerships.id))
    .orderBy(desc(videoGenerationJobs.createdAt))
    .limit(limit);

  return rows
    .map((r) => ({
      id: r.id,
      dealershipName: r.dealershipName,
      rvLabel: `${r.year} ${r.make} ${r.model}`,
      status: r.status,
      attempts: r.attempts,
      errorMessage: r.errorMessage,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }))
    .sort((a, b) => STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status]);
}

/**
 * Gives a permanently-failed job (attempts exhausted, see MAX_ATTEMPTS in
 * src/server/video/worker.ts) a fresh attempt budget and puts it back in
 * the queue. Only a genuinely failed job is eligible - the conditional
 * WHERE guards against retrying a job that's already queued/processing/
 * completed out from under the worker.
 */
export async function retryVideoJob(jobId: string): Promise<void> {
  await requireAdmin();

  const [updated] = await db
    .update(videoGenerationJobs)
    .set({ status: "queued", attempts: 0, errorMessage: null, startedAt: null, completedAt: null })
    .where(and(eq(videoGenerationJobs.id, jobId), eq(videoGenerationJobs.status, "failed")))
    .returning({ id: videoGenerationJobs.id, status: videoGenerationJobs.status });

  if (!updated) return;

  await logAudit({ action: "video_job.retry", entityType: "video_generation_job", entityId: jobId });
  revalidatePath("/admin/videos");
}
