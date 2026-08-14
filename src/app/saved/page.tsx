import type { Metadata } from "next";
import Link from "next/link";
import { Bell, ChevronLeft } from "lucide-react";

import { getSavedInventory } from "@/server/inventory/saved";
import { SavedGrid } from "@/components/saved/saved-grid";
import { Badge } from "@/components/ui/badge";
import { getOrCreateConsumerProfileId } from "@/server/auth/anonymous";
import { getConsumerUnreadCount } from "@/server/notifications/queries";

export const metadata: Metadata = { title: "Saved RVs" };
export const dynamic = "force-dynamic";

export default async function SavedPage() {
  const consumerProfileId = await getOrCreateConsumerProfileId();
  const [items, unreadCount] = await Promise.all([
    getSavedInventory(),
    getConsumerUnreadCount(consumerProfileId),
  ]);

  return (
    <main className="min-h-dvh bg-background px-4 py-4 sm:px-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/discover"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary"
            aria-label="Back to discovery"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-xl font-semibold">Saved RVs</h1>
        </div>
        <Link
          href="/notifications"
          className="relative flex h-9 w-9 items-center justify-center rounded-full bg-secondary"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge variant="accent" className="absolute -right-1 -top-1 h-5 min-w-5 justify-center px-1 text-xs">
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Link>
      </div>
      <SavedGrid initialItems={items} />
    </main>
  );
}
