import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import {
  anonymousSessions,
  consumerPreferences,
  consumerProfiles,
  dealerships,
  inventory,
  inventoryVideos,
  savedInventory,
} from "@/server/db/schema";

/**
 * Integration tests for Phase 5's event-integrity fixes: repeated
 * resubmission of the same signal (a duplicate swipe, toggling save
 * on/off/on, rapid-fire video_complete/replayed/detail_view) must not keep
 * re-applying preference deltas or re-counting decisions - the previous
 * implementation had no such guard on any of these paths.
 */

let currentToken: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "rvm_session" && currentToken ? { value: currentToken } : undefined),
    set: () => {},
    delete: () => {},
  }),
}));

const { submitSwipeDecision, toggleSaveInventory, recordClientEvent } = await import("./actions");

let dealershipId: string;
let anonymousSessionId: string;
let consumerProfileId: string;
let invId: string;

async function currentScoreFor(attribute: string, value: string): Promise<{ score: number; observations: number } | null> {
  const rows = await db.select().from(consumerPreferences).where(eq(consumerPreferences.consumerProfileId, consumerProfileId));
  const match = rows.find((r) => r.attribute === attribute && r.value === value);
  return match ? { score: Number(match.score), observations: match.observations } : null;
}

beforeAll(async () => {
  const suffix = Date.now();
  const [dealership] = await db
    .insert(dealerships)
    .values({
      name: "__test_event_integrity__",
      slug: `__test-event-integrity-${suffix}`,
      primaryContactName: "Test",
      primaryContactEmail: `event-integrity-${suffix}@example.com`,
      status: "approved",
    })
    .returning({ id: dealerships.id });
  dealershipId = dealership.id;

  const [session] = await db.insert(anonymousSessions).values({}).returning({ id: anonymousSessions.id });
  anonymousSessionId = session.id;
  currentToken = anonymousSessionId;

  const [profile] = await db
    .insert(consumerProfiles)
    .values({ anonymousSessionId })
    .returning({ id: consumerProfiles.id });
  consumerProfileId = profile.id;

  const [rv] = await db
    .insert(inventory)
    .values({
      dealershipId,
      stockNumber: `EVT-${suffix}`,
      year: 2024,
      make: "Forest River",
      model: "Rockwood",
      rvType: "travel_trailer",
      condition: "new",
      salePriceCents: 3500000,
      status: "published",
      source: "manual",
    })
    .returning({ id: inventory.id });
  invId = rv.id;
  const [video] = await db
    .insert(inventoryVideos)
    .values({ inventoryId: invId, url: "/media/videos/evt.mp4", source: "dealer_upload" })
    .returning({ id: inventoryVideos.id });
  await db.update(inventory).set({ primaryVideoId: video.id }).where(eq(inventory.id, invId));
});

afterAll(async () => {
  await db.delete(consumerProfiles).where(eq(consumerProfiles.id, consumerProfileId));
  await db.delete(anonymousSessions).where(eq(anonymousSessions.id, anonymousSessionId));
  await db.delete(dealerships).where(eq(dealerships.id, dealershipId));
});

describe("submitSwipeDecision idempotency", () => {
  it("applies the preference delta and decision count exactly once, even when the identical decision is resubmitted", async () => {
    const first = await submitSwipeDecision({ inventoryId: invId, decision: "love", swipeDurationMs: 800 });
    const scoreAfterFirst = await currentScoreFor("rv_type", "travel_trailer");

    const second = await submitSwipeDecision({ inventoryId: invId, decision: "love", swipeDurationMs: 800 });
    const scoreAfterSecond = await currentScoreFor("rv_type", "travel_trailer");
    const third = await submitSwipeDecision({ inventoryId: invId, decision: "love", swipeDurationMs: 800 });

    expect(second.decisionsCount).toBe(first.decisionsCount); // not counted again
    expect(third.decisionsCount).toBe(first.decisionsCount);
    expect(scoreAfterSecond?.score).toBeCloseTo(scoreAfterFirst!.score, 5); // no additional delta applied
    expect(scoreAfterSecond?.observations).toBe(scoreAfterFirst!.observations);
  });
});

describe("toggleSaveInventory idempotency", () => {
  it("applies the save preference delta only on a genuinely new save, not on repeated save:true calls", async () => {
    await db.delete(savedInventory).where(eq(savedInventory.inventoryId, invId));

    await toggleSaveInventory(invId, true);
    const after1 = await currentScoreFor("rv_type", "travel_trailer");

    await toggleSaveInventory(invId, true); // already saved - should be a no-op for scoring
    const after2 = await currentScoreFor("rv_type", "travel_trailer");

    expect(after2?.observations).toBe(after1!.observations);
    expect(after2?.score).toBeCloseTo(after1!.score, 5);
  });

  it("does apply a fresh delta after a genuine unsave + resave cycle", async () => {
    await toggleSaveInventory(invId, false);
    const afterUnsave = await currentScoreFor("rv_type", "travel_trailer");

    await toggleSaveInventory(invId, true);
    const afterResave = await currentScoreFor("rv_type", "travel_trailer");

    expect(afterResave!.observations).toBe(afterUnsave!.observations + 1);
  });
});

describe("recordClientEvent preference-scoring cooldown", () => {
  it("rate-limits repeated video_replayed preference scoring within the cooldown window", async () => {
    const before = await currentScoreFor("rv_type", "travel_trailer");

    await recordClientEvent("video_replayed", invId);
    const after1 = await currentScoreFor("rv_type", "travel_trailer");
    expect(after1!.observations).toBe((before?.observations ?? 0) + 1);

    // Rapid-fire replays within the cooldown window shouldn't keep adding observations.
    await recordClientEvent("video_replayed", invId);
    await recordClientEvent("video_replayed", invId);
    await recordClientEvent("video_replayed", invId);
    const after2 = await currentScoreFor("rv_type", "travel_trailer");
    expect(after2!.observations).toBe(after1!.observations);
  });
});
