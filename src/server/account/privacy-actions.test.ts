import { afterAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { accountDeletionRequests, anonymousSessions, consumerProfiles } from "@/server/db/schema";

let currentCookieValue: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "rvm_session" && currentCookieValue ? { value: currentCookieValue } : undefined),
    set: () => {},
    delete: () => {},
  }),
}));

const {
  requestAccountDeletion,
  getPendingDeletionRequest,
  setEmailOptOut,
  getEmailOptOut,
} = await import("./privacy-actions");

const anonymousSessionIds: string[] = [];
const consumerProfileIds: string[] = [];

async function newSession(): Promise<string> {
  const [session] = await db.insert(anonymousSessions).values({}).returning({ id: anonymousSessions.id });
  anonymousSessionIds.push(session.id);
  currentCookieValue = session.id;
  return session.id;
}

afterAll(async () => {
  for (const id of consumerProfileIds) await db.delete(consumerProfiles).where(eq(consumerProfiles.id, id));
  for (const id of anonymousSessionIds) await db.delete(anonymousSessions).where(eq(anonymousSessions.id, id));
});

describe("requestAccountDeletion / getPendingDeletionRequest", () => {
  it("creates a pending request and reports it as pending", async () => {
    await newSession();
    expect(await getPendingDeletionRequest()).toBe(false);

    const result = await requestAccountDeletion();
    expect(result.ok).toBe(true);
    expect(await getPendingDeletionRequest()).toBe(true);

    const [profile] = await db
      .select({ id: consumerProfiles.id })
      .from(consumerProfiles)
      .where(eq(consumerProfiles.anonymousSessionId, currentCookieValue!));
    consumerProfileIds.push(profile.id);

    const rows = await db.select().from(accountDeletionRequests).where(eq(accountDeletionRequests.consumerProfileId, profile.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("pending");
  });

  it("is idempotent - a second request while one is pending doesn't create a duplicate row", async () => {
    await newSession();
    await requestAccountDeletion();
    await requestAccountDeletion();

    const [profile] = await db
      .select({ id: consumerProfiles.id })
      .from(consumerProfiles)
      .where(eq(consumerProfiles.anonymousSessionId, currentCookieValue!));
    consumerProfileIds.push(profile.id);

    const rows = await db.select().from(accountDeletionRequests).where(eq(accountDeletionRequests.consumerProfileId, profile.id));
    expect(rows).toHaveLength(1);
  });
});

describe("setEmailOptOut / getEmailOptOut", () => {
  it("defaults to opted-in and round-trips a toggle", async () => {
    await newSession();
    expect(await getEmailOptOut()).toBe(false);

    await setEmailOptOut(true);
    expect(await getEmailOptOut()).toBe(true);

    await setEmailOptOut(false);
    expect(await getEmailOptOut()).toBe(false);

    const [profile] = await db
      .select({ id: consumerProfiles.id })
      .from(consumerProfiles)
      .where(eq(consumerProfiles.anonymousSessionId, currentCookieValue!));
    consumerProfileIds.push(profile.id);
  });
});
