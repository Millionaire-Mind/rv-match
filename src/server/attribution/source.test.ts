import { describe, expect, it } from "vitest";

import { classifyCampaignSource, classifyOrganicSource } from "./source";

describe("classifyOrganicSource", () => {
  it("classifies utm_medium=social as social", () => {
    expect(classifyOrganicSource({ utmMedium: "social", utmSource: "facebook" })).toBe("social");
  });

  it("classifies a known social referrer with no UTM as social", () => {
    expect(classifyOrganicSource({ referrerHost: "www.instagram.com" })).toBe("social");
  });

  it("classifies utm_medium=referral as referral", () => {
    expect(classifyOrganicSource({ utmMedium: "referral", utmSource: "rvforums.com" })).toBe("referral");
  });

  it("classifies any other UTM-tagged visit as campaign", () => {
    expect(classifyOrganicSource({ utmSource: "newsletter", utmMedium: "email" })).toBe("campaign");
  });

  it("classifies a search-engine referrer with no UTM as organic", () => {
    expect(classifyOrganicSource({ referrerHost: "www.google.com" })).toBe("organic");
  });

  it("classifies a third-party referrer with no UTM as referral", () => {
    expect(classifyOrganicSource({ referrerHost: "someblog.example", appHost: "rvmatch.app" })).toBe("referral");
  });

  it("classifies no UTM and no referrer as direct", () => {
    expect(classifyOrganicSource({})).toBe("direct");
  });

  it("classifies a same-host referrer (internal navigation) as direct, not referral", () => {
    expect(classifyOrganicSource({ referrerHost: "rvmatch.app", appHost: "rvmatch.app" })).toBe("direct");
  });
});

describe("classifyCampaignSource", () => {
  it("classifies a creator-attributed campaign as creator", () => {
    expect(
      classifyCampaignSource({ campaignType: "creator", creatorId: "c1", salespersonUserId: null }),
    ).toBe("creator");
  });

  it("classifies a salesperson-attributed campaign as salesperson", () => {
    expect(
      classifyCampaignSource({ campaignType: "salesperson", creatorId: null, salespersonUserId: "u1" }),
    ).toBe("salesperson");
  });

  it("classifies a per-RV QR campaign as qr", () => {
    expect(
      classifyCampaignSource({ campaignType: "dealer_inventory", creatorId: null, salespersonUserId: null }),
    ).toBe("qr");
  });

  it("classifies a general dealer campaign as dealer", () => {
    expect(
      classifyCampaignSource({ campaignType: "dealer_general", creatorId: null, salespersonUserId: null }),
    ).toBe("dealer");
  });

  it("creator takes precedence over a coincidentally-set salesperson id", () => {
    expect(
      classifyCampaignSource({ campaignType: "creator", creatorId: "c1", salespersonUserId: "u1" }),
    ).toBe("creator");
  });
});
