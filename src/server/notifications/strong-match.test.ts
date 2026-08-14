import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { anonymousSessions, consumerProfiles, dealerships, inventory, notifications } from "@/server/db/schema";

const fitScoreByConsumer = new Map<string, number>();

vi.mock("@/server/recommendation/engine", () => ({
  scoreOneInventory: async (consumerProfileId: string) => ({
    fitScore: fitScoreByConsumer.get(consumerProfileId) ?? 0,
    explanations: [],
    distanceMiles: null,
  }),
}));

const { notifyStrongMatchesForInventory } = await import("@/server/notifications/strong-match");

let dealershipId: string;
let rvId: string;
let strongMatchId: string;
let weakMatchId: string;
let unqualifiedId: string;
const anonymousSessionIds: string[] = [];

async function makeConsumer(decisionsCount: number): Promise<string> {
  const [session] = await db.insert(anonymousSessions).values({}).returning({ id: anonymousSessions.id });
  anonymousSessionIds.push(session.id);
  const [profile] = await db
    .insert(consumerProfiles)
    .values({ anonymousSessionId: session.id, decisionsCount })
    .returning({ id: consumerProfiles.id });
  return profile.id;
}

beforeAll(async () => {
  const suffix = Date.now();
  const [dealership] = await db
    .insert(dealerships)
    .values({
      name: "__test_strong_match__",
      slug: `__test-strong-match-${suffix}`,
      primaryContactName: "Test",
      primaryContactEmail: `strong-match-${suffix}@example.com`,
      status: "approved",
    })
    .returning({ id: dealerships.id });
  dealershipId = dealership.id;

  const [rv] = await db
    .insert(inventory)
    .values({
      dealershipId,
      stockNumber: `STRONG-MATCH-${suffix}`,
      year: 2024,
      make: "Forest River",
      model: "Rockwood",
      rvType: "travel_trailer",
      condition: "new",
      salePriceCents: 4000000,
      status: "published",
      source: "manual",
    })
    .returning({ id: inventory.id });
  rvId = rv.id;

  // A qualifying shopper (>=10 decisions) whose learned taste strongly matches.
  strongMatchId = await makeConsumer(12);
  fitScoreByConsumer.set(strongMatchId, 90);

  // A qualifying shopper whose taste doesn't match strongly enough.
  weakMatchId = await makeConsumer(15);
  fitScoreByConsumer.set(weakMatchId, 50);

  // A shopper with too few decisions for a preference profile worth
  // scoring against, even though their (mocked) fit score would qualify.
  unqualifiedId = await makeConsumer(2);
  fitScoreByConsumer.set(unqualifiedId, 95);
});

afterAll(async () => {
  await db.delete(consumerProfiles).where(eq(consumerProfiles.id, strongMatchId));
  await db.delete(consumerProfiles).where(eq(consumerProfiles.id, weakMatchId));
  await db.delete(consumerProfiles).where(eq(consumerProfiles.id, unqualifiedId));
  for (const id of anonymousSessionIds) {
    await db.delete(anonymousSessions).where(eq(anonymousSessions.id, id));
  }
  await db.delete(dealerships).where(eq(dealerships.id, dealershipId));
});

describe("notifyStrongMatchesForInventory", () => {
  it("notifies only decision-qualified consumers whose fit score clears the strong-match bar", async () => {
    await notifyStrongMatchesForInventory(rvId);

    const strongRows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.consumerProfileId, strongMatchId));
    expect(strongRows).toHaveLength(1);
    expect(strongRows[0].type).toBe("strong_match");
    expect(strongRows[0].link).toBe(`/rv/${rvId}`);

    const weakRows = await db.select().from(notifications).where(eq(notifications.consumerProfileId, weakMatchId));
    expect(weakRows).toHaveLength(0);

    const unqualifiedRows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.consumerProfileId, unqualifiedId));
    expect(unqualifiedRows).toHaveLength(0);
  });

  it("no-ops for an inventory id that doesn't exist", async () => {
    await expect(notifyStrongMatchesForInventory("00000000-0000-0000-0000-000000000000")).resolves.toBeUndefined();
  });
});
