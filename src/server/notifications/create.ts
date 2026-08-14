import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { consumerProfiles, notifications, profiles } from "@/server/db/schema";
import { sendMail } from "@/server/email/mailer";

export interface NotifyParams {
  type: string;
  title: string;
  body: string;
  link?: string;
}

/**
 * Consumer notifications are keyed by consumerProfileId, not an email
 * address - this works for an anonymous returning visitor (their
 * anonymous-session cookie resolves back to the same profile) as much as
 * a signed-in account. Email is a *bonus* channel, sent only when the
 * profile actually resolves to a signed-up user with an email on file;
 * an anonymous shopper still gets the in-app record, silently, with no
 * email attempted (see sendMail's own doc comment - never claim delivery
 * neither this function nor sendMail actually attempted).
 */
export async function notifyConsumer(consumerProfileId: string, params: NotifyParams): Promise<void> {
  await db.insert(notifications).values({
    recipientType: "consumer",
    consumerProfileId,
    type: params.type,
    title: params.title,
    body: params.body,
    link: params.link,
  });

  const [profile] = await db
    .select({ userId: consumerProfiles.userId })
    .from(consumerProfiles)
    .where(eq(consumerProfiles.id, consumerProfileId))
    .limit(1);
  if (!profile?.userId) return;

  const [user] = await db.select({ email: profiles.email }).from(profiles).where(eq(profiles.id, profile.userId)).limit(1);
  if (!user?.email) return;

  await sendMail({ to: user.email, subject: params.title, text: params.body, html: `<p>${params.body}</p>` });
}

/** Dealer team members are always signed in, so email is always attempted. */
export async function notifyDealerUser(
  userId: string,
  dealershipId: string,
  params: NotifyParams,
): Promise<void> {
  await db.insert(notifications).values({
    recipientType: "dealer_user",
    userId,
    dealershipId,
    type: params.type,
    title: params.title,
    body: params.body,
    link: params.link,
  });

  const [user] = await db.select({ email: profiles.email }).from(profiles).where(eq(profiles.id, userId)).limit(1);
  if (!user?.email) return;

  await sendMail({ to: user.email, subject: params.title, text: params.body, html: `<p>${params.body}</p>` });
}
