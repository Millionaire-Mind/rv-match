import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { getOrCreateConsumerProfileId } from "@/server/auth/anonymous";
import { listConsumerNotifications, markConsumerNotificationsRead } from "@/server/notifications/queries";
import { NotificationList } from "@/components/notifications/notification-list";

export const metadata: Metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const consumerProfileId = await getOrCreateConsumerProfileId();
  const notifications = await listConsumerNotifications(consumerProfileId);
  await markConsumerNotificationsRead(consumerProfileId);

  return (
    <main className="min-h-dvh bg-background px-4 py-4 sm:px-8">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/discover"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary"
          aria-label="Back to discovery"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-semibold">Notifications</h1>
      </div>
      <NotificationList notifications={notifications} />
    </main>
  );
}
