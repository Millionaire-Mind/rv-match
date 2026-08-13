import { db } from "@/server/db/client";
import { behavioralEvents } from "@/server/db/schema";

export type BehavioralEventType =
  | "page_view"
  | "discovery_started"
  | "video_started"
  | "video_25"
  | "video_50"
  | "video_75"
  | "video_complete"
  | "video_replayed"
  | "video_paused"
  | "video_muted"
  | "video_unmuted"
  | "pass"
  | "like"
  | "love"
  | "more_like_this"
  | "save"
  | "unsave"
  | "detail_view"
  | "location_added"
  | "match_completed"
  | "lead_started"
  | "lead_submitted"
  | "dealer_view"
  | "account_created"
  | "search_performed"
  | "show_me_similar"
  | "partner_invite_created"
  | "partner_joined"
  | "shared_match_viewed"
  | "call_dealer_clicked";

export interface TrackEventParams {
  consumerProfileId: string | null;
  eventType: BehavioralEventType;
  inventoryId?: string;
  dealershipId?: string;
  metadata?: Record<string, unknown>;
}

/** The single write path for behavioral_events — see ARCHITECTURE.md. */
export async function trackEvent(params: TrackEventParams): Promise<void> {
  await db.insert(behavioralEvents).values({
    consumerProfileId: params.consumerProfileId,
    eventType: params.eventType,
    inventoryId: params.inventoryId,
    dealershipId: params.dealershipId,
    metadata: params.metadata ?? {},
  });
}
