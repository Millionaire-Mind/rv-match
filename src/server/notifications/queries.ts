import { and, count, desc, eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { notifications } from "@/server/db/schema";

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: Date;
}

export async function listConsumerNotifications(consumerProfileId: string, limit = 30): Promise<NotificationRow[]> {
  return db
    .select({
      id: notifications.id,
      type: notifications.type,
      title: notifications.title,
      body: notifications.body,
      link: notifications.link,
      read: notifications.read,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(eq(notifications.consumerProfileId, consumerProfileId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function getConsumerUnreadCount(consumerProfileId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.consumerProfileId, consumerProfileId), eq(notifications.read, false)));
  return row?.n ?? 0;
}

export async function markConsumerNotificationsRead(consumerProfileId: string): Promise<void> {
  await db
    .update(notifications)
    .set({ read: true })
    .where(and(eq(notifications.consumerProfileId, consumerProfileId), eq(notifications.read, false)));
}

export async function listDealerUserNotifications(userId: string, limit = 30): Promise<NotificationRow[]> {
  return db
    .select({
      id: notifications.id,
      type: notifications.type,
      title: notifications.title,
      body: notifications.body,
      link: notifications.link,
      read: notifications.read,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function getDealerUserUnreadCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.read, false)));
  return row?.n ?? 0;
}

export async function markDealerUserNotificationsRead(userId: string): Promise<void> {
  await db
    .update(notifications)
    .set({ read: true })
    .where(and(eq(notifications.userId, userId), eq(notifications.read, false)));
}
