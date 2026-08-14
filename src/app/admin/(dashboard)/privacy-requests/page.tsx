import type { Metadata } from "next";

import { listDeletionRequests } from "@/server/admin/privacy-requests";
import { Badge } from "@/components/ui/badge";
import { DeletionRequestCompleteButton } from "@/components/admin/deletion-request-complete-button";
import { formatRelativeDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Privacy Requests" };
export const dynamic = "force-dynamic";

export default async function AdminPrivacyRequestsPage() {
  const rows = await listDeletionRequests();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Account Deletion Requests</h1>
      <p className="text-sm text-muted-foreground">
        Marking a request deleted permanently removes that consumer&apos;s profile, swipe history, saved RVs, and
        preferences. Any leads they submitted stay with the dealer they contacted, just detached from this identity.
      </p>
      {rows.length === 0 ? (
        <p className="text-muted-foreground">No deletion requests yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-secondary/60 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Consumer</th>
                <th className="px-4 py-3">Requested</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">
                    {r.consumerProfileId ? r.consumerProfileId.slice(0, 8) : <span className="text-muted-foreground">Already deleted</span>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatRelativeDate(r.requestedAt)}</td>
                  <td className="px-4 py-3">
                    <Badge variant={r.status === "pending" ? "warning" : "accent"} className="capitalize">
                      {r.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {r.status === "pending" && (
                      <div className="flex justify-end">
                        <DeletionRequestCompleteButton requestId={r.id} />
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
