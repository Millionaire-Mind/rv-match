import { desc, eq, gte, type InferSelectModel } from "drizzle-orm";

import { db } from "@/server/db/client";
import { consumerProfiles, inventory } from "@/server/db/schema";
import { scoreOneInventory } from "@/server/recommendation/engine";
import { notifyConsumer } from "./create";

const MIN_DECISIONS_FOR_STRONG_MATCH = 10; // a preference profile worth scoring against
const STRONG_MATCH_FIT_SCORE = 85; // out of 100
const MAX_CANDIDATE_CONSUMERS = 200; // bounds cost - most-recently-active qualifying shoppers, not every profile ever created

/**
 * When a new RV publishes, tells the (bounded) set of recently-active
 * shoppers with a real preference profile whose learned taste it strongly
 * matches. Scoped to recent activity rather than every consumer_profiles
 * row ever created, both to bound cost and because a strong-match
 * notification to someone who hasn't shopped in months isn't useful.
 */
export async function notifyStrongMatchesForInventory(inventoryId: string): Promise<void> {
  const [rv] = await db.select().from(inventory).where(eq(inventory.id, inventoryId)).limit(1);
  if (!rv) return;

  const candidates = await db
    .select({ id: consumerProfiles.id })
    .from(consumerProfiles)
    .where(gte(consumerProfiles.decisionsCount, MIN_DECISIONS_FOR_STRONG_MATCH))
    .orderBy(desc(consumerProfiles.updatedAt))
    .limit(MAX_CANDIDATE_CONSUMERS);

  await Promise.all(
    candidates.map(async ({ id }) => {
      const { fitScore } = await scoreOneInventory(id, rv as InferSelectModel<typeof inventory>);
      if (fitScore < STRONG_MATCH_FIT_SCORE) return;
      await notifyConsumer(id, {
        type: "strong_match",
        title: `A ${fitScore}% match just listed`,
        body: `${rv.year} ${rv.make} ${rv.model} matches what you've been responding to.`,
        link: `/rv/${rv.id}`,
      });
    }),
  );
}
