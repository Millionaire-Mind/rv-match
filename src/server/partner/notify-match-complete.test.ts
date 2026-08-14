import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { anonymousSessions, consumerProfiles, notifications, partnerLinks } from "@/server/db/schema";
import { notifyPartnerMatchCompleteOnce } from "@/server/partner/notify-match-complete";

let ownerAnonymousSessionId: string;
let partnerAnonymousSessionId: string;
let ownerConsumerProfileId: string;
let partnerConsumerProfileId: string;
let token: string;

beforeAll(async () => {
  const suffix = Date.now();
  const [ownerSession] = await db.insert(anonymousSessions).values({}).returning({ id: anonymousSessions.id });
  ownerAnonymousSessionId = ownerSession.id;
  const [ownerProfile] = await db
    .insert(consumerProfiles)
    .values({ anonymousSessionId: ownerAnonymousSessionId })
    .returning({ id: consumerProfiles.id });
  ownerConsumerProfileId = ownerProfile.id;

  const [partnerSession] = await db.insert(anonymousSessions).values({}).returning({ id: anonymousSessions.id });
  partnerAnonymousSessionId = partnerSession.id;
  const [partnerProfile] = await db
    .insert(consumerProfiles)
    .values({ anonymousSessionId: partnerAnonymousSessionId })
    .returning({ id: consumerProfiles.id });
  partnerConsumerProfileId = partnerProfile.id;

  token = `test-notify-match-${suffix}`;
  await db.insert(partnerLinks).values({
    ownerConsumerProfileId,
    partnerConsumerProfileId,
    token,
    status: "joined",
    joinedAt: new Date(),
  });
});

afterAll(async () => {
  await db.delete(consumerProfiles).where(eq(consumerProfiles.id, ownerConsumerProfileId));
  await db.delete(consumerProfiles).where(eq(consumerProfiles.id, partnerConsumerProfileId));
  await db.delete(anonymousSessions).where(eq(anonymousSessions.id, ownerAnonymousSessionId));
  await db.delete(anonymousSessions).where(eq(anonymousSessions.id, partnerAnonymousSessionId));
});

describe("notifyPartnerMatchCompleteOnce", () => {
  it("notifies both partners the first time and stamps match_notified_at", async () => {
    await notifyPartnerMatchCompleteOnce(token, ownerConsumerProfileId, partnerConsumerProfileId);

    const ownerRows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.consumerProfileId, ownerConsumerProfileId));
    expect(ownerRows).toHaveLength(1);
    expect(ownerRows[0].type).toBe("partner_match_complete");

    const partnerRows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.consumerProfileId, partnerConsumerProfileId));
    expect(partnerRows).toHaveLength(1);

    const [link] = await db.select().from(partnerLinks).where(eq(partnerLinks.token, token)).limit(1);
    expect(link.matchNotifiedAt).not.toBeNull();
  });

  it("does not notify again on a second call for the same link", async () => {
    await notifyPartnerMatchCompleteOnce(token, ownerConsumerProfileId, partnerConsumerProfileId);

    const ownerRows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.consumerProfileId, ownerConsumerProfileId));
    expect(ownerRows).toHaveLength(1); // still just the one from the first call
  });
});
