/**
 * The full first-touch acquisition-source taxonomy (Gap 4F). Every
 * anonymous session's firstSource is one of these values, whether it came
 * through a /go/[code] campaign link or a raw UTM-tagged landing on any
 * page. Kept as a plain string column (not a DB enum) - see
 * distribution_campaigns.campaign_type for the same rationale - but this
 * module is the single place new values get added, so it can't drift.
 */
export const ACQUISITION_SOURCES = [
  "dealer",
  "salesperson",
  "qr",
  "campaign",
  "creator",
  "social",
  "organic",
  "referral",
  "partner",
  "direct",
  "unknown",
] as const;

export type AcquisitionSource = (typeof ACQUISITION_SOURCES)[number];

const SOCIAL_HOSTS = [
  "facebook.com",
  "instagram.com",
  "tiktok.com",
  "twitter.com",
  "x.com",
  "youtube.com",
  "snapchat.com",
  "pinterest.com",
  "linkedin.com",
  "reddit.com",
];

const SEARCH_ENGINE_HOSTS = ["google.", "bing.", "duckduckgo.com", "yahoo.com", "baidu.com"];

function stripWww(host: string): string {
  return host.replace(/^www\./, "");
}

/**
 * Classifies a raw landing visit (no /go/[code] campaign involved) from
 * its UTM parameters and/or HTTP Referer header into the taxonomy above.
 * /go/[code] visits are classified separately from the campaign row
 * itself (dealer/salesperson/creator/qr - see classifyCampaignSource)
 * since that's a stronger, more specific signal than UTM guessing.
 */
export function classifyOrganicSource(input: {
  utmSource?: string | null;
  utmMedium?: string | null;
  referrerHost?: string | null;
  appHost?: string | null;
}): AcquisitionSource {
  const utmSource = input.utmSource?.toLowerCase().trim() || null;
  const utmMedium = input.utmMedium?.toLowerCase().trim() || null;
  const referrerHost = input.referrerHost ? stripWww(input.referrerHost.toLowerCase()) : null;
  const appHost = input.appHost ? stripWww(input.appHost.toLowerCase()) : null;

  if (utmMedium === "social" || (utmSource && SOCIAL_HOSTS.some((h) => utmSource.includes(h.split(".")[0])))) {
    return "social";
  }
  if (referrerHost && SOCIAL_HOSTS.some((h) => referrerHost.includes(h))) return "social";

  if (utmMedium === "referral") return "referral";

  if (utmSource || utmMedium) return "campaign"; // explicitly UTM-tagged, but not social - a real marketing campaign

  if (referrerHost && SEARCH_ENGINE_HOSTS.some((h) => referrerHost.includes(h))) return "organic";

  if (referrerHost && appHost && referrerHost !== appHost) return "referral";

  return "direct"; // no UTM tags and no third-party referrer
}

/**
 * Classifies a /go/[code] campaign visit - a stronger signal than UTM
 * guessing since we know exactly which dealer artifact (or creator link)
 * the scan came from.
 */
export function classifyCampaignSource(campaign: {
  campaignType: string;
  creatorId: string | null;
  salespersonUserId: string | null;
}): AcquisitionSource {
  if (campaign.creatorId) return "creator";
  if (campaign.salespersonUserId) return "salesperson";
  if (campaign.campaignType === "dealer_inventory") return "qr";
  return "dealer";
}
