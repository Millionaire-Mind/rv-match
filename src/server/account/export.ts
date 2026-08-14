import { desc, eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import {
  consumerProfiles,
  dealerships,
  inventory,
  leads,
  notifications,
  savedInventory,
  swipeDecisions,
} from "@/server/db/schema";

/**
 * Everything this platform holds tied to a single consumer identity, in
 * one document - the self-service side of the data-export right (the
 * deletion side is request-based; see src/server/account/privacy-actions.ts
 * for why the two aren't symmetric). Deliberately excludes other
 * consumers' data and a dealer's own internal notes - only what belongs to
 * *this* identity.
 */
export async function exportConsumerData(consumerProfileId: string): Promise<Record<string, unknown>> {
  const [profile] = await db.select().from(consumerProfiles).where(eq(consumerProfiles.id, consumerProfileId)).limit(1);

  const [decisions, saved, submittedLeads, notificationRows] = await Promise.all([
    db
      .select({
        decision: swipeDecisions.decision,
        year: inventory.year,
        make: inventory.make,
        model: inventory.model,
        createdAt: swipeDecisions.createdAt,
      })
      .from(swipeDecisions)
      .innerJoin(inventory, eq(swipeDecisions.inventoryId, inventory.id))
      .where(eq(swipeDecisions.consumerProfileId, consumerProfileId))
      .orderBy(desc(swipeDecisions.createdAt)),
    db
      .select({
        year: inventory.year,
        make: inventory.make,
        model: inventory.model,
        savedAt: savedInventory.createdAt,
      })
      .from(savedInventory)
      .innerJoin(inventory, eq(savedInventory.inventoryId, inventory.id))
      .where(eq(savedInventory.consumerProfileId, consumerProfileId))
      .orderBy(desc(savedInventory.createdAt)),
    db
      .select({
        dealershipName: dealerships.name,
        year: inventory.year,
        make: inventory.make,
        model: inventory.model,
        ctaType: leads.ctaType,
        name: leads.name,
        email: leads.email,
        phone: leads.phone,
        message: leads.message,
        status: leads.status,
        createdAt: leads.createdAt,
      })
      .from(leads)
      .innerJoin(dealerships, eq(leads.dealershipId, dealerships.id))
      .innerJoin(inventory, eq(leads.inventoryId, inventory.id))
      .where(eq(leads.consumerProfileId, consumerProfileId))
      .orderBy(desc(leads.createdAt)),
    db
      .select({ type: notifications.type, title: notifications.title, body: notifications.body, createdAt: notifications.createdAt })
      .from(notifications)
      .where(eq(notifications.consumerProfileId, consumerProfileId))
      .orderBy(desc(notifications.createdAt)),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    profile: profile
      ? {
          id: profile.id,
          signedUp: profile.userId !== null,
          zipCode: profile.zipCode,
          radiusMiles: profile.radiusMiles,
          decisionsCount: profile.decisionsCount,
          emailOptOut: profile.emailOptOut,
          createdAt: profile.createdAt,
        }
      : null,
    swipeDecisions: decisions,
    savedRvs: saved,
    leadsSubmitted: submittedLeads,
    notifications: notificationRows,
  };
}
