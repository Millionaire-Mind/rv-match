import { eq } from "drizzle-orm";
import path from "node:path";
import { tmpdir } from "node:os";
import { writeFile } from "node:fs/promises";

import { db } from "@/server/db/client";
import {
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

/** Processes a single video_generation_jobs row end to end. */
export async function processVideoGenerationJob(jobId: string): Promise<void> {
  const [job] = await db
    .select()
    .from(videoGenerationJobs)
    .where(eq(videoGenerationJobs.id, jobId))
    .limit(1);
  if (!job) throw new Error(`Job ${jobId} not found`);

  const attempts = job.attempts + 1;
  await db
    .update(videoGenerationJobs)
    .set({ status: "processing", attempts, startedAt: new Date() })
    .where(eq(videoGenerationJobs.id, jobId));

  try {
    const [rv] = await db
      .select()
      .from(inventory)
      .where(eq(inventory.id, job.inventoryId))
      .limit(1);
    if (!rv) throw new Error("Inventory record no longer exists.");

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
      dealerName: rv.city && rv.state ? `RV Match Dealer · ${rv.city}, ${rv.state}` : "RV Match Dealer",
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

/** Processes every queued job once, in order. Used by the worker CLI. */
export async function processQueuedVideoJobs(): Promise<{ processed: number; failed: number }> {
  const queued = await db
    .select({ id: videoGenerationJobs.id })
    .from(videoGenerationJobs)
    .where(eq(videoGenerationJobs.status, "queued"));

  let processed = 0;
  let failed = 0;
  for (const job of queued) {
    try {
      await processVideoGenerationJob(job.id);
      processed += 1;
    } catch {
      failed += 1;
    }
  }
  return { processed, failed };
}
