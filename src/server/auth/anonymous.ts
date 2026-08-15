import "server-only";

import { cookies } from "next/headers";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { anonymousSessions, consumerProfiles, profiles } from "@/server/db/schema";
import { ANONYMOUS_COOKIE_MAX_AGE, ANONYMOUS_COOKIE_NAME, PENDING_ATTRIBUTION_COOKIE_NAME } from "./session-cookie";
import { authGetUserId } from "./provider";

interface PendingAttribution {
  source: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
}

/** Reads the short-lived cookie middleware sets on a visitor's very first
 * request when it carried UTM params or a third-party referrer (see
 * src/proxy.ts's capturePendingAttribution) - the fallback attribution used
 * below when no caller (e.g. /go/[code]) passed a more specific one. */
async function readPendingAttribution(
  cookieStore: Awaited<ReturnType<typeof cookies>>,
): Promise<PendingAttribution | null> {
  const raw = cookieStore.get(PENDING_ATTRIBUTION_COOKIE_NAME)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingAttribution;
  } catch {
    return null;
  }
}

/**
 * Reads the anonymous session cookie (minted by src/middleware.ts, which
 * runs before this can ever be called) and ensures the matching
 * `anonymous_sessions` row exists, creating it on first use. This never
 * writes the cookie itself — cookie mutation is only legal from
 * middleware, a Server Action, or a Route Handler, and this function is
 * also called from plain Server Component renders (e.g. the /discover
 * page loading its first batch), where a cookie write would throw.
 */
/**
 * `attribution`, when supplied, only ever takes effect on this session id's
 * very first creation - the onConflictDoUpdate branch below deliberately
 * never touches firstSource/firstCampaignId/utm_*, so a returning visitor
 * who later lands through a different campaign link never overwrites their
 * original first-touch attribution. Only src/app/go/[code]/route.ts (the
 * campaign-link resolver) and partner/actions.ts ever pass this
 * explicitly - every other caller falls back to whatever middleware
 * captured from this visitor's very first request (see
 * readPendingAttribution above), or the plain "direct" schema default if
 * that first request carried no UTM tags and no third-party referrer.
 */
export async function getOrCreateAnonymousSessionId(attribution?: {
  firstSource: string;
  firstCampaignId?: string;
}): Promise<string> {
  const cookieStore = await cookies();
  const id = cookieStore.get(ANONYMOUS_COOKIE_NAME)?.value ?? crypto.randomUUID();

  const pending = attribution ? null : await readPendingAttribution(cookieStore);

  const [row] = await db
    .insert(anonymousSessions)
    .values({
      id,
      firstSource: attribution?.firstSource ?? pending?.source,
      firstCampaignId: attribution?.firstCampaignId,
      utmSource: pending?.utmSource,
      utmMedium: pending?.utmMedium,
      utmCampaign: pending?.utmCampaign,
      utmContent: pending?.utmContent,
      utmTerm: pending?.utmTerm,
    })
    .onConflictDoUpdate({
      target: anonymousSessions.id,
      set: { lastSeenAt: new Date() },
    })
    .returning({ id: anonymousSessions.id });

  return row.id;
}

/**
 * Gap 12: honors an explicit "start fresh" choice at signup by rotating
 * the anonymous-session cookie to a brand-new, unrelated session rather
 * than merging the browser's prior shopping history. The old anonymous
 * session and its consumer_profiles row are left exactly as they are
 * (not deleted, not merged into anyone) - simply no longer reachable from
 * this browser, so getOrCreateConsumerProfileId's own lazy-merge fallback
 * (which runs on this new user's very next request) resolves through the
 * new, empty session and creates a genuinely fresh profile instead of
 * re-discovering and re-attaching the old one. Only ever called from a
 * Server Action (signUpAction), where cookie mutation is legal.
 */
export async function resetAnonymousSessionForFreshStart(): Promise<void> {
  const cookieStore = await cookies();
  const newId = crypto.randomUUID();
  await db.insert(anonymousSessions).values({ id: newId });
  cookieStore.set(ANONYMOUS_COOKIE_NAME, newId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ANONYMOUS_COOKIE_MAX_AGE,
  });
}

/**
 * Resolves the current shopper's stable `consumer_profiles` identity,
 * whether they are signed in or anonymous, creating one if this is their
 * first interaction. If a signed-in user previously shopped anonymously in
 * this browser, their existing anonymous consumer_profiles row is reused
 * (merged) by attaching `user_id` to it rather than creating a second
 * identity — all prior swipes/saves/preferences carry forward.
 */
export async function getOrCreateConsumerProfileId(attribution?: {
  firstSource: string;
  firstCampaignId?: string;
}): Promise<string> {
  const userId = await authGetUserId();

  if (userId) {
    const [byUser] = await db
      .select({ id: consumerProfiles.id })
      .from(consumerProfiles)
      .where(eq(consumerProfiles.userId, userId))
      .limit(1);
    if (byUser) return byUser.id;

    // No profile yet for this signed-in user. If this browser already has
    // an anonymous shopping history, merge it in instead of starting over.
    const anonymousSessionId = await getOrCreateAnonymousSessionId();
    const [byAnon] = await db
      .select({ id: consumerProfiles.id })
      .from(consumerProfiles)
      .where(eq(consumerProfiles.anonymousSessionId, anonymousSessionId))
      .limit(1);

    if (byAnon) {
      await db
        .update(consumerProfiles)
        .set({ userId })
        .where(eq(consumerProfiles.id, byAnon.id));
      await db
        .update(anonymousSessions)
        .set({ mergedIntoUserId: userId })
        .where(eq(anonymousSessions.id, anonymousSessionId));
      return byAnon.id;
    }

    // Insert-or-return via ON CONFLICT rather than select-then-insert: two
    // concurrent requests for the same first-time user (e.g. a page
    // prefetch racing the real navigation) would otherwise both see "no
    // row" and both try to insert, violating the unique constraint on
    // user_id. The upsert makes this atomic.
    const [created] = await db
      .insert(consumerProfiles)
      .values({ userId })
      .onConflictDoUpdate({
        target: consumerProfiles.userId,
        set: { updatedAt: new Date() },
      })
      .returning({ id: consumerProfiles.id });
    return created.id;
  }

  const anonymousSessionId = await getOrCreateAnonymousSessionId(attribution);
  // Same race as above, keyed on anonymous_session_id instead.
  const [row] = await db
    .insert(consumerProfiles)
    .values({ anonymousSessionId })
    .onConflictDoUpdate({
      target: consumerProfiles.anonymousSessionId,
      set: { updatedAt: new Date() },
    })
    .returning({ id: consumerProfiles.id });
  return row.id;
}

export async function getCurrentProfile() {
  const userId = await authGetUserId();
  if (!userId) return null;
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1);
  return profile ?? null;
}
