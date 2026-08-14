import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/server/db/client";
import { partnerLinks } from "@/server/db/schema";
import { notifyConsumer } from "@/server/notifications/create";

/**
 * Fires the partner-match-complete notification exactly once per link, the
 * first time both partners cross the match-complete threshold - not on
 * every subsequent visit to the now-ready shared match page. The
 * conditional UPDATE ... WHERE match_notified_at IS NULL is the actual
 * guard (same idempotent-conditional-update pattern as verifySale in
 * src/server/admin/sale-actions.ts): if two requests race (both partners
 * loading the page at the same moment), only the one that wins the update
 * sends notifications.
 */
export async function notifyPartnerMatchCompleteOnce(
  token: string,
  ownerConsumerProfileId: string,
  partnerConsumerProfileId: string,
): Promise<void> {
  const [updated] = await db
    .update(partnerLinks)
    .set({ matchNotifiedAt: new Date() })
    .where(and(eq(partnerLinks.token, token), isNull(partnerLinks.matchNotifiedAt)))
    .returning({ id: partnerLinks.id });

  if (!updated) return; // already notified

  await Promise.all(
    [ownerConsumerProfileId, partnerConsumerProfileId].map((consumerProfileId) =>
      notifyConsumer(consumerProfileId, {
        type: "partner_match_complete",
        title: "Your Shared RV Match is ready",
        body: "You and your partner have both swiped enough - see the RVs you both matched on.",
        link: `/partner/${token}`,
      }),
    ),
  );
}
