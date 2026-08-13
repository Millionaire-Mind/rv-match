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
export const dealerRoleEnum = pgEnum("dealer_role", ["owner", "staff"]);
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
export const inventorySourceEnum = pgEnum("inventory_source", ["manual", "csv_import"]);
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
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
  role: dealerRoleEnum("role").notNull().default("staff"),
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
