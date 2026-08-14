import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { anonymousSessions, consumerProfiles, dealerships, dealershipUsers, notifications } from "@/server/db/schema";

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
    set: () => {},
    delete: () => {},
  }),
}));

const sendMailMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/server/email/mailer", () => ({
  sendMail: (...args: unknown[]) => sendMailMock(...args),
}));

const { localSignUp } = await import("@/server/auth/local-provider");
const { notifyConsumer, notifyDealerUser } = await import("@/server/notifications/create");

let dealershipId: string;
let anonymousSessionId: string;
let anonProfileId: string;
let signedUpEmail: string;
let signedUpProfileId: string;
let dealerUserId: string;
let dealerEmail: string;

beforeAll(async () => {
  const suffix = Date.now();
  const [dealership] = await db
    .insert(dealerships)
    .values({
      name: "__test_notify_create__",
      slug: `__test-notify-create-${suffix}`,
      primaryContactName: "Test",
      primaryContactEmail: `notify-create-${suffix}@example.com`,
      status: "approved",
    })
    .returning({ id: dealerships.id });
  dealershipId = dealership.id;

  const [session] = await db.insert(anonymousSessions).values({}).returning({ id: anonymousSessions.id });
  anonymousSessionId = session.id;
  const [anonProfile] = await db
    .insert(consumerProfiles)
    .values({ anonymousSessionId })
    .returning({ id: consumerProfiles.id });
  anonProfileId = anonProfile.id;

  signedUpEmail = `notify-create-consumer-${suffix}@example.com`;
  const signedUpUser = await localSignUp({ email: signedUpEmail, password: "TestPassword123!" });
  const [signedUpProfile] = await db
    .insert(consumerProfiles)
    .values({ userId: signedUpUser.userId })
    .returning({ id: consumerProfiles.id });
  signedUpProfileId = signedUpProfile.id;

  dealerEmail = `notify-create-dealer-${suffix}@example.com`;
  const dealerUser = await localSignUp({ email: dealerEmail, password: "TestPassword123!" });
  dealerUserId = dealerUser.userId;
  await db.insert(dealershipUsers).values({ dealershipId, userId: dealerUserId, role: "owner" });
});

afterAll(async () => {
  await db.delete(notifications).where(eq(notifications.consumerProfileId, anonProfileId));
  await db.delete(notifications).where(eq(notifications.consumerProfileId, signedUpProfileId));
  await db.delete(notifications).where(eq(notifications.userId, dealerUserId));
  await db.delete(consumerProfiles).where(eq(consumerProfiles.id, anonProfileId));
  await db.delete(consumerProfiles).where(eq(consumerProfiles.id, signedUpProfileId));
  await db.delete(anonymousSessions).where(eq(anonymousSessions.id, anonymousSessionId));
  await db.delete(dealerships).where(eq(dealerships.id, dealershipId));
});

beforeEach(() => {
  sendMailMock.mockClear();
});

describe("notifyConsumer", () => {
  it("writes an in-app notification row for an anonymous shopper without attempting email", async () => {
    await notifyConsumer(anonProfileId, { type: "test_type", title: "Hello", body: "Body text", link: "/rv/123" });

    const rows = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.consumerProfileId, anonProfileId), eq(notifications.type, "test_type")));
    expect(rows).toHaveLength(1);
    expect(rows[0].read).toBe(false);
    expect(rows[0].link).toBe("/rv/123");

    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("also emails a signed-up consumer whose profile resolves to a real email", async () => {
    await notifyConsumer(signedUpProfileId, { type: "test_type", title: "Price drop", body: "It dropped." });

    const rows = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.consumerProfileId, signedUpProfileId), eq(notifications.type, "test_type")));
    expect(rows).toHaveLength(1);

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: signedUpEmail, subject: "Price drop" }),
    );
  });
});

describe("notifyDealerUser", () => {
  it("writes a dealer-scoped notification row and always attempts email", async () => {
    await notifyDealerUser(dealerUserId, dealershipId, { type: "new_lead", title: "New lead", body: "You got a lead." });

    const rows = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, dealerUserId), eq(notifications.type, "new_lead")));
    expect(rows).toHaveLength(1);
    expect(rows[0].dealershipId).toBe(dealershipId);

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock).toHaveBeenCalledWith(expect.objectContaining({ to: dealerEmail, subject: "New lead" }));
  });
});
