import { desc, eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { dealerships, inventory, leads } from "@/server/db/schema";

export interface PlatformLeadRow {
  id: string;
  dealershipName: string;
  rvLabel: string;
  name: string;
  ctaType: string;
  status: string;
  intentScore: number | null;
  createdAt: Date;
}

/** Cross-dealer lead visibility for platform ops - most recent first. */
export async function listPlatformLeads(limit = 200): Promise<PlatformLeadRow[]> {
  const rows = await db
    .select({
      id: leads.id,
      dealershipName: dealerships.name,
      year: inventory.year,
      make: inventory.make,
      model: inventory.model,
      name: leads.name,
      ctaType: leads.ctaType,
      status: leads.status,
      intentScore: leads.intentScore,
      createdAt: leads.createdAt,
    })
    .from(leads)
    .innerJoin(dealerships, eq(leads.dealershipId, dealerships.id))
    .innerJoin(inventory, eq(leads.inventoryId, inventory.id))
    .orderBy(desc(leads.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    dealershipName: r.dealershipName,
    rvLabel: `${r.year} ${r.make} ${r.model}`,
    name: r.name,
    ctaType: r.ctaType,
    status: r.status,
    intentScore: r.intentScore !== null ? Number(r.intentScore) : null,
    createdAt: r.createdAt,
  }));
}
