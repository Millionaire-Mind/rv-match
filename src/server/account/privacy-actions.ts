"use server";

import { and, eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { accountDeletionRequests, consumerProfiles } from "@/server/db/schema";
import { getOrCreateConsumerProfileId } from "@/server/auth/anonymous";

export type DeletionRequestState = { ok: false; error: string } | { ok: true };

/**
 * Records a shopper's request to have their account/data deleted. Not
 * instant self-service - see accountDeletionRequests's doc comment in
 * schema.ts for why - an admin actions it via
 * src/server/admin/privacy-requests.ts.
 */
export async function requestAccountDeletion(): Promise<DeletionRequestState> {
  const consumerProfileId = await getOrCreateConsumerProfileId();

  const [existing] = await db
    .select({ id: accountDeletionRequests.id })
    .from(accountDeletionRequests)
    .where(and(eq(accountDeletionRequests.consumerProfileId, consumerProfileId), eq(accountDeletionRequests.status, "pending")))
    .limit(1);
  if (existing) return { ok: true }; // already pending - idempotent, not an error

  await db.insert(accountDeletionRequests).values({ consumerProfileId });
  return { ok: true };
}

export async function getPendingDeletionRequest(): Promise<boolean> {
  const consumerProfileId = await getOrCreateConsumerProfileId();
  const [existing] = await db
    .select({ id: accountDeletionRequests.id })
    .from(accountDeletionRequests)
    .where(and(eq(accountDeletionRequests.consumerProfileId, consumerProfileId), eq(accountDeletionRequests.status, "pending")))
    .limit(1);
  return Boolean(existing);
}

export async function setEmailOptOut(optOut: boolean): Promise<void> {
  const consumerProfileId = await getOrCreateConsumerProfileId();
  await db.update(consumerProfiles).set({ emailOptOut: optOut }).where(eq(consumerProfiles.id, consumerProfileId));
}

export async function getEmailOptOut(): Promise<boolean> {
  const consumerProfileId = await getOrCreateConsumerProfileId();
  const [row] = await db
    .select({ emailOptOut: consumerProfiles.emailOptOut })
    .from(consumerProfiles)
    .where(eq(consumerProfiles.id, consumerProfileId))
    .limit(1);
  return row?.emailOptOut ?? false;
}
