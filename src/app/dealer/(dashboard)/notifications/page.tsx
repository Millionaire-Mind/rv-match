import type { Metadata } from "next";

import { requireUser } from "@/server/auth/guards";
import { listDealerUserNotifications, markDealerUserNotificationsRead } from "@/server/notifications/queries";
import { NotificationList } from "@/components/notifications/notification-list";

export const metadata: Metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

export default async function DealerNotificationsPage() {
  const userId = await requireUser();
  const notifications = await listDealerUserNotifications(userId);
  await markDealerUserNotificationsRead(userId);

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Notifications</h1>
      <NotificationList notifications={notifications} />
    </div>
  );
}
