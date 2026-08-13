import { z } from "zod";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { adminConfiguration } from "@/server/db/schema";

export const recommendationWeightsSchema = z.object({
  pass: z.number(),
  like: z.number(),
  love: z.number(),
  more_like_this: z.number(),
  video_complete: z.number(),
  video_replayed: z.number(),
  save: z.number(),
  detail_view: z.number(),
  fast_swipe_penalty: z.number(),
  fast_swipe_threshold_ms: z.number(),
  explorationRate: z.number().min(0).max(1),
  priceAffinitySigma: z.number(),
  distanceDecayMiles: z.number(),
});
export type RecommendationWeights = z.infer<typeof recommendationWeightsSchema>;

export const intentWeightsSchema = z.object({
  availability_request: z.number(),
  appointment_request: z.number(),
  trade_interest: z.number(),
  financing_interest: z.number(),
  save: z.number(),
  dealer_view: z.number(),
  detail_view: z.number(),
  repeat_session: z.number(),
  video_complete: z.number(),
  call_dealer: z.number(),
  love_swipe: z.number(),
  proximityBonusMax: z.number(),
  proximityBonusMiles: z.number(),
});
export type IntentWeights = z.infer<typeof intentWeightsSchema>;

const DEFAULT_RECOMMENDATION_WEIGHTS: RecommendationWeights = {
  pass: -1.0,
  like: 1.0,
  love: 2.0,
  more_like_this: 3.0,
  video_complete: 0.4,
  video_replayed: 0.6,
  save: 1.5,
  detail_view: 0.8,
  fast_swipe_penalty: -0.3,
  fast_swipe_threshold_ms: 600,
  explorationRate: 0.15,
  priceAffinitySigma: 0.35,
  distanceDecayMiles: 60,
};

const DEFAULT_INTENT_WEIGHTS: IntentWeights = {
  availability_request: 35,
  appointment_request: 40,
  trade_interest: 12,
  financing_interest: 10,
  save: 6,
  dealer_view: 8,
  detail_view: 4,
  repeat_session: 8,
  video_complete: 3,
  call_dealer: 25,
  love_swipe: 1.5,
  proximityBonusMax: 10,
  proximityBonusMiles: 30,
};

async function loadConfig<T>(key: string, schema: z.ZodType<T>, fallback: T): Promise<T> {
  const [row] = await db
    .select({ value: adminConfiguration.value })
    .from(adminConfiguration)
    .where(eq(adminConfiguration.key, key))
    .limit(1);
  if (!row) return fallback;
  const parsed = schema.safeParse(row.value);
  return parsed.success ? parsed.data : fallback;
}

export async function loadRecommendationWeights(): Promise<RecommendationWeights> {
  return loadConfig("recommendation_weights", recommendationWeightsSchema, DEFAULT_RECOMMENDATION_WEIGHTS);
}

export async function loadIntentWeights(): Promise<IntentWeights> {
  return loadConfig("intent_weights", intentWeightsSchema, DEFAULT_INTENT_WEIGHTS);
}

export const platformConfigSchema = z.object({
  activationThreshold: z.number(),
  matchCompleteThreshold: z.number(),
  locationPromptThreshold: z.number(),
});
export type PlatformConfig = z.infer<typeof platformConfigSchema>;

const DEFAULT_PLATFORM_CONFIG: PlatformConfig = {
  activationThreshold: 10,
  matchCompleteThreshold: 20,
  locationPromptThreshold: 10,
};

export async function loadPlatformConfig(): Promise<PlatformConfig> {
  return loadConfig("platform", platformConfigSchema, DEFAULT_PLATFORM_CONFIG);
}

export const pilotDefaultsSchema = z.object({
  trial_days: z.number(),
  sales_threshold: z.number(),
});
export type PilotDefaults = z.infer<typeof pilotDefaultsSchema>;

const DEFAULT_PILOT_DEFAULTS: PilotDefaults = { trial_days: 90, sales_threshold: 3 };

export async function loadPilotDefaults(): Promise<PilotDefaults> {
  return loadConfig("pilot_defaults", pilotDefaultsSchema, DEFAULT_PILOT_DEFAULTS);
}
