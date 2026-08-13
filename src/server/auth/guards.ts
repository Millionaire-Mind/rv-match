import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { dealershipUsers, profiles } from "@/server/db/schema";
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
