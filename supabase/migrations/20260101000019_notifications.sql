-- Phase 20-21: in-app notification records (consumer: saved-RV-sold,
-- price-drop, strong-match, partner-match-complete; dealer: new-lead,
-- high-intent-lead, appointment-request, sale-awaiting-verification,
-- video-generation-failure), plus a "have we already notified for this"
-- flag on partner_links so a shared match doesn't re-notify on every visit.
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_type text not null check (recipient_type in ('consumer', 'dealer_user')),
  consumer_profile_id uuid references consumer_profiles(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  dealership_id uuid references dealerships(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  link text,
  read boolean not null default false,
  created_at timestamptz not null default now(),
  constraint notifications_recipient_chk check (
    (recipient_type = 'consumer' and consumer_profile_id is not null and user_id is null)
    or (recipient_type = 'dealer_user' and user_id is not null and consumer_profile_id is null)
  )
);

create index if not exists notifications_consumer_idx on notifications(consumer_profile_id, created_at desc) where consumer_profile_id is not null;
create index if not exists notifications_user_idx on notifications(user_id, created_at desc) where user_id is not null;

alter table partner_links add column if not exists match_notified_at timestamptz;
