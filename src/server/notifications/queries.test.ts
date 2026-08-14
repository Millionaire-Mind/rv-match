import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { anonymousSessions, consumerProfiles, dealerships, dealershipUsers, notifications } from "@/server/db/schema";

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
    set: () => {},
    delete: () => {},
  }),
}));

const { localSignUp } = await import("@/server/auth/local-provider");
const {
  listConsumerNotifications,
  getConsumerUnreadCount,
  markConsumerNotificationsRead,
  listDealerUserNotifications,
  getDealerUserUnreadCount,
  markDealerUserNotificationsRead,
} = await import("@/server/notifications/queries");

let dealershipId: string;
let anonymousSessionId: string;
let consumerProfileId: string;
let dealerUserId: string;

beforeAll(async () => {
  const suffix = Date.now();
  const [dealership] = await db
    .insert(dealerships)
    .values({
      name: "__test_notify_queries__",
      slug: `__test-notify-queries-${suffix}`,
      primaryContactName: "Test",
      primaryContactEmail: `notify-queries-${suffix}@example.com`,
      status: "approved",
    })
    .returning({ id: dealerships.id });
  dealershipId = dealership.id;

  const [session] = await db.insert(anonymousSessions).values({}).returning({ id: anonymousSessions.id });
  anonymousSessionId = session.id;
  const [profile] = await db
    .insert(consumerProfiles)
    .values({ anonymousSessionId })
    .returning({ id: consumerProfiles.id });
  consumerProfileId = profile.id;

  const dealerUser = await localSignUp({
    email: `notify-queries-dealer-${suffix}@example.com`,
    password: "TestPassword123!",
  });
  dealerUserId = dealerUser.userId;
  await db.insert(dealershipUsers).values({ dealershipId, userId: dealerUserId, role: "owner" });

  await db.insert(notifications).values([
    { recipientType: "consumer", consumerProfileId, type: "a", title: "A", body: "a" },
    { recipientType: "consumer", consumerProfileId, type: "b", title: "B", body: "b" },
    { recipientType: "dealer_user", userId: dealerUserId, dealershipId, type: "c", title: "C", body: "c" },
  ]);
});

afterAll(async () => {
  await db.delete(consumerProfiles).where(eq(consumerProfiles.id, consumerProfileId));
  await db.delete(anonymousSessions).where(eq(anonymousSessions.id, anonymousSessionId));
  await db.delete(dealerships).where(eq(dealerships.id, dealershipId));
});

describe("consumer notification queries", () => {
  it("lists notifications for a consumer, newest first, and counts unread", async () => {
    const before = await getConsumerUnreadCount(consumerProfileId);
    expect(before).toBe(2);

    const list = await listConsumerNotifications(consumerProfileId);
    expect(list).toHaveLength(2);
    expect(list.every((n) => !n.read)).toBe(true);
  });

  it("marks all unread consumer notifications read, and only for that consumer", async () => {
    await markConsumerNotificationsRead(consumerProfileId);
    const after = await getConsumerUnreadCount(consumerProfileId);
    expect(after).toBe(0);

    const list = await listConsumerNotifications(consumerProfileId);
    expect(list.every((n) => n.read)).toBe(true);
  });
});

describe("dealer notification queries", () => {
  it("lists and counts unread notifications scoped to the dealer user", async () => {
    const unread = await getDealerUserUnreadCount(dealerUserId);
    expect(unread).toBe(1);

    const list = await listDealerUserNotifications(dealerUserId);
    expect(list).toHaveLength(1);
    expect(list[0].type).toBe("c");
  });

  it("marks dealer notifications read", async () => {
    await markDealerUserNotificationsRead(dealerUserId);
    const unread = await getDealerUserUnreadCount(dealerUserId);
    expect(unread).toBe(0);
  });
});
