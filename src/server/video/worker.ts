import { and, eq, isNotNull, lt } from "drizzle-orm";
import path from "node:path";
import { tmpdir } from "node:os";
import { writeFile } from "node:fs/promises";

import { db } from "@/server/db/client";
import {
  dealerships,
  inventory,
  inventoryFeatures,
  inventoryPhotos,
  inventoryVideos,
  videoGenerationJobs,
} from "@/server/db/schema";
import { generateVerticalVideoFromPhotos } from "./generate";
import { uploadBuffer, isLocalStorage } from "@/server/storage";
import { formatCurrency } from "@/lib/utils";
import { rvTypeLabels } from "@/server/validation/enums";

const MAX_ATTEMPTS = 3;
const STALE_PROCESSING_MINUTES = 15;

/**
 * Resolves a stored photo URL to a local filesystem path FFmpeg can read.
 * Local-storage URLs (`/media/...`) map directly onto public/media; remote
 * (Supabase Storage) URLs are downloaded to a temp file.
 */
async function resolveLocalPath(url: string): Promise<string> {
  if (url.startsWith("/media/")) {
    return path.join(process.cwd(), "public", url);
  }
  if (isLocalStorage()) {
    // Any other local-relative path.
    return path.join(process.cwd(), "public", url.replace(/^\//, ""));
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download photo ${url}: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const tmpPath = path.join(
    tmpdir(),
    `rvm-photo-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`,
  );
  await writeFile(tmpPath, buffer);
  return tmpPath;
}

async function markJobFailed(jobId: string, attempts: number, message: string) {
  await db
    .update(videoGenerationJobs)
    .set({ status: "failed", attempts, errorMessage: message, completedAt: new Date() })
    .where(eq(videoGenerationJobs.id, jobId));
}

/**
 * Atomically claims one queued job for this worker process: locks a single
 * queued row (`FOR UPDATE SKIP LOCKED`), so if multiple worker instances
 * (or a worker plus a manual `npm run video:worker` run) poll concurrently,
 * each claims a different job instead of racing to process the same one.
 * Returns null when there's nothing queued.
 */
async function claimNextQueuedJob(): Promise<{ id: string; attempts: number } | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: videoGenerationJobs.id, attempts: videoGenerationJobs.attempts })
      .from(videoGenerationJobs)
      .where(eq(videoGenerationJobs.status, "queued"))
      .orderBy(videoGenerationJobs.createdAt)
      .limit(1)
      .for("update", { skipLocked: true });
    if (!row) return null;

    const attempts = row.attempts + 1;
    await tx
      .update(videoGenerationJobs)
      .set({ status: "processing", attempts, startedAt: new Date() })
      .where(eq(videoGenerationJobs.id, row.id));
    return { id: row.id, attempts };
  });
}

/**
 * Runs the actual FFmpeg pipeline for a job already marked "processing".
 * Not exported - go through claimNextQueuedJob (via processQueuedVideoJobs)
 * or processVideoGenerationJob so a job is always claimed atomically first.
 */
