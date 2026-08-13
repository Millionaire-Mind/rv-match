import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { dealerships, inventory, inventoryPhotos, videoGenerationJobs } from "@/server/db/schema";
import type { VideoOverlayData } from "./generate";

/**
 * Integration tests for the video generation worker (Phase 2B): real FFmpeg
 * execution is already covered by e2e/dealer-journey.spec.ts, so this file
 * mocks generateVerticalVideoFromPhotos/uploadBuffer to isolate what
 * changed here - atomic job claiming (safe under concurrent workers),
 * stale "processing" job reclamation, and the generated video using the
 * real dealership name instead of a hardcoded placeholder.
 */

const generateVerticalVideoFromPhotos = vi.fn<
  (photoPaths: string[], overlay: VideoOverlayData) => Promise<{ fileBuffer: Buffer; durationSeconds: number }>
>(async () => ({
  fileBuffer: Buffer.from("fake-mp4-bytes"),
  durationSeconds: 9,
}));
vi.mock("@/server/video/generate", () => ({ generateVerticalVideoFromPhotos }));

vi.mock("@/server/storage", () => ({
  uploadBuffer: vi.fn(async (key: string) => `/media/${key}`),
  isLocalStorage: () => true,
}));

const { processQueuedVideoJobs, processVideoGenerationJob, reclaimStaleJobs } = await import("./worker");

let dealershipId: string;
const inventoryIds: string[] = [];

async function makeInventoryWithQueuedJob(suffix: string) {
  const [rv] = await db
    .insert(inventory)
    .values({
      dealershipId,
      stockNumber: `WORKER-${suffix}`,
      year: 2024,
      make: "Forest River",
      model: "Rockwood",
      rvType: "travel_trailer",
      condition: "new",
      salePriceCents: 3500000,
      status: "draft",
      source: "manual",
    })
    .returning({ id: inventory.id });
  inventoryIds.push(rv.id);

  await db.insert(inventoryPhotos).values({ inventoryId: rv.id, url: "/media/photos/fake.jpg", position: 0 });
  const [job] = await db.insert(videoGenerationJobs).values({ inventoryId: rv.id }).returning({ id: videoGenerationJobs.id });
  return { inventoryId: rv.id, jobId: job.id };
}

beforeAll(async () => {
  const suffix = Date.now();
  const [dealership] = await db
    .insert(dealerships)
    .values({
      name: "Rocky Mountain Test RV Center",
      slug: `__test-worker-${suffix}`,
      primaryContactName: "Owner",
      primaryContactEmail: `worker-${suffix}@example.com`,
      status: "approved",
    })
    .returning({ id: dealerships.id });
  dealershipId = dealership.id;
});

afterEach(() => {
  vi.clearAllMocks();
});

afterAll(async () => {
  await db.delete(dealerships).where(eq(dealerships.id, dealershipId)); // cascades inventory/photos/jobs/videos
});

describe("processQueuedVideoJobs", () => {
  it("processes a queued job end to end and marks it completed", async () => {
    const { inventoryId, jobId } = await makeInventoryWithQueuedJob(`single-${Date.now()}`);

    const result = await processQueuedVideoJobs();
    expect(result.processed).toBeGreaterThanOrEqual(1);

    const [job] = await db.select().from(videoGenerationJobs).where(eq(videoGenerationJobs.id, jobId));
    expect(job.status).toBe("completed");
    expect(job.outputVideoId).toBeTruthy();

    const [rv] = await db.select({ primaryVideoId: inventory.primaryVideoId }).from(inventory).where(eq(inventory.id, inventoryId));
    expect(rv.primaryVideoId).toBe(job.outputVideoId); // first video on an RV becomes primary automatically
  });

  it("uses the RV's real dealership name in the generated overlay, not a hardcoded placeholder", async () => {
    await makeInventoryWithQueuedJob(`dealername-${Date.now()}`);
    await processQueuedVideoJobs();

    const lastCall = generateVerticalVideoFromPhotos.mock.calls.at(-1);
    expect(lastCall).toBeDefined();
    const overlay = lastCall![1];
    expect(overlay.dealerName).toContain("Rocky Mountain Test RV Center");
    expect(overlay.dealerName).not.toBe("RV Match Dealer");
  });

  it("does not double-process the same job when two workers poll concurrently", async () => {
    const jobs = await Promise.all(
      Array.from({ length: 4 }, (_, i) => makeInventoryWithQueuedJob(`concurrent-${Date.now()}-${i}`)),
    );

    const [resultA, resultB] = await Promise.all([processQueuedVideoJobs(), processQueuedVideoJobs()]);
    const totalProcessed = resultA.processed + resultB.processed;
    expect(totalProcessed).toBe(4); // every job claimed exactly once across both concurrent callers

    for (const { jobId } of jobs) {
      const [job] = await db.select().from(videoGenerationJobs).where(eq(videoGenerationJobs.id, jobId));
      expect(job.status).toBe("completed");
      expect(job.attempts).toBe(1); // claimed and processed exactly once, not twice
    }
  });
});

describe("reclaimStaleJobs", () => {
  it("requeues a stuck 'processing' job that hasn't exhausted its attempts", async () => {
    const { jobId } = await makeInventoryWithQueuedJob(`stale-requeue-${Date.now()}`);
    await db
      .update(videoGenerationJobs)
      .set({ status: "processing", attempts: 1, startedAt: new Date(Date.now() - 20 * 60 * 1000) })
      .where(eq(videoGenerationJobs.id, jobId));

    const result = await reclaimStaleJobs();
    expect(result.requeued).toBeGreaterThanOrEqual(1);

    const [job] = await db.select().from(videoGenerationJobs).where(eq(videoGenerationJobs.id, jobId));
    expect(job.status).toBe("queued");
  });

  it("marks a stuck job failed once it has exhausted its attempts instead of requeuing forever", async () => {
    const { jobId } = await makeInventoryWithQueuedJob(`stale-fail-${Date.now()}`);
    await db
      .update(videoGenerationJobs)
      .set({ status: "processing", attempts: 3, startedAt: new Date(Date.now() - 20 * 60 * 1000) })
      .where(eq(videoGenerationJobs.id, jobId));

    const result = await reclaimStaleJobs();
    expect(result.failed).toBeGreaterThanOrEqual(1);

    const [job] = await db.select().from(videoGenerationJobs).where(eq(videoGenerationJobs.id, jobId));
    expect(job.status).toBe("failed");
  });

  it("leaves recently-started processing jobs alone", async () => {
    const { jobId } = await makeInventoryWithQueuedJob(`fresh-processing-${Date.now()}`);
    await db
      .update(videoGenerationJobs)
      .set({ status: "processing", attempts: 1, startedAt: new Date() })
      .where(eq(videoGenerationJobs.id, jobId));

    await reclaimStaleJobs();

    const [job] = await db.select().from(videoGenerationJobs).where(eq(videoGenerationJobs.id, jobId));
    expect(job.status).toBe("processing");
  });
});

describe("processVideoGenerationJob", () => {
  it("is a no-op when the job is no longer queued (already claimed/processed)", async () => {
    const { jobId } = await makeInventoryWithQueuedJob(`already-done-${Date.now()}`);
    await db.update(videoGenerationJobs).set({ status: "completed" }).where(eq(videoGenerationJobs.id, jobId));

    await processVideoGenerationJob(jobId); // should not throw or reprocess
    expect(generateVerticalVideoFromPhotos).not.toHaveBeenCalled();
  });
});
