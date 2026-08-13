import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { distributionCampaigns } from "@/server/db/schema";
import { getOrCreateAnonymousSessionId } from "@/server/auth/anonymous";
import { trackEvent } from "@/server/analytics/track";

/**
 * The single resolver every QR code, dealer link, and creator referral
 * link points to. Recording first-touch attribution has to happen here,
 * inline in this request, before any redirect - it's the only place that
 * reliably runs before the visitor's anonymous_sessions row is first
 * created by anything else.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const origin = request.nextUrl.origin;

  const [campaign] = await db
    .select()
    .from(distributionCampaigns)
    .where(eq(distributionCampaigns.code, code))
    .limit(1);

  if (!campaign || !campaign.active) {
    return NextResponse.redirect(new URL("/", origin));
  }

  // Ensures the anonymous_sessions row exists with this attribution set on
  // first creation - no consumer_profiles row exists yet at this point
  // (that's created lazily on first real interaction), so the scan event
  // below isn't tied to a shopper identity.
  await getOrCreateAnonymousSessionId({
    firstSource: campaign.campaignType === "creator" ? "creator" : "qr",
    firstCampaignId: campaign.id,
  });

  await trackEvent({
    consumerProfileId: null,
    eventType: "campaign_scan",
    inventoryId: campaign.inventoryId ?? undefined,
    dealershipId: campaign.dealershipId ?? undefined,
    metadata: { campaignId: campaign.id, campaignCode: campaign.code },
  });

  const destination = campaign.inventoryId
    ? `/rv/${campaign.inventoryId}`
    : campaign.dealershipId
      ? `/search?dealershipId=${campaign.dealershipId}`
      : "/discover";

  return NextResponse.redirect(new URL(destination, origin));
}
