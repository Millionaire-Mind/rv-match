"use server";

import { and, eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { partnerLinks } from "@/server/db/schema";
import { getOrCreateConsumerProfileId } from "@/server/auth/anonymous";
import { trackEvent } from "@/server/analytics/track";

export type PartnerLinkStatus = "pending" | "joined";

export interface PartnerLinkView {
  token: string;
  status: PartnerLinkStatus;
  /** How the current viewer relates to this link — drives which screen renders. */
  viewerRole: "owner" | "partner" | "invitee" | "outsider";
  /** Only populated for the owner/partner themselves — never exposed to an outsider or a not-yet-joined invitee. */
  ownerConsumerProfileId: string | null;
  partnerConsumerProfileId: string | null;
}

/**
 * Creates (or reuses) this consumer's pending "Compare With My Partner"
 * invite link. Reused rather than minting a new one on every click so a
 * consumer who navigates away and back doesn't accumulate dead links, and
 * so a link already shared out stays valid.
 */
export async function createOrGetPartnerInviteLink(): Promise<{ token: string }> {
  const consumerProfileId = await getOrCreateConsumerProfileId();

  const [existing] = await db
    .select({ token: partnerLinks.token })
    .from(partnerLinks)
    .where(and(eq(partnerLinks.ownerConsumerProfileId, consumerProfileId), eq(partnerLinks.status, "pending")))
    .limit(1);
  if (existing) return { token: existing.token };

  const token = crypto.randomUUID();
  await db.insert(partnerLinks).values({ ownerConsumerProfileId: consumerProfileId, token });
  await trackEvent({ consumerProfileId, eventType: "partner_invite_created" });

  return { token };
}

async function resolveViewerRole(
  link: { ownerConsumerProfileId: string; partnerConsumerProfileId: string | null; status: string },
  viewerId: string,
): Promise<PartnerLinkView["viewerRole"]> {
  if (viewerId === link.ownerConsumerProfileId) return "owner";
  if (viewerId === link.partnerConsumerProfileId) return "partner";
  if (link.status === "pending") return "invitee";
  return "outsider";
}

export async function getPartnerLinkView(token: string): Promise<PartnerLinkView | null> {
  const [link] = await db.select().from(partnerLinks).where(eq(partnerLinks.token, token)).limit(1);
  if (!link) return null;

  const consumerProfileId = await getOrCreateConsumerProfileId();
  const viewerRole = await resolveViewerRole(link, consumerProfileId);
  const isParty = viewerRole === "owner" || viewerRole === "partner";

  return {
    token: link.token,
    status: link.status as PartnerLinkStatus,
    viewerRole,
    ownerConsumerProfileId: isParty ? link.ownerConsumerProfileId : null,
    partnerConsumerProfileId: isParty ? link.partnerConsumerProfileId : null,
  };
}

/**
 * The invited partner accepts the invite. Uses their own existing (or
 * freshly created) consumer_profiles row — no signup, no merge with the
 * owner's identity, so each side's swipe history and learned preferences
 * stay fully independent. A row lock prevents two simultaneous joins from
 * both succeeding against the same pending link.
 */
export async function joinPartnerLink(token: string): Promise<{ ok: boolean; error?: string }> {
  const consumerProfileId = await getOrCreateConsumerProfileId();

  const result = await db.transaction(async (tx) => {
    const [link] = await tx.select().from(partnerLinks).where(eq(partnerLinks.token, token)).for("update");
    if (!link) return { ok: false as const, error: "This invite link doesn't exist." };

    if (link.ownerConsumerProfileId === consumerProfileId) {
      return { ok: false as const, error: "You can't join your own invite link." };
    }

    if (link.status === "joined") {
      // Already joined by this same partner - idempotent, not an error.
      if (link.partnerConsumerProfileId === consumerProfileId) return { ok: true as const };
      return { ok: false as const, error: "This invite has already been used." };
    }

    await tx
      .update(partnerLinks)
      .set({ partnerConsumerProfileId: consumerProfileId, status: "joined", joinedAt: new Date() })
      .where(eq(partnerLinks.id, link.id));

    return { ok: true as const };
  });

  if (result.ok) {
    await trackEvent({ consumerProfileId, eventType: "partner_joined" });
  }
  return result;
}