async function runJob(jobId: string, attempts: number): Promise<void> {
  try {
    const [job] = await db
      .select({ inventoryId: videoGenerationJobs.inventoryId })
      .from(videoGenerationJobs)
      .where(eq(videoGenerationJobs.id, jobId))
      .limit(1);
    if (!job) throw new Error(`Job ${jobId} not found`);

    const [row] = await db
      .select({ inventory, dealershipName: dealerships.name })
      .from(inventory)
      .innerJoin(dealerships, eq(dealerships.id, inventory.dealershipId))
      .where(eq(inventory.id, job.inventoryId))
      .limit(1);
    if (!row) throw new Error("Inventory record no longer exists.");
    const rv = row.inventory;

    const photos = await db
      .select()
      .from(inventoryPhotos)
      .where(eq(inventoryPhotos.inventoryId, rv.id))
      .orderBy(inventoryPhotos.position);
    if (photos.length === 0) {
      throw new Error("This RV has no photos to generate a video from.");
    }

    const features = await db
      .select()
      .from(inventoryFeatures)
      .where(eq(inventoryFeatures.inventoryId, rv.id))
      .limit(1);

    const localPaths = await Promise.all(photos.map((p) => resolveLocalPath(p.url)));

    const price = formatCurrency(rv.advertisedPriceCents ?? rv.salePriceCents);
    const { fileBuffer, durationSeconds } = await generateVerticalVideoFromPhotos(localPaths, {
      headline: `${rv.year} ${rv.make} ${rv.model}`,
      subheadline: rv.floorplan ?? rvTypeLabels[rv.rvType],
      price,
      highlightFeature: features[0]?.feature,
      dealerName: rv.city && rv.state ? `${row.dealershipName} · ${rv.city}, ${rv.state}` : row.dealershipName,
      ctaText: "Check availability on RV Match",
    });

    const key = `videos/${rv.id}/${Date.now()}.mp4`;
    const url = await uploadBuffer(key, fileBuffer, "video/mp4");

    const [videoRow] = await db
      .insert(inventoryVideos)
      .values({
        inventoryId: rv.id,
        url,
        source: "generated",
        durationSeconds: durationSeconds.toFixed(2),
      })
      .returning({ id: inventoryVideos.id });

    await db
      .update(videoGenerationJobs)
      .set({ status: "completed", outputVideoId: videoRow.id, completedAt: new Date() })
      .where(eq(videoGenerationJobs.id, jobId));

    if (!rv.primaryVideoId) {
      await db.update(inventory).set({ primaryVideoId: videoRow.id }).where(eq(inventory.id, rv.id));
    }
  } catch (err) {
    await markJobFailed(jobId, attempts, err instanceof Error ? err.message : "Unknown error");
    throw err;
  }
}

/**
 * Processes one specific job end to end: atomically claims it (only if it's
 * still queued - a no-op if another worker already claimed or finished it),
 * then runs the FFmpeg pipeline. Exported for direct/manual invocation
 * (e.g. tests); the worker loop normally goes through
 * processQueuedVideoJobs instead, which claims whatever is next.
 */
export async function processVideoGenerationJob(jobId: string): Promise<void> {
  const attempts = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ attempts: videoGenerationJobs.attempts })
      .from(videoGenerationJobs)
      .where(and(eq(videoGenerationJobs.id, jobId), eq(videoGenerationJobs.status, "queued")))
      .limit(1)
      .for("update", { skipLocked: true });
    if (!row) return null;
    const attempts = row.attempts + 1;
    await tx
      .update(videoGenerationJobs)
      .set({ status: "processing", attempts, startedAt: new Date() })
      .where(eq(videoGenerationJobs.id, jobId));
    return attempts;
  });
  if (attempts === null) return; // already claimed/processed by someone else, or not queued

  await runJob(jobId, attempts);
}

/**
 * Resets jobs stuck in "processing" for too long (a worker process that
 * crashed or was killed mid-job) back to "queued" for another attempt, or
 * to "failed" once max attempts is reached. Without this, a crashed worker
 * would leave a job permanently stuck showing "processing" in the dealer
 * UI with no way to recover except a manual DB edit.
 */
export async function reclaimStaleJobs(): Promise<{ requeued: number; failed: number }> {
  const staleCutoff = new Date(Date.now() - STALE_PROCESSING_MINUTES * 60 * 1000);
  const stale = await db
    .select({ id: videoGenerationJobs.id, attempts: videoGenerationJobs.attempts })
    .from(videoGenerationJobs)
    .where(
      and(
        eq(videoGenerationJobs.status, "processing"),
        isNotNull(videoGenerationJobs.startedAt),
        lt(videoGenerationJobs.startedAt, staleCutoff),
      ),
    );

  let requeued = 0;
  let failed = 0;
  for (const job of stale) {
    if (job.attempts >= MAX_ATTEMPTS) {
      await markJobFailed(job.id, job.attempts, "Gave up after the worker stopped responding too many times.");
      failed += 1;
    } else {
      await db.update(videoGenerationJobs).set({ status: "queued" }).where(eq(videoGenerationJobs.id, job.id));
      requeued += 1;
    }
  }
  return { requeued, failed };
}

/** Claims and processes every currently-queued job, one at a time. Used by the worker CLI (scripts/run-video-worker.ts). */
export async function processQueuedVideoJobs(): Promise<{ processed: number; failed: number }> {
  await reclaimStaleJobs();

  let processed = 0;
  let failed = 0;
  for (;;) {
    const claimed = await claimNextQueuedJob();
    if (!claimed) break;
    try {
      await runJob(claimed.id, claimed.attempts);
      processed += 1;
    } catch {
      failed += 1;
    }
  }
  return { processed, failed };
}
