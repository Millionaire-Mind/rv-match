import type { Metadata } from "next";

import { listVideoJobs } from "@/server/admin/video-jobs";
import { Badge } from "@/components/ui/badge";
import { VideoJobRetryButton } from "@/components/admin/video-job-retry-button";
import { formatRelativeDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Video Jobs" };
export const dynamic = "force-dynamic";

const statusVariant: Record<string, "secondary" | "accent" | "outline" | "warning" | "destructive"> = {
  queued: "outline",
  processing: "warning",
  completed: "accent",
  failed: "destructive",
};

export default async function AdminVideosPage() {
  const rows = await listVideoJobs();
  const failedCount = rows.filter((r) => r.status === "failed").length;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Video Jobs</h1>
      <p className="text-sm text-muted-foreground">
        {failedCount > 0
          ? `${failedCount} job${failedCount === 1 ? "" : "s"} permanently failed and need attention.`
          : "Failed and stuck jobs are surfaced first."}
      </p>
      {rows.length === 0 ? (
        <p className="text-muted-foreground">No video generation jobs yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[800px] text-sm">
            <thead className="bg-secondary/60 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">RV</th>
                <th className="px-4 py-3">Dealer</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Attempts</th>
                <th className="px-4 py-3">Error</th>
                <th className="px-4 py-3">Updated</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((j) => (
                <tr key={j.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">{j.rvLabel}</td>
                  <td className="px-4 py-3 text-muted-foreground">{j.dealershipName}</td>
                  <td className="px-4 py-3">
                    <Badge variant={statusVariant[j.status]} className="capitalize">
                      {j.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">{j.attempts}</td>
                  <td className="px-4 py-3 max-w-xs truncate text-xs text-muted-foreground" title={j.errorMessage ?? ""}>
                    {j.errorMessage ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatRelativeDate(j.updatedAt)}</td>
                  <td className="px-4 py-3">
                    {j.status === "failed" && (
                      <div className="flex justify-end">
                        <VideoJobRetryButton jobId={j.id} />
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
