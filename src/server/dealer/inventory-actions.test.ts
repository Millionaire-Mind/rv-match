import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { dealershipUsers, dealerships, inventory, inventoryVideos, videoGenerationJobs } from "@/server/db/schema";

/**
 * Integration test proving the cross-dealer inventory IDOR fix
 * (requireInventoryInDealership / requireVideoJobInDealership /
 * requireVideoBelongsToInventory in src/server/auth/guards.ts) actually
 * blocks a dealer server action, not just a page route. Dealer A is a
 * legitimate member of Dealership A (so requireDealerRole alone would let
 * every one of these calls through) but must still be rejected when the
 * record id it supplies belongs to Dealership B.
 */

let currentToken: string | undefined;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "rvm_auth" && currentToken ? { value: currentToken } : undefined),
    set: () => {},
    delete: () => {},
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { localSignUp } = await import("@/server/auth/local-provider");
const { signSessionToken } = await import("@/server/auth/session-cookie");
const { ForbiddenError } = await import("@/server/auth/guards");
const {
  setInventoryStatus,
  uploadInventoryPhotos,
  setPrimaryVideo,
  requestVideoGeneration,
  retryVideoGeneration,
} = await import("./inventory-actions");

let dealershipAId: string;
let dealershipBId: string;
let userAId: string;
let invAId: string;
let invBId: string;
let videoAId: string;
let videoBId: string;
let jobBId: string;

function asUser(userId: string) {
  currentToken = signSessionToken(userId);
}

beforeAll(async () => {
  const suffix = Date.now();

  const [dealershipA] = await db
    .insert(dealerships)
    .values({
      name: "__test_dealer_A__",
      slug: `__test-dealer-a-${suffix}`,
      primaryContactName: "A Owner",
      primaryContactEmail: `a-${suffix}@example.com`,
      status: "approved",
    })
    .returning({ id: dealerships.id });
  dealershipAId = dealershipA.id;

  const [dealershipB] = await db
    .insert(dealerships)
    .values({
      name: "__test_dealer_B__",
      slug: `__test-dealer-b-${suffix}`,
      primaryContactName: "B Owner",
      primaryContactEmail: `b-${suffix}@example.com`,
      status: "approved",
    })
    .returning({ id: dealerships.id });
  dealershipBId = dealershipB.id;

  const userA = await localSignUp({ email: `idor-a-${suffix}@example.com`, password: "TestPassword123!" });
  userAId = userA.userId;
  const userB = await localSignUp({ email: `idor-b-${suffix}@example.com`, password: "TestPassword123!" });

  await db.insert(dealershipUsers).values([
    { dealershipId: dealershipAId, userId: userAId, role: "owner" },
    { dealershipId: dealershipBId, userId: userB.userId, role: "owner" },
  ]);

  const [invA] = await db
    .insert(inventory)
    .values({
      dealershipId: dealershipAId,
      stockNumber: `A-${suffix}`,
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
  invAId = invA.id;

  const [invB] = await db
    .insert(inventory)
    .values({
      dealershipId: dealershipBId,
      stockNumber: `B-${suffix}`,
      year: 2024,
      make: "Jayco",
      model: "Eagle",
      rvType: "fifth_wheel",
      condition: "new",
      salePriceCents: 5500000,
      status: "draft",
      source: "manual",
    })
    .returning({ id: inventory.id });
  invBId = invB.id;

  const [videoA] = await db
    .insert(inventoryVideos)
    .values({ inventoryId: invAId, url: "/media/videos/a.mp4", source: "dealer_upload" })
    .returning({ id: inventoryVideos.id });
  videoAId = videoA.id;

  const [videoB] = await db
    .insert(inventoryVideos)
    .values({ inventoryId: invBId, url: "/media/videos/b.mp4", source: "dealer_upload" })
    .returning({ id: inventoryVideos.id });
  videoBId = videoB.id;

  const [jobB] = await db
    .insert(videoGenerationJobs)
    .values({ inventoryId: invBId, status: "failed", errorMessage: "test" })
    .returning({ id: videoGenerationJobs.id });
  jobBId = jobB.id;
});

afterAll(async () => {
  await db.delete(dealerships).where(eq(dealerships.id, dealershipAId));
  await db.delete(dealerships).where(eq(dealerships.id, dealershipBId));
});

describe("dealer inventory ownership guard (IDOR)", () => {
  it("allows Dealer A to mutate Dealer A's own inventory", async () => {
    asUser(userAId);
    await setInventoryStatus(dealershipAId, invAId, "archived");
    const [row] = await db.select({ status: inventory.status }).from(inventory).where(eq(inventory.id, invAId));
    expect(row.status).toBe("archived");
  });

  it("blocks Dealer A from changing Dealer B's inventory status", async () => {
    asUser(userAId);
    await expect(setInventoryStatus(dealershipAId, invBId, "archived")).rejects.toThrow(ForbiddenError);
    const [row] = await db.select({ status: inventory.status }).from(inventory).where(eq(inventory.id, invBId));
    expect(row.status).toBe("draft");
  });

  it("blocks Dealer A from uploading photos against Dealer B's inventory id", async () => {
    asUser(userAId);
    await expect(uploadInventoryPhotos(dealershipAId, invBId, new FormData())).rejects.toThrow(ForbiddenError);
  });

  it("blocks Dealer A from requesting video generation for Dealer B's inventory", async () => {
    asUser(userAId);
    await expect(requestVideoGeneration(dealershipAId, invBId)).rejects.toThrow(ForbiddenError);
    const jobs = await db
      .select({ id: videoGenerationJobs.id })
      .from(videoGenerationJobs)
      .where(eq(videoGenerationJobs.inventoryId, invBId));
    expect(jobs).toHaveLength(1); // only the seeded jobB, nothing added by Dealer A
  });

  it("blocks Dealer A from retrying Dealer B's video generation job", async () => {
    asUser(userAId);
    await expect(retryVideoGeneration(dealershipAId, jobBId, invBId)).rejects.toThrow(ForbiddenError);
    const [job] = await db
      .select({ status: videoGenerationJobs.status })
      .from(videoGenerationJobs)
      .where(eq(videoGenerationJobs.id, jobBId));
    expect(job.status).toBe("failed"); // unchanged - not reset to "queued"
  });

  it("blocks Dealer A from assigning Dealer B's video as their own RV's primary video", async () => {
    asUser(userAId);
    await expect(setPrimaryVideo(dealershipAId, invAId, videoBId)).rejects.toThrow(ForbiddenError);
    const [row] = await db.select({ primaryVideoId: inventory.primaryVideoId }).from(inventory).where(eq(inventory.id, invAId));
    expect(row.primaryVideoId).not.toBe(videoBId);
  });

  it("allows Dealer A to assign their own video as primary", async () => {
    asUser(userAId);
    await setPrimaryVideo(dealershipAId, invAId, videoAId);
    const [row] = await db.select({ primaryVideoId: inventory.primaryVideoId }).from(inventory).where(eq(inventory.id, invAId));
    expect(row.primaryVideoId).toBe(videoAId);
  });
});
