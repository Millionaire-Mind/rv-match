"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { deleteFeedSource, runFeedSourceNow, setFeedSourceActive } from "@/server/dealer/feed-actions";
import { formatRelativeDate } from "@/lib/utils";

export interface FeedSourceRow {
  id: string;
  name: string;
  format: string;
  url: string;
  active: boolean;
  refreshIntervalMinutes: number | null;
  lastRunAt: Date | null;
  lastRunStatus: string | null;
}

export function FeedSourceList({ dealershipId, sources }: { dealershipId: string; sources: FeedSourceRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [runningId, setRunningId] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<{ id: string; summary: string } | null>(null);

  function runNow(id: string) {
    setRunningId(id);
    startTransition(async () => {
      const summary = await runFeedSourceNow(dealershipId, id);
      setRunResult({
        id,
        summary: `${summary.status}: ${summary.rowsCreated} created, ${summary.rowsUpdated} updated, ${summary.rowsWithWarnings} with warnings, ${summary.rowsFailed} failed`,
      });
      setRunningId(null);
      router.refresh();
    });
  }

  function toggleActive(id: string, active: boolean) {
    startTransition(async () => {
      await setFeedSourceActive(dealershipId, id, active);
      router.refresh();
    });
  }

  function remove(id: string) {
    if (!confirm("Delete this feed source? This does not delete any RVs it already imported.")) return;
    startTransition(async () => {
      await deleteFeedSource(dealershipId, id);
      router.refresh();
    });
  }

  if (sources.length === 0) {
    return <p className="text-muted-foreground">No feed sources configured yet.</p>;
  }

  return (
    <div className="space-y-3">
      {sources.map((source) => (
        <div key={source.id} className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-medium">
                {source.name} <Badge variant="outline">{source.format.toUpperCase()}</Badge>
                {!source.active && <Badge variant="secondary">Paused</Badge>}
              </p>
              <p className="truncate text-sm text-muted-foreground">{source.url}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {source.lastRunAt
                  ? `Last ran ${formatRelativeDate(source.lastRunAt)} — ${source.lastRunStatus}`
                  : "Never run"}
                {source.refreshIntervalMinutes ? ` · auto-refreshes every ${source.refreshIntervalMinutes}m` : " · manual only"}
              </p>
              {runResult?.id === source.id && <p className="mt-1 text-xs">{runResult.summary}</p>}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={pending && runningId === source.id} onClick={() => runNow(source.id)}>
                {pending && runningId === source.id ? "Running…" : "Run Now"}
              </Button>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => toggleActive(source.id, !source.active)}>
                {source.active ? "Pause" : "Resume"}
              </Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => remove(source.id)}>
                Delete
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
