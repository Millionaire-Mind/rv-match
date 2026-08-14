import type { Metadata } from "next";

import { listConsumers } from "@/server/admin/platform-consumers";
import { Badge } from "@/components/ui/badge";
import { formatRelativeDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Consumers" };
export const dynamic = "force-dynamic";

export default async function AdminConsumersPage() {
  const rows = await listConsumers();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Consumers</h1>
      <p className="text-sm text-muted-foreground">
        Most-engaged shoppers first, by swipe decisions made. Includes anonymous sessions that never signed up.
      </p>
      {rows.length === 0 ? (
        <p className="text-muted-foreground">No consumer activity yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-secondary/60 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Consumer</th>
                <th className="px-4 py-3">ZIP</th>
                <th className="px-4 py-3 text-right">Decisions</th>
                <th className="px-4 py-3 text-right">Saved</th>
                <th className="px-4 py-3 text-right">Leads</th>
                <th className="px-4 py-3">First Seen</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">
                    {c.signedUp ? (
                      c.email
                    ) : (
                      <span className="flex items-center gap-2 font-normal text-muted-foreground">
                        <Badge variant="outline">Anonymous</Badge>
                        {c.id.slice(0, 8)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{c.zipCode ?? "—"}</td>
                  <td className="px-4 py-3 text-right">{c.decisionsCount}</td>
                  <td className="px-4 py-3 text-right">{c.savedCount}</td>
                  <td className="px-4 py-3 text-right">{c.leadsCount}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatRelativeDate(c.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
