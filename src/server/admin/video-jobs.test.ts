import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { dealerships, inventory, profiles, videoGenerationJobs } from "@/server/db/schema";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

let currentToken: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "rvm_auth" && currentToken ? { value: currentToken } : undefined),
    set: () => {},
    delete: () => {},
  }),
}));

const { localSignUp } = await import("@/server/auth/local-provider");
const { signSessionToken } = await import("@/server/auth/session-cookie");
const { listVideoJobs, retryVideoJob } = await import("@/server/admin/video-jobs");

let dealershipId: string;
let inventoryId: string;
let failedJobId: string;
let completedJobId: string;
let adminUserId: string;
let nonAdminUserId: string;

beforeAll(async () => {
  const suffix = Date.now();
  const [dealership] = await db
    .insert(dealerships)
    .values({
      name: "__test_video_jobs__",
      slug: `__test-video-jobs-${suffix}`,
      primaryContactName: "Test",
      primaryContactEmail: `video-jobs-${suffix}@example.com`,
      status: "approved",
    })
    .returning({ id: dealerships.id });
  dealershipId = dealership.id;

  const [rv] = await db
    .insert(inventory)
    .values({
      dealershipId,
      stockNumber: `VJ-${suffix}`,
      year: 2024,
      make: "Forest River",
      model: "Rockwood",
      rvType: "travel_trailer",
      condition: "new",
      salePriceCents: 4000000,
      status: "draft",
      source: "manual",
    })
    .returning({ id: inventory.id });
  inventoryId = rv.id;

  const [failedJob] = await db
    .insert(videoGenerationJobs)
    .values({ inventoryId, status: "failed", attempts: 3, errorMessage: "ffmpeg exited 1" })
    .returning({ id: videoGenerationJobs.id });
  failedJobId = failedJob.id;

  const [completedJob] = await db
    .insert(videoGenerationJobs)
    .values({ inventoryId, status: "completed", attempts: 1 })
    .returning({ id: videoGenerationJobs.id });
  completedJobId = completedJob.id;

  const admin = await localSignUp({ email: `video-jobs-admin-${suffix}@example.com`, password: "TestPassword123!" });
  adminUserId = admin.userId;
  await db.update(profiles).set({ platformRole: "platform_admin" }).where(eq(profiles.id, adminUserId));

  const nonAdmin = await localSignUp({ email: `video-jobs-user-${suffix}@example.com`, password: "TestPassword123!" });
  nonAdminUserId = nonAdmin.userId;
});

afterAll(async () => {
  await db.delete(dealerships).where(eq(dealerships.id, dealershipId));
});

describe("listVideoJobs", () => {
  it("surfaces failed jobs before completed ones", async () => {
    const rows = await listVideoJobs();
    const failedIndex = rows.findIndex((r) => r.id === failedJobId);
    const completedIndex = rows.findIndex((r) => r.id === completedJobId);
    expect(failedIndex).toBeGreaterThanOrEqual(0);
    expect(completedIndex).toBeGreaterThanOrEqual(0);
    expect(failedIndex).toBeLessThan(completedIndex);
  });
});

describe("retryVideoJob", () => {
  it("rejects a non-admin caller", async () => {
    currentToken = signSessionToken(nonAdminUserId);
    const { ForbiddenError } = await import("@/server/auth/guards");
    await expect(retryVideoJob(failedJobId)).rejects.toThrow(ForbiddenError);
  });

  it("resets a failed job to queued with a fresh attempt budget", async () => {
    currentToken = signSessionToken(adminUserId);
    await retryVideoJob(failedJobId);

    const [row] = await db.select().from(videoGenerationJobs).where(eq(videoGenerationJobs.id, failedJobId));
    expect(row.status).toBe("queued");
    expect(row.attempts).toBe(0);
    expect(row.errorMessage).toBeNull();
  });

  it("does not touch a job that isn't failed", async () => {
    currentToken = signSessionToken(adminUserId);
    await retryVideoJob(completedJobId);

    const [row] = await db.select().from(videoGenerationJobs).where(eq(videoGenerationJobs.id, completedJobId));
    expect(row.status).toBe("completed");
    expect(row.attempts).toBe(1);
  });
});
