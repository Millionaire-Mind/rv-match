import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Enums — must match supabase/migrations/20260101000001_extensions_and_enums.sql
// ---------------------------------------------------------------------------

export const platformRoleEnum = pgEnum("platform_role", ["consumer", "platform_admin"]);
export const dealerRoleEnum = pgEnum("dealer_role", ["owner", "sales_manager", "salesperson", "marketing"]);
export const dealershipStatusEnum = pgEnum("dealership_status", [
  "pending",
  "approved",
  "suspended",
  "rejected",
]);
export const pilotStatusEnum = pgEnum("pilot_status", [
  "pending",
  "active",
  "conversion_due",
  "converted",
  "expired",
  "suspended",
]);
// Gap 6: billing-ready plan schema only - no payment processing is
// implemented anywhere in this codebase. See dealerPilots below.
export const dealerPlanEnum = pgEnum("dealer_plan", ["founding_pilot", "standard", "premium"]);
export const billingProviderEnum = pgEnum("billing_provider", ["none", "stripe"]);
export const billingStatusEnum = pgEnum("billing_status", ["none", "trialing", "active", "past_due", "canceled"]);
export const rvTypeEnum = pgEnum("rv_type", [
  "travel_trailer",
  "fifth_wheel",
  "class_a",
  "class_b",
  "class_c",
  "toy_hauler",
  "pop_up",
  "truck_camper",
  "park_model",
  "other",
]);
export const rvConditionEnum = pgEnum("rv_condition", ["new", "used"]);
export const inventoryStatusEnum = pgEnum("inventory_status", [
  "draft",
  "published",
  "sold",
  "archived",
]);
export const inventorySourceEnum = pgEnum("inventory_source", ["manual", "csv_import", "feed_import"]);
export const videoSourceEnum = pgEnum("video_source", ["dealer_upload", "generated"]);
export const videoGenerationStatusEnum = pgEnum("video_generation_status", [
  "queued",
  "processing",
  "completed",
  "failed",
]);
export const swipeDecisionTypeEnum = pgEnum("swipe_decision_type", [
  "pass",
  "like",
  "love",
  "more_like_this",
]);
export const leadCtaTypeEnum = pgEnum("lead_cta_type", [
  "check_availability",
  "ask_question",
  "request_best_price",
  "schedule_walkthrough",
  "estimate_trade",
  "financing_info",
]);
export const preferredContactMethodEnum = pgEnum("preferred_contact_method", [
  "email",
  "phone",
  "text",
]);
export const leadStatusEnum = pgEnum("lead_status", [
  "new",
  "contacted",
  "appointment",
  "showroom",
  "negotiation",
  "sold",
  "lost",
]);
export const leadActivityTypeEnum = pgEnum("lead_activity_type", [
  "status_change",
  "note",
  "assignment",
  "contact_logged",
]);
export const saleVerificationStatusEnum = pgEnum("sale_verification_status", [
  "dealer_reported",
  "verified",
  "rejected",
]);

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull(),
  fullName: text("full_name"),
  phone: text("phone"),
  platformRole: platformRoleEnum("platform_role").notNull().default("consumer"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const anonymousSessions = pgTable("anonymous_sessions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  mergedIntoUserId: uuid("merged_into_user_id").references(() => profiles.id, {
    onDelete: "set null",
  }),
  userAgent: text("user_agent"),
  firstSource: text("first_source").default("direct"),
  /** Which campaign (QR/link/creator) first brought this browser to the
   * site - set once at first creation, never overwritten by a later visit
   * through a different link (see src/app/go/[code]/route.ts). */
  firstCampaignId: uuid("first_campaign_id").references(() => distributionCampaigns.id, { onDelete: "set null" }),
  /** Raw UTM parameters from the very first visit, frozen the same way
   * firstSource is - see src/server/attribution/source.ts for how these
   * feed the classified firstSource bucket. */
  utmSource: text("utm_source"),
  utmMedium: text("utm_medium"),
  utmCampaign: text("utm_campaign"),
  utmContent: text("utm_content"),
  utmTerm: text("utm_term"),
});

