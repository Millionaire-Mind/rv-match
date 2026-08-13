import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { dealerships, profiles } from "@/server/db/schema";
import { authGetUserId } from "@/server/auth/provider";
import { getUserDealerships } from "@/server/auth/guards";

/**
 * Resolves the signed-in dealer user's dealership context for the /dealer
 * dashboard, redirecting to sign-in if unauthenticated and to the
 * application page if they belong to no dealership. A user with more than
 * one dealership (not exercised by the seed data) is scoped to the first
 * membership — a documented V1 simplification.
 *
 * Platform admins are intentionally NOT given implicit owner access to an
 * arbitrary dealership here — /admin/* is their surface (dealer approval,
 * sale verification, config). Redirecting them into /dealer/* with
 * unrestricted access to whichever dealership happened to load first would
 * be confusing and a needless privilege footgun.
 */
export async function requireDealerContext() {
  const userId = await authGetUserId();
  if (!userId) redirect("/dealer/login");

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1);
  if (profile?.platformRole === "platform_admin") redirect("/admin");

  const memberships = await getUserDealerships();
  if (memberships.length === 0) redirect("/dealer/apply");

  const [dealership] = await db
    .select()
    .from(dealerships)
    .where(eq(dealerships.id, memberships[0].dealershipId))
    .limit(1);
  if (!dealership) redirect("/dealer/apply");

  // A dealership must be approved to use the full dashboard - pending,
  // suspended, and rejected are all blocked here (server-side, not merely
  // by hiding UI), matching the same status check requireDealerRole
  // enforces on every write. /dealer/pending explains why and shows
  // nothing else.
  if (dealership.status !== "approved") redirect("/dealer/pending");

  return { userId, role: memberships[0].role, dealership };
}

/**
 * Same membership lookup as requireDealerContext but for /dealer/pending
 * itself: it must NOT redirect a non-approved dealership back to
 * /dealer/pending (that would be the page calling itself), and it should
 * send an already-approved dealership on to the real dashboard instead of
 * displaying a stale pending/suspended message.
 */
export async function getDealerStatusContext() {
  const userId = await authGetUserId();
  if (!userId) redirect("/dealer/login");

  const memberships = await getUserDealerships();
  if (memberships.length === 0) redirect("/dealer/apply");

  const [dealership] = await db
    .select()
    .from(dealerships)
    .where(eq(dealerships.id, memberships[0].dealershipId))
    .limit(1);
  if (!dealership) redirect("/dealer/apply");
  if (dealership.status === "approved") redirect("/dealer");

  return { userId, dealership };
}
