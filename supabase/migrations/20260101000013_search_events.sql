-- Adds behavioral event types for the traditional search path (Phase 8):
-- a filtered search being run, and "Show Me Similar RVs" being used from
-- an RV detail page to seed personalized discovery.
alter table behavioral_events drop constraint behavioral_events_event_type_check;
alter table behavioral_events add constraint behavioral_events_event_type_check check (event_type in (
  'page_view', 'discovery_started',
  'video_started', 'video_25', 'video_50', 'video_75', 'video_complete', 'video_replayed',
  'video_paused', 'video_muted', 'video_unmuted',
  'pass', 'like', 'love', 'more_like_this',
  'save', 'unsave', 'detail_view',
  'location_added', 'match_completed',
  'lead_started', 'lead_submitted',
  'dealer_view', 'account_created',
  'search_performed', 'show_me_similar'
));
