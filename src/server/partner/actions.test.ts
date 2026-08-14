import { afterAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { anonymousSessions, consumerProfiles, partnerLinks } from "@/server/db/schema";

/**
 * Phase 9 integration tests: partner-invite creation/reuse, join-flow
 * authorization (owner can't join their own link, a used link can't be
 * joined by a third party, rejoining as the same partner is a harmless
 * no-op), and that raw consumer_profiles ids are only ever exposed to the
 * two actual parties to the link, never to an outsider or a not-yet-joined
 * invitee.
 */

let currentToken: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "rvm_session" && currentToken ? { value: currentToken } : undefined),
    set: () => {},
    delete: () => {},
  }),
}));

const { createOrGetPartnerInviteLink, joinPartnerLink, getPartnerLinkView } = await import("./actions");

const suffix = Date.now();
const anonymousSessionIds: string[] = [];
const consumerProfileIds: string[] = [];

async function newSession(): Promise<{ anonymousSessionId: string; consumerProfileId: string }> {
  const [session] = await db.insert(anonymousSessions).values({}).returning({ id: anonymousSessions.id });
  anonymousSessionIds.push(session.id);
  currentToken = session.id;
  // Force profile creation the same way a real request would (via getOrCreateConsumerProfileId,
  // exercised indirectly by createOrGetPartnerInviteLink below in each test).
  const [profile] = await db
    .insert(consumerProfiles)
    .values({ anonymousSessionId: session.id })
    .returning({ id: consumerProfiles.id });
  consumerProfileIds.push(profile.id);
  return { anonymousSessionId: session.id, consumerProfileId: profile.id };
}

afterAll(async () => {
  for (const id of consumerProfileIds) {
    await db.delete(consumerProfiles).where(eq(consumerProfiles.id, id));
  }
  for (const id of anonymousSessionIds) {
    await db.delete(anonymousSessions).where(eq(anonymousSessions.id, id));
  }
});

describe("createOrGetPartnerInviteLink", () => {
  it("creates a link and reuses the same pending link on a second call", async () => {
    const owner = await newSession();
    currentToken = owner.anonymousSessionId;

    const first = await createOrGetPartnerInviteLink();
    const second = await createOrGetPartnerInviteLink();
    expect(second.token).toBe(first.token);

    const rows = await db.select().from(partnerLinks).where(eq(partnerLinks.token, first.token));
    expect(rows).toHaveLength(1);
    expect(rows[0].ownerConsumerProfileId).toBe(owner.consumerProfileId);
    expect(rows[0].status).toBe("pending");
  });
});

describe("joinPartnerLink authorization", () => {
  it("rejects the owner joining their own link", async () => {
    const owner = await newSession();
    currentToken = owner.anonymousSessionId;
    const { token } = await createOrGetPartnerInviteLink();

    const result = await joinPartnerLink(token);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/own invite/i);
  });

  it("lets a distinct partner join, then rejects a third party reusing the same link", async () => {
    const owner = await newSession();
    currentToken = owner.anonymousSessionId;
    const { token } = await createOrGetPartnerInviteLink();

    const partner = await newSession();
    currentToken = partner.anonymousSessionId;
    const joinResult = await joinPartnerLink(token);
    expect(joinResult.ok).toBe(true);

    const [row] = await db.select().from(partnerLinks).where(eq(partnerLinks.token, token));
    expect(row.status).toBe("joined");
    expect(row.partnerConsumerProfileId).toBe(partner.consumerProfileId);

    const outsider = await newSession();
    currentToken = outsider.anonymousSessionId;
    const outsiderResult = await joinPartnerLink(token);
    expect(outsiderResult.ok).toBe(false);
    expect(outsiderResult.error).toMatch(/already been used/i);
  });

  it("is idempotent when the same partner re-triggers the join", async () => {
    const owner = await newSession();
    currentToken = owner.anonymousSessionId;
    const { token } = await createOrGetPartnerInviteLink();

    const partner = await newSession();
    currentToken = partner.anonymousSessionId;
    await joinPartnerLink(token);
    const second = await joinPartnerLink(token);
    expect(second.ok).toBe(true);
  });
});

