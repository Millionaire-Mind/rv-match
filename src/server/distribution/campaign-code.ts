import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { distributionCampaigns } from "@/server/db/schema";

/** URL-safe, short, and collision-checked - not a UUID, since this appears in a public QR/link URL a shopper types or scans. Shared by dealer-created and admin/creator-created campaigns alike. */
export async function generateUniqueCampaignCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = Math.random().toString(36).slice(2, 8);
    const [existing] = await db
      .select({ id: distributionCampaigns.id })
      .from(distributionCampaigns)
      .where(eq(distributionCampaigns.code, code))
      .limit(1);
    if (!existing) return code;
  }
  throw new Error("Could not generate a unique campaign code. Please try again.");
}
