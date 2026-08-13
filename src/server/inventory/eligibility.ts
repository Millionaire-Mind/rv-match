import { and, eq, isNotNull, type SQL } from "drizzle-orm";

import { inventory } from "@/server/db/schema";

/**
 * The single definition of "eligible to appear in consumer-facing
 * discovery/search/match": published AND has a primary video set.
 *
 * RV Match is video-first by design, not a photo-card marketplace with a
 * video bonus - every consumer-facing listing query (the swipe feed, Match
 * results, and traditional search) must use this, not just filter by
 * status, or a published RV that hasn't finished generating a video yet
 * (or was published before this gate existed) could reach a swipe card or
 * search result with no usable video to play.
 */
export function discoveryEligible(): SQL {
  return and(eq(inventory.status, "published"), isNotNull(inventory.primaryVideoId))!;
}