describe("getPartnerLinkView", () => {
  it("only exposes raw consumer_profiles ids to the owner and the joined partner, never to an outsider or a pending invitee", async () => {
    const owner = await newSession();
    currentToken = owner.anonymousSessionId;
    const { token } = await createOrGetPartnerInviteLink();

    const invitee = await newSession();
    currentToken = invitee.anonymousSessionId;
    const invieweeView = await getPartnerLinkView(token);
    expect(invieweeView!.viewerRole).toBe("invitee");
    expect(invieweeView!.ownerConsumerProfileId).toBeNull();

    currentToken = owner.anonymousSessionId;
    const ownerViewBeforeJoin = await getPartnerLinkView(token);
    expect(ownerViewBeforeJoin!.viewerRole).toBe("owner");
    expect(ownerViewBeforeJoin!.ownerConsumerProfileId).toBe(owner.consumerProfileId);

    const partner = await newSession();
    currentToken = partner.anonymousSessionId;
    await joinPartnerLink(token);
    const partnerView = await getPartnerLinkView(token);
    expect(partnerView!.viewerRole).toBe("partner");
    expect(partnerView!.partnerConsumerProfileId).toBe(partner.consumerProfileId);
    expect(partnerView!.ownerConsumerProfileId).toBe(owner.consumerProfileId);

    const outsider = await newSession();
    currentToken = outsider.anonymousSessionId;
    const outsiderView = await getPartnerLinkView(token);
    expect(outsiderView!.viewerRole).toBe("outsider");
    expect(outsiderView!.ownerConsumerProfileId).toBeNull();
    expect(outsiderView!.partnerConsumerProfileId).toBeNull();
  });

  it("returns null for a token that doesn't exist", async () => {
    const someone = await newSession();
    currentToken = someone.anonymousSessionId;
    const view = await getPartnerLinkView(`nonexistent-${suffix}`);
    expect(view).toBeNull();
  });

  it("captures 'partner' as first-touch attribution for a brand-new invitee, but never overwrites the owner's own prior attribution", async () => {
    const owner = await newSession();
    currentToken = owner.anonymousSessionId;
    const { token } = await createOrGetPartnerInviteLink();

    const [ownerSessionBefore] = await db
      .select()
      .from(anonymousSessions)
      .where(eq(anonymousSessions.id, owner.anonymousSessionId));
    expect(ownerSessionBefore.firstSource).toBe("direct"); // set by newSession's plain insert, unaffected

    // A brand-new visitor with no anonymous_sessions row yet at all -
    // getPartnerLinkView itself has to create it via getOrCreateConsumerProfileId.
    const freshSessionId = crypto.randomUUID();
    currentToken = freshSessionId;
    anonymousSessionIds.push(freshSessionId);
    const invieweeView = await getPartnerLinkView(token);
    expect(invieweeView!.viewerRole).toBe("invitee");
    if (invieweeView) consumerProfileIds.push((await getOrCreateProfileIdForCleanup(freshSessionId))!);

    const [freshSession] = await db.select().from(anonymousSessions).where(eq(anonymousSessions.id, freshSessionId));
    expect(freshSession.firstSource).toBe("partner");

    // Re-fetching the owner's own link doesn't retroactively relabel them.
    currentToken = owner.anonymousSessionId;
    await getPartnerLinkView(token);
    const [ownerSessionAfter] = await db
      .select()
      .from(anonymousSessions)
      .where(eq(anonymousSessions.id, owner.anonymousSessionId));
    expect(ownerSessionAfter.firstSource).toBe("direct");
  });
});

async function getOrCreateProfileIdForCleanup(anonymousSessionId: string): Promise<string | undefined> {
  const [row] = await db
    .select({ id: consumerProfiles.id })
    .from(consumerProfiles)
    .where(eq(consumerProfiles.anonymousSessionId, anonymousSessionId));
  return row?.id;
}