export const consumerProfiles = pgTable("consumer_profiles", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").unique().references(() => profiles.id, { onDelete: "cascade" }),
  anonymousSessionId: uuid("anonymous_session_id")
    .unique()
    .references(() => anonymousSessions.id, { onDelete: "set null" }),
  zipCode: text("zip_code"),
  lat: numeric("lat", { precision: 9, scale: 6 }),
  lng: numeric("lng", { precision: 9, scale: 6 }),
  radiusMiles: integer("radius_miles").notNull().default(100),
  decisionsCount: integer("decisions_count").notNull().default(0),
  emailOptOut: boolean("email_opt_out").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * "Compare With My Partner" invite links. Joining a link only ever attaches
 * an existing (or freshly created) consumer_profiles row as the partner -
 * it never merges the two profiles the way anonymous->signed-in merge does.
 * Each side keeps its own independent swipe/preference history; only the
 * shared-match view (src/server/partner/shared-matches.ts) reads both.
 */
export const partnerLinks = pgTable("partner_links", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerConsumerProfileId: uuid("owner_consumer_profile_id")
    .notNull()
    .references(() => consumerProfiles.id, { onDelete: "cascade" }),
  partnerConsumerProfileId: uuid("partner_consumer_profile_id").references(() => consumerProfiles.id, {
    onDelete: "set null",
  }),
  token: text("token").notNull().unique(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  joinedAt: timestamp("joined_at", { withTimezone: true }),
  /** Set the first time both partners cross the match-complete decision
   * threshold, so the partner-match-complete notification fires exactly
   * once, not on every subsequent visit to the shared match page. */
  matchNotifiedAt: timestamp("match_notified_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// Dealerships
// ---------------------------------------------------------------------------

export const dealerships = pgTable("dealerships", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  addressLine1: text("address_line1"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  lat: numeric("lat", { precision: 9, scale: 6 }),
  lng: numeric("lng", { precision: 9, scale: 6 }),
  phone: text("phone"),
  website: text("website"),
  primaryContactName: text("primary_contact_name").notNull(),
  primaryContactEmail: text("primary_contact_email").notNull(),
  inventorySizeEstimate: integer("inventory_size_estimate"),
  status: dealershipStatusEnum("status").notNull().default("pending"),
  appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  approvedBy: uuid("approved_by").references(() => profiles.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const dealershipUsers = pgTable("dealership_users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  dealershipId: uuid("dealership_id")
    .notNull()
    .references(() => dealerships.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  role: dealerRoleEnum("role").notNull().default("salesperson"),
  active: boolean("active").notNull().default(true),
  invitedBy: uuid("invited_by").references(() => profiles.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const dealerPilots = pgTable("dealer_pilots", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  dealershipId: uuid("dealership_id")
    .notNull()
    .unique()
    .references(() => dealerships.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  trialDays: integer("trial_days").notNull().default(90),
  salesThreshold: integer("sales_threshold").notNull().default(3),
  verifiedSalesCount: integer("verified_sales_count").notNull().default(0),
  status: pilotStatusEnum("status").notNull().default("pending"),
  convertedAt: timestamp("converted_at", { withTimezone: true }),
  // Gap 6: billing-ready plan schema. Durable shape for a future payment
  // integration to populate - nothing in this codebase writes a
  // non-default value into these columns. NO PAYMENT PROCESSING IS
  // IMPLEMENTED. trial start is already startedAt above.
  plan: dealerPlanEnum("plan").notNull().default("founding_pilot"),
  billingProvider: billingProviderEnum("billing_provider").notNull().default("none"),
  billingStatus: billingStatusEnum("billing_status").notNull().default("none"),
  externalCustomerId: text("external_customer_id"),
  externalSubscriptionId: text("external_subscription_id"),
  conversionDueAt: timestamp("conversion_due_at", { withTimezone: true }),
  activatedAt: timestamp("activated_at", { withTimezone: true }),
  canceledAt: timestamp("canceled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

export const inventory = pgTable("inventory", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  dealershipId: uuid("dealership_id")
    .notNull()
    .references(() => dealerships.id, { onDelete: "cascade" }),
  stockNumber: text("stock_number").notNull(),
  vin: text("vin"),
  year: integer("year").notNull(),
  make: text("make").notNull(),
  model: text("model").notNull(),
  floorplan: text("floorplan"),
  rvType: rvTypeEnum("rv_type").notNull(),
  condition: rvConditionEnum("condition").notNull().default("used"),
  msrpCents: integer("msrp_cents"),
  salePriceCents: integer("sale_price_cents").notNull(),
  advertisedPriceCents: integer("advertised_price_cents"),
  lengthInches: integer("length_inches"),
  widthInches: integer("width_inches"),
  heightInches: integer("height_inches"),
  dryWeightLbs: integer("dry_weight_lbs"),
  gvwrLbs: integer("gvwr_lbs"),
  hitchWeightLbs: integer("hitch_weight_lbs"),
  sleeps: integer("sleeps"),
  slideCount: integer("slide_count").default(0),
  bedConfiguration: text("bed_configuration"),
  bunkhouse: boolean("bunkhouse").notNull().default(false),
  toyHauler: boolean("toy_hauler").notNull().default(false),
  outdoorKitchen: boolean("outdoor_kitchen").notNull().default(false),
  exteriorColor: text("exterior_color"),
  interior: text("interior"),
  description: text("description"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  lat: numeric("lat", { precision: 9, scale: 6 }),
  lng: numeric("lng", { precision: 9, scale: 6 }),
  status: inventoryStatusEnum("status").notNull().default("draft"),
  source: inventorySourceEnum("source").notNull().default("manual"),
  canonicalUrl: text("canonical_url"),
  primaryPhotoId: uuid("primary_photo_id"),
  primaryVideoId: uuid("primary_video_id"),
  dateAdded: timestamp("date_added", { withTimezone: true }).notNull().defaultNow(),
  dateSold: timestamp("date_sold", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const inventoryFeatures = pgTable("inventory_features", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  inventoryId: uuid("inventory_id")
    .notNull()
    .references(() => inventory.id, { onDelete: "cascade" }),
  feature: text("feature").notNull(),
});

export const inventoryPhotos = pgTable("inventory_photos", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  inventoryId: uuid("inventory_id")
    .notNull()
    .references(() => inventory.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const inventoryVideos = pgTable("inventory_videos", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  inventoryId: uuid("inventory_id")
    .notNull()
    .references(() => inventory.id, { onDelete: "cascade" }),
  url: text("url"),
  source: videoSourceEnum("source").notNull(),
  durationSeconds: numeric("duration_seconds", { precision: 6, scale: 2 }),
  thumbnailUrl: text("thumbnail_url"),
  captionUrl: text("caption_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const inventoryPriceHistory = pgTable("inventory_price_history", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  inventoryId: uuid("inventory_id")
    .notNull()
    .references(() => inventory.id, { onDelete: "cascade" }),
  oldPriceCents: integer("old_price_cents").notNull(),
  newPriceCents: integer("new_price_cents").notNull(),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A dealer-configured remote inventory feed (CSV/JSON/XML URL + a mapping
 * from their feed's field names to our canonical column names). Runs are
 * recorded in inventory_feed_runs; scripts/run-feed-import.ts is the
 * dedicated worker that refreshes active sources on a schedule, mirroring
 * how video generation runs on its own worker rather than inline in a
 * request (see scripts/run-video-worker.ts).
 */
export const inventoryFeedSources = pgTable("inventory_feed_sources", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  dealershipId: uuid("dealership_id")
    .notNull()
    .references(() => dealerships.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  format: text("format").notNull(),
  url: text("url").notNull(),
  fieldMapping: jsonb("field_mapping").notNull().default({}),
  recordPath: text("record_path"),
  refreshIntervalMinutes: integer("refresh_interval_minutes"),
  active: boolean("active").notNull().default(true),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  lastRunStatus: text("last_run_status"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const inventoryFeedRuns = pgTable("inventory_feed_runs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  feedSourceId: uuid("feed_source_id")
    .notNull()
    .references(() => inventoryFeedSources.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  rowsProcessed: integer("rows_processed").notNull().default(0),
  rowsCreated: integer("rows_created").notNull().default(0),
  rowsUpdated: integer("rows_updated").notNull().default(0),
  rowsFailed: integer("rows_failed").notNull().default(0),
  errors: jsonb("errors").notNull().default([]),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

/** Lightweight creator/influencer identity - no payments, just who they are and whether they're still active. */
export const creators = pgTable("creators", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  contactEmail: text("contact_email"),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A single campaign record backs every kind of shareable link: a QR code
 * on a dealership's lot, a QR sticker on one specific RV's window, a
 * generic dealer link, or a creator/influencer's referral link. All
 * resolve through /go/{code} (src/app/go/[code]/route.ts), which is also
 * where first-touch attribution actually gets recorded.
 */
export const distributionCampaigns = pgTable("distribution_campaigns", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  dealershipId: uuid("dealership_id").references(() => dealerships.id, { onDelete: "cascade" }),
  inventoryId: uuid("inventory_id").references(() => inventory.id, { onDelete: "cascade" }),
  creatorId: uuid("creator_id").references(() => creators.id, { onDelete: "set null" }),
  /** The dealer staff member this personal referral code is attributed to
   * (campaignType "salesperson") - independent of who ends up handling
   * whichever leads it generates. */
  salespersonUserId: uuid("salesperson_user_id").references(() => profiles.id, { onDelete: "set null" }),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  campaignType: text("campaign_type").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const videoGenerationJobs = pgTable("video_generation_jobs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  inventoryId: uuid("inventory_id")
    .notNull()
    .references(() => inventory.id, { onDelete: "cascade" }),
  status: videoGenerationStatusEnum("status").notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0),
  errorMessage: text("error_message"),
  outputVideoId: uuid("output_video_id").references(() => inventoryVideos.id, {
    onDelete: "set null",
  }),
  requestedBy: uuid("requested_by").references(() => profiles.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// Behavior & recommendation
// ---------------------------------------------------------------------------

export const swipeDecisions = pgTable("swipe_decisions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  consumerProfileId: uuid("consumer_profile_id")
    .notNull()
    .references(() => consumerProfiles.id, { onDelete: "cascade" }),
  inventoryId: uuid("inventory_id")
    .notNull()
    .references(() => inventory.id, { onDelete: "cascade" }),
  decision: swipeDecisionTypeEnum("decision").notNull(),
  swipeDurationMs: integer("swipe_duration_ms"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const savedInventory = pgTable("saved_inventory", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  consumerProfileId: uuid("consumer_profile_id")
    .notNull()
    .references(() => consumerProfiles.id, { onDelete: "cascade" }),
  inventoryId: uuid("inventory_id")
    .notNull()
    .references(() => inventory.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const behavioralEvents = pgTable("behavioral_events", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  consumerProfileId: uuid("consumer_profile_id").references(() => consumerProfiles.id, {
    onDelete: "cascade",
  }),
  eventType: text("event_type").notNull(),
  inventoryId: uuid("inventory_id").references(() => inventory.id, { onDelete: "cascade" }),
  dealershipId: uuid("dealership_id").references(() => dealerships.id, { onDelete: "cascade" }),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * In-app notification records for both consumers and dealer team members.
 * A consumer recipient is keyed by consumerProfileId (works for anonymous
 * returning visitors via the persistent anonymous-session cookie, not just
 * signed-in accounts); a dealer recipient is keyed by userId (dealer users
 * are always signed in). Never both on the same row - see the
 * notifications_recipient_chk constraint.
 */
export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  recipientType: text("recipient_type").notNull(),
  consumerProfileId: uuid("consumer_profile_id").references(() => consumerProfiles.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => profiles.id, { onDelete: "cascade" }),
  dealershipId: uuid("dealership_id").references(() => dealerships.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  link: text("link"),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** A shopper's request to have their account/data deleted - fulfilled by
 * an admin (src/server/admin/privacy-requests.ts), not instantly
 * self-service, since a dealer may still have a legitimate business reason
 * to retain the leads a consumer submitted (see the migration's comment). */
export const accountDeletionRequests = pgTable("account_deletion_requests", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  consumerProfileId: uuid("consumer_profile_id").references(() => consumerProfiles.id, { onDelete: "set null" }),
  status: text("status").notNull().default("pending"),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  completedBy: uuid("completed_by").references(() => profiles.id, { onDelete: "set null" }),
});

export const consumerPreferences = pgTable("consumer_preferences", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  consumerProfileId: uuid("consumer_profile_id")
    .notNull()
    .references(() => consumerProfiles.id, { onDelete: "cascade" }),
  attribute: text("attribute").notNull(),
  value: text("value").notNull(),
  score: numeric("score", { precision: 6, scale: 4 }).notNull().default("0"),
  observations: integer("observations").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Leads & sales
// ---------------------------------------------------------------------------

export const leads = pgTable("leads", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  dealershipId: uuid("dealership_id")
    .notNull()
    .references(() => dealerships.id, { onDelete: "cascade" }),
  inventoryId: uuid("inventory_id")
    .notNull()
    .references(() => inventory.id, { onDelete: "restrict" }),
  consumerProfileId: uuid("consumer_profile_id").references(() => consumerProfiles.id, {
    onDelete: "set null",
  }),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  preferredContact: preferredContactMethodEnum("preferred_contact").notNull().default("email"),
  message: text("message"),
  ctaType: leadCtaTypeEnum("cta_type").notNull(),
  consent: boolean("consent").notNull().default(true),
  matchScore: numeric("match_score", { precision: 5, scale: 2 }),
  intentScore: numeric("intent_score", { precision: 5, scale: 2 }),
  intentReasons: jsonb("intent_reasons").notNull().default([]),
  behaviorSnapshot: jsonb("behavior_snapshot").notNull().default({}),
  status: leadStatusEnum("status").notNull().default("new"),
  assignedTo: uuid("assigned_to").references(() => profiles.id, { onDelete: "set null" }),
  /** Frozen copy of the consumer's first-touch attribution as of lead
   * submission (same "immutable snapshot" philosophy as behaviorSnapshot
   * above) - never re-derived later, so editing a campaign afterward can't
   * silently change what a past lead is attributed to. */
  firstSource: text("first_source"),
  firstCampaignId: uuid("first_campaign_id").references(() => distributionCampaigns.id, { onDelete: "set null" }),
  firstSalespersonUserId: uuid("first_salesperson_user_id").references(() => profiles.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const leadActivity = pgTable("lead_activity", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  leadId: uuid("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  actorId: uuid("actor_id").references(() => profiles.id, { onDelete: "set null" }),
  activityType: leadActivityTypeEnum("activity_type").notNull(),
  fromStatus: leadStatusEnum("from_status"),
  toStatus: leadStatusEnum("to_status"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const attributedSales = pgTable("attributed_sales", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  leadId: uuid("lead_id")
    .notNull()
    .unique()
    .references(() => leads.id, { onDelete: "cascade" }),
  dealershipId: uuid("dealership_id")
    .notNull()
    .references(() => dealerships.id, { onDelete: "cascade" }),
  soldInventoryId: uuid("sold_inventory_id")
    .notNull()
    .references(() => inventory.id, { onDelete: "restrict" }),
  isOriginalLeadRv: boolean("is_original_lead_rv").notNull().default(true),
  salePriceCents: integer("sale_price_cents"),
  saleDate: date("sale_date").notNull(),
  salespersonId: uuid("salesperson_id").references(() => profiles.id, { onDelete: "set null" }),
  notes: text("notes"),
  verificationStatus: saleVerificationStatusEnum("verification_status")
    .notNull()
    .default("dealer_reported"),
  verifiedBy: uuid("verified_by").references(() => profiles.id, { onDelete: "set null" }),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  /** Copied from the originating lead at sale-creation time, not
   * re-derived - a sale's recorded attribution is exactly what its lead's
   * was, permanently. */
  firstSource: text("first_source"),
  firstCampaignId: uuid("first_campaign_id").references(() => distributionCampaigns.id, { onDelete: "set null" }),
  firstSalespersonUserId: uuid("first_salesperson_user_id").references(() => profiles.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Admin & audit
// ---------------------------------------------------------------------------

export const adminConfiguration = pgTable("admin_configuration", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by").references(() => profiles.id, { onDelete: "set null" }),
});

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  actorId: uuid("actor_id").references(() => profiles.id, { onDelete: "set null" }),
  actorRole: text("actor_role"),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id"),
  dealershipId: uuid("dealership_id").references(() => dealerships.id, { onDelete: "set null" }),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Relations (used for Drizzle's relational query API)
// ---------------------------------------------------------------------------

export const dealershipsRelations = relations(dealerships, ({ many, one }) => ({
  users: many(dealershipUsers),
  inventory: many(inventory),
  pilot: one(dealerPilots, {
    fields: [dealerships.id],
    references: [dealerPilots.dealershipId],
  }),
}));

export const inventoryRelations = relations(inventory, ({ one, many }) => ({
  dealership: one(dealerships, {
    fields: [inventory.dealershipId],
    references: [dealerships.id],
  }),
  photos: many(inventoryPhotos),
  videos: many(inventoryVideos),
  features: many(inventoryFeatures),
  primaryVideo: one(inventoryVideos, {
    fields: [inventory.primaryVideoId],
    references: [inventoryVideos.id],
  }),
  primaryPhoto: one(inventoryPhotos, {
    fields: [inventory.primaryPhotoId],
    references: [inventoryPhotos.id],
  }),
}));

export const leadsRelations = relations(leads, ({ one, many }) => ({
  dealership: one(dealerships, { fields: [leads.dealershipId], references: [dealerships.id] }),
  inventory: one(inventory, { fields: [leads.inventoryId], references: [inventory.id] }),
  activity: many(leadActivity),
}));
