-- Phase 10: completes the RV detail/saved CTA set. estimate_trade and
-- financing_info feed the trade_interest/financing_interest intent weights
-- that already existed in the intent-scoring config but had no CTA wired
-- up to trigger them. call_dealer_clicked is a behavioral event (not a
-- lead_cta_type - a phone call has no lead form submission), added to
-- behavioral_events so it can feed purchase-intent scoring the same way
-- dealer_view/detail_view do.
alter type lead_cta_type add value if not exists 'estimate_trade';
alter type lead_cta_type add value if not exists 'financing_info';

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
  'search_performed', 'show_me_similar',
  'partner_invite_created', 'partner_joined', 'shared_match_viewed',
  'call_dealer_clicked'
));
