import type { Metadata } from "next";

import { listPlatformUsers } from "@/server/admin/platform-users";
import { Badge } from "@/components/ui/badge";
import { formatRelativeDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Users" };
export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const rows = await listPlatformUsers();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Users</h1>
      <p className="text-sm text-muted-foreground">
        Every account on the platform - admins, dealer team members, and signed-up consumers.
      </p>
      {rows.length === 0 ? (
        <p className="text-muted-foreground">No accounts yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-secondary/60 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Platform Role</th>
                <th className="px-4 py-3">Dealerships</th>
                <th className="px-4 py-3">Joined</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">
                    {u.email}
                    {u.fullName && <p className="text-xs text-muted-foreground">{u.fullName}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={u.platformRole === "platform_admin" ? "accent" : "secondary"} className="capitalize">
                      {u.platformRole.replace(/_/g, " ")}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {u.dealerships.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {u.dealerships.map((d) => (
                          <Badge key={d.dealershipId} variant={d.active ? "outline" : "warning"} className="capitalize">
                            {d.dealershipName} · {d.role.replace(/_/g, " ")}
                            {!d.active && " (inactive)"}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatRelativeDate(u.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
