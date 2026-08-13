-- Adds the remaining watch-behavior event types the original spec requires
-- (pause, mute, unmute - started/25/50/75/complete/replayed already
-- existed). event_type is a checked text column specifically so new values
-- can be added this way without an enum migration - see the comment on
-- behavioral_events in 20260101000005_behavior_and_recommendations.sql.
alter table behavioral_events drop constraint behavioral_events_event_type_check;
alter table behavioral_events add constraint behavioral_events_event_type_check check (event_type in (
  'page_view', 'discovery_started',
  'video_started', 'video_25', 'video_50', 'video_75', 'video_complete', 'video_replayed',
  'video_paused', 'video_muted', 'video_unmuted',
  'pass', 'like', 'love', 'more_like_this',
  'save', 'unsave', 'detail_view',
  'location_added', 'match_completed',
  'lead_started', 'lead_submitted',
  'dealer_view', 'account_created'
));
