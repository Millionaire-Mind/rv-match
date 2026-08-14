import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { anonymousSessions, consumerProfiles, distributionCampaigns } from "@/server/db/schema";

export interface FirstTouchAttribution {
  firstSource: string | null;
  firstCampaignId: string | null;
  firstSalespersonUserId: string | null;
}

/**
 * Reads the durable first-touch attribution recorded on this consumer's
 * anonymous session (set once, at that session's very first creation - see
 * src/app/go/[code]/route.ts and getOrCreateAnonymousSessionId). Used at
 * lead-submission time to freeze a copy onto the lead row (see
 * leads/actions.ts) - this function itself never writes anything.
 *
 * A consumer_profiles row created directly for a signed-up user with no
 * prior anonymous browsing history has no anonymousSessionId to look this
 * up from, and honestly returns no attribution rather than guessing.
 */
export async function getFirstTouchAttribution(consumerProfileId: string): Promise<FirstTouchAttribution> {
  const [profile] = await db
    .select({ anonymousSessionId: consumerProfiles.anonymousSessionId })
    .from(consumerProfiles)
    .where(eq(consumerProfiles.id, consumerProfileId))
    .limit(1);

  if (!profile?.anonymousSessionId) {
    return { firstSource: null, firstCampaignId: null, firstSalespersonUserId: null };
  }

  const [session] = await db
    .select({ firstSource: anonymousSessions.firstSource, firstCampaignId: anonymousSessions.firstCampaignId })
    .from(anonymousSessions)
    .where(eq(anonymousSessions.id, profile.anonymousSessionId))
    .limit(1);

  let firstSalespersonUserId: string | null = null;
  if (session?.firstCampaignId) {
    const [campaign] = await db
      .select({ salespersonUserId: distributionCampaigns.salespersonUserId })
      .from(distributionCampaigns)
      .where(eq(distributionCampaigns.id, session.firstCampaignId))
      .limit(1);
    firstSalespersonUserId = campaign?.salespersonUserId ?? null;
  }

  return {
    firstSource: session?.firstSource ?? null,
    firstCampaignId: session?.firstCampaignId ?? null,
    firstSalespersonUserId,
  };
}
