import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { dealershipUsers, inventory, inventoryVideos, profiles, videoGenerationJobs } from "@/server/db/schema";
import { authGetUserId } from "./provider";

export class ForbiddenError extends Error {
  constructor(message = "You do not have access to this resource.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class UnauthorizedError extends Error {
  constructor(message = "Sign in required.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/** Throws unless a user is signed in. Returns their profile id. */
export async function requireUser(): Promise<string> {
  const userId = await authGetUserId();
  if (!userId) throw new UnauthorizedError();
  return userId;
}

/**
 * Throws unless the current user is a member of `dealershipId`. This is the
 * primary tenant-isolation check — every dealer server action calls this
 * with the dealership id extracted from the record being touched (never
 * trusted from a client-supplied "current dealership" value alone), so a
 * dealer cannot read/write another dealership's data by manipulating an id
 * in a request.
 */
export async function requireDealerRole(
  dealershipId: string,
  allowedRoles: Array<"owner" | "staff"> = ["owner", "staff"],
): Promise<{ userId: string; role: "owner" | "staff" }> {
  const userId = await requireUser();

  const [profile] = await db
    .select({ platformRole: profiles.platformRole })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  if (profile?.platformRole === "platform_admin") {
    return { userId, role: "owner" };
  }

  const [membership] = await db
    .select({ role: dealershipUsers.role })
    .from(dealershipUsers)
    .where(and(eq(dealershipUsers.dealershipId, dealershipId), eq(dealershipUsers.userId, userId)))
    .limit(1);

  if (!membership || !allowedRoles.includes(membership.role)) {
    throw new ForbiddenError("You do not have access to this dealership.");
  }

  return { userId, role: membership.role };
}

/**
 * Verifies that `inventoryId` actually belongs to `dealershipId` before any
 * write touches it. `requireDealerRole` alone only proves the caller is a
 * member of `dealershipId` — it says nothing about which dealership owns the
 * record id the caller also supplied. Every dealer server action that
 * mutates an existing inventory row (status change, photo/video upload,
 * primary-video selection, video generation) must call this first, or a
 * dealer could reach another dealership's inventory by ID substitution.
 */
export async function requireInventoryInDealership(
  dealershipId: string,
  inventoryId: string,
): Promise<{ id: string; dealershipId: string }> {
  const [row] = await db
    .select({ id: inventory.id, dealershipId: inventory.dealershipId })
    .from(inventory)
    .where(eq(inventory.id, inventoryId))
    .limit(1);
  if (!row || row.dealershipId !== dealershipId) {
    throw new ForbiddenError("This RV does not belong to your dealership.");
  }
  return row;
}

/**
 * Same as `requireInventoryInDealership` but for a video generation job:
 * resolves the job's owning inventory/dealership via join and verifies it
 * matches. Prevents a dealer from retrying or reading another dealership's
 * video generation job by guessing/enumerating a job id.
 */
export async function requireVideoJobInDealership(
  dealershipId: string,
  jobId: string,
): Promise<{ id: string; inventoryId: string }> {
  const [row] = await db
    .select({
      id: videoGenerationJobs.id,
      inventoryId: videoGenerationJobs.inventoryId,
      jobDealershipId: inventory.dealershipId,
    })
    .from(videoGenerationJobs)
    .innerJoin(inventory, eq(inventory.id, videoGenerationJobs.inventoryId))
    .where(eq(videoGenerationJobs.id, jobId))
    .limit(1);
  if (!row || row.jobDealershipId !== dealershipId) {
    throw new ForbiddenError("This video job does not belong to your dealership.");
  }
  return { id: row.id, inventoryId: row.inventoryId };
}

/**
 * Verifies that `videoId` belongs to `inventoryId` before it can be set as
 * the primary video — otherwise a dealer could set another dealership's
 * video as their own listing's primary video by ID substitution.
 */
export async function requireVideoBelongsToInventory(inventoryId: string, videoId: string): Promise<void> {
  const [row] = await db
    .select({ inventoryId: inventoryVideos.inventoryId })
    .from(inventoryVideos)
    .where(eq(inventoryVideos.id, videoId))
    .limit(1);
  if (!row || row.inventoryId !== inventoryId) {
    throw new ForbiddenError("That video does not belong to this RV.");
  }
}

/** Returns the dealership ids the current user belongs to (for dashboard nav). */
export async function getUserDealerships(): Promise<
  Array<{ dealershipId: string; role: "owner" | "staff" }>
> {
  const userId = await authGetUserId();
  if (!userId) return [];
  const rows = await db
    .select({ dealershipId: dealershipUsers.dealershipId, role: dealershipUsers.role })
    .from(dealershipUsers)
    .where(eq(dealershipUsers.userId, userId));
  return rows;
}

export async function requireAdmin(): Promise<string> {
  const userId = await requireUser();
  const [profile] = await db
    .select({ platformRole: profiles.platformRole })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  if (profile?.platformRole !== "platform_admin") {
    throw new ForbiddenError("Admin access required.");
  }
  return userId;
}

export async function isCurrentUserAdmin(): Promise<boolean> {
  const userId = await authGetUserId();
  if (!userId) return false;
  const [profile] = await db
    .select({ platformRole: profiles.platformRole })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  return profile?.platformRole === "platform_admin";
}
