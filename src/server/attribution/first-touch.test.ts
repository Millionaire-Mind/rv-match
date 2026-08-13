import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { anonymousSessions, consumerProfiles, distributionCampaigns } from "@/server/db/schema";
import { getFirstTouchAttribution } from "./first-touch";

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
    set: () => {},
    delete: () => {},
  }),
}));

let campaignId: string;
let anonymousSessionId: string;
let consumerProfileId: string;
let signedUpOnlyProfileId: string;
let signedUpUserId: string;

beforeAll(async () => {
  const { localSignUp } = await import("@/server/auth/local-provider");
  const signedUp = await localSignUp({ email: `first-touch-${Date.now()}@example.com`, password: "TestPassword123!" });
  signedUpUserId = signedUp.userId;

  const [campaign] = await db
    .insert(distributionCampaigns)
    .values({ code: `attr-test-${Date.now()}`, name: "Attribution Test", campaignType: "dealer_general" })
    .returning({ id: distributionCampaigns.id });
  campaignId = campaign.id;

  const [session] = await db
    .insert(anonymousSessions)
    .values({ firstSource: "qr", firstCampaignId: campaignId })
    .returning({ id: anonymousSessions.id });
  anonymousSessionId = session.id;

  const [profile] = await db
    .insert(consumerProfiles)
    .values({ anonymousSessionId })
    .returning({ id: consumerProfiles.id });
  consumerProfileId = profile.id;

  const [signedUpOnly] = await db
    .insert(consumerProfiles)
    .values({ userId: signedUpUserId })
    .returning({ id: consumerProfiles.id });
  signedUpOnlyProfileId = signedUpOnly.id;
});

afterAll(async () => {
  await db.delete(consumerProfiles).where(eq(consumerProfiles.id, consumerProfileId));
  await db.delete(consumerProfiles).where(eq(consumerProfiles.id, signedUpOnlyProfileId));
  await db.delete(anonymousSessions).where(eq(anonymousSessions.id, anonymousSessionId));
  await db.delete(distributionCampaigns).where(eq(distributionCampaigns.id, campaignId));
});

describe("getFirstTouchAttribution", () => {
  it("reads the attribution recorded on the consumer's anonymous session", async () => {
    const result = await getFirstTouchAttribution(consumerProfileId);
    expect(result.firstSource).toBe("qr");
    expect(result.firstCampaignId).toBe(campaignId);
  });

  it("returns no attribution for a profile with no anonymous session history", async () => {
    const result = await getFirstTouchAttribution(signedUpOnlyProfileId);
    expect(result.firstSource).toBeNull();
    expect(result.firstCampaignId).toBeNull();
  });

  it("returns no attribution for a nonexistent consumer profile rather than throwing", async () => {
    const result = await getFirstTouchAttribution(crypto.randomUUID());
    expect(result.firstSource).toBeNull();
    expect(result.firstCampaignId).toBeNull();
  });
});
