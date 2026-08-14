import Link from "next/link";
import { Bell } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatRelativeDate } from "@/lib/utils";
import type { NotificationRow } from "@/server/notifications/queries";

/** Shared list UI for both the consumer (/notifications) and dealer (/dealer/notifications) inboxes - the row shape is identical. Read state reflects what was unread *when this page loaded*; the page itself marks everything read right after fetching, so a badge is visible for this one visit and gone on the next. */
export function NotificationList({ notifications }: { notifications: NotificationRow[] }) {
  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Bell className="h-10 w-10 text-muted-foreground" strokeWidth={1.5} />
        <p className="text-muted-foreground">No notifications yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {notifications.map((n) => {
        const content = (
          <div className={`rounded-xl border p-4 ${n.read ? "border-border bg-card" : "border-accent bg-accent/5"}`}>
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium">{n.title}</p>
              {!n.read && <Badge variant="accent">New</Badge>}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>
            <p className="mt-2 text-xs text-muted-foreground">{formatRelativeDate(n.createdAt)}</p>
          </div>
        );
        return n.link ? (
          <Link key={n.id} href={n.link} className="block">
            {content}
          </Link>
        ) : (
          <div key={n.id}>{content}</div>
        );
      })}
    </div>
  );
}
