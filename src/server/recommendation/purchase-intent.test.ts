import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { anonymousSessions, behavioralEvents, consumerProfiles, dealerships } from "@/server/db/schema";
import { computeIntentScore } from "./purchase-intent";
import type { IntentWeights } from "./config";

/**
 * Integration test: exercises computeIntentScore against the real local
 * Postgres database (see .env.local / DATABASE_URL), using throwaway rows
 * created and torn down within this file. Requires `npm run db:local:setup`
 * to have been run at least once.
 */

const weights: IntentWeights = {
  availability_request: 35,
  appointment_request: 40,
  trade_interest: 12,
  financing_interest: 10,
  save: 6,
  dealer_view: 8,
  detail_view: 4,
  repeat_session: 8,
  video_complete: 3,
  proximityBonusMax: 10,
  proximityBonusMiles: 30,
};

let dealershipId: string;
let consumerProfileId: string;
let anonymousSessionId: string;

beforeAll(async () => {
  const [dealership] = await db
    .insert(dealerships)
    .values({
      name: "__test_dealer__ Purchase Intent",
      slug: `__test-dealer-purchase-intent-${Date.now()}`,
      primaryContactName: "Test Contact",
      primaryContactEmail: "test@example.com",
      status: "approved",
    })
    .returning({ id: dealerships.id });
  dealershipId = dealership.id;

  const [session] = await db.insert(anonymousSessions).values({}).returning({ id: anonymousSessions.id });
  anonymousSessionId = session.id;

  const [profile] = await db
    .insert(consumerProfiles)
    .values({ anonymousSessionId })
    .returning({ id: consumerProfiles.id });
  consumerProfileId = profile.id;
});

afterAll(async () => {
  await db.delete(consumerProfiles).where(eq(consumerProfiles.id, consumerProfileId));
  await db.delete(anonymousSessions).where(eq(anonymousSessions.id, anonymousSessionId));
  await db.delete(dealerships).where(eq(dealerships.id, dealershipId));
});

describe("computeIntentScore", () => {
  it("scores a bare check_availability CTA with no history above zero", async () => {
    const result = await computeIntentScore({
      consumerProfileId,
      dealershipId,
      ctaType: "check_availability",
      weights,
    });
    expect(result.score).toBeGreaterThan(0);
    expect(result.reasons).toContain("Requested availability on this RV");
  });

  it("scores an appointment request higher than a plain question", async () => {
    const appointment = await computeIntentScore({
      consumerProfileId,
      dealershipId,
      ctaType: "schedule_walkthrough",
      weights,
    });
    const question = await computeIntentScore({
      consumerProfileId,
      dealershipId,
      ctaType: "ask_question",
      weights,
    });
    expect(appointment.score).toBeGreaterThan(question.score);
  });

  it("increases with repeated views of this dealer's inventory", async () => {
    const before = await computeIntentScore({
      consumerProfileId,
      dealershipId,
      ctaType: "ask_question",
      weights,
    });

    await db.insert(behavioralEvents).values([
      { consumerProfileId, eventType: "dealer_view", dealershipId },
      { consumerProfileId, eventType: "dealer_view", dealershipId },
    ]);

    const after = await computeIntentScore({
      consumerProfileId,
      dealershipId,
      ctaType: "ask_question",
      weights,
    });

    expect(after.score).toBeGreaterThan(before.score);
    expect(after.reasons.some((r) => r.includes("dealer's inventory"))).toBe(true);
  });

  it("caps the score at 100", async () => {
    // Flood with high-weight signals to try to push past the ceiling.
    await db.insert(behavioralEvents).values(
      Array.from({ length: 20 }, () => ({
        consumerProfileId,
        eventType: "detail_view" as const,
      })),
    );
    const result = await computeIntentScore({
      consumerProfileId,
      dealershipId,
      ctaType: "schedule_walkthrough",
      weights: { ...weights, appointment_request: 500 },
    });
    expect(result.score).toBeLessThanOrEqual(100);
  });
});
