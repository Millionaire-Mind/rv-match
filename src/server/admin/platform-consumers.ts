import { count, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/server/db/client";
import { consumerProfiles, leads, profiles, savedInventory } from "@/server/db/schema";

export interface PlatformConsumerRow {
  id: string;
  email: string | null;
  signedUp: boolean;
  zipCode: string | null;
  decisionsCount: number;
  savedCount: number;
  leadsCount: number;
  createdAt: Date;
}

/**
 * The most engaged consumers first (by decisions made), not just the most
 * recent - for platform ops, "who's actually shopping" matters more than
 * "who just showed up." Bounded to `limit` rather than every consumer ever
 * created, most of whom never swipe past the first card.
 */
export async function listConsumers(limit = 100): Promise<PlatformConsumerRow[]> {
  const rows = await db
    .select({
      id: consumerProfiles.id,
      email: profiles.email,
      userId: consumerProfiles.userId,
      zipCode: consumerProfiles.zipCode,
      decisionsCount: consumerProfiles.decisionsCount,
      createdAt: consumerProfiles.createdAt,
    })
    .from(consumerProfiles)
    .leftJoin(profiles, eq(consumerProfiles.userId, profiles.id))
    .orderBy(desc(consumerProfiles.decisionsCount))
    .limit(limit);

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const [savedRows, leadRows] = await Promise.all([
    db
      .select({ consumerProfileId: savedInventory.consumerProfileId, n: count() })
      .from(savedInventory)
      .where(inArray(savedInventory.consumerProfileId, ids))
      .groupBy(savedInventory.consumerProfileId),
    db
      .select({ consumerProfileId: leads.consumerProfileId, n: count() })
      .from(leads)
      .where(inArray(leads.consumerProfileId, ids))
      .groupBy(leads.consumerProfileId),
  ]);
  const savedByConsumer = new Map(savedRows.map((r) => [r.consumerProfileId, r.n]));
  const leadsByConsumer = new Map(leadRows.map((r) => [r.consumerProfileId, r.n]));

  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    signedUp: r.userId !== null,
    zipCode: r.zipCode,
    decisionsCount: r.decisionsCount,
    savedCount: savedByConsumer.get(r.id) ?? 0,
    leadsCount: leadsByConsumer.get(r.id) ?? 0,
    createdAt: r.createdAt,
  }));
}
