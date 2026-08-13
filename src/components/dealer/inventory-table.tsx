"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { setInventoryStatus } from "@/server/dealer/inventory-actions";

interface Row {
  id: string;
  year: number;
  make: string;
  model: string;
  stockNumber: string;
  status: "draft" | "published" | "sold" | "archived";
  salePriceCents: number;
  hasVideo: boolean;
  latestJobStatus: "queued" | "processing" | "completed" | "failed" | null;
}

const statusVariant: Record<Row["status"], "secondary" | "accent" | "outline" | "warning"> = {
  draft: "secondary",
  published: "accent",
  sold: "outline",
  archived: "outline",
};

export function InventoryTable({ dealershipId, rows }: { dealershipId: string; rows: Row[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function changeStatus(id: string, status: Row["status"]) {
    setError(null);
    startTransition(async () => {
      const result = await setInventoryStatus(dealershipId, id, status);
      if (!result.ok && result.error) setError(result.error);
      router.refresh();
    });
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
        No inventory yet. Add your first RV or import a CSV to get started.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-secondary/60 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-3">RV</th>
            <th className="px-4 py-3">Stock #</th>
            <th className="px-4 py-3">Price</th>
            <th className="px-4 py-3">Video</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((rv) => (
            <tr key={rv.id} className="border-t border-border">
              <td className="px-4 py-3 font-medium">
                <Link href={`/dealer/inventory/${rv.id}`} className="hover:text-accent">
                  {rv.year} {rv.make} {rv.model}
                </Link>
              </td>
              <td className="px-4 py-3 text-muted-foreground">{rv.stockNumber}</td>
              <td className="px-4 py-3">{formatCurrency(rv.salePriceCents)}</td>
              <td className="px-4 py-3">
                {rv.hasVideo ? (
                  <Badge variant="accent">Live</Badge>
                ) : rv.latestJobStatus === "processing" || rv.latestJobStatus === "queued" ? (
                  <Badge variant="secondary">Processing</Badge>
                ) : rv.latestJobStatus === "failed" ? (
                  <Badge variant="warning">Failed</Badge>
                ) : (
                  <Badge variant="outline">None</Badge>
                )}
              </td>
              <td className="px-4 py-3">
                <Badge variant={statusVariant[rv.status]} className="capitalize">
                  {rv.status}
                </Badge>
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/dealer/inventory/${rv.id}`}>Edit</Link>
                  </Button>
                  {rv.status === "draft" && (
                    <Button
                      size="sm"
                      variant="accent"
                      disabled={pending || !rv.hasVideo}
                      title={rv.hasVideo ? undefined : "This RV needs a video before it can be published."}
                      onClick={() => changeStatus(rv.id, "published")}
                    >
                      Publish
                    </Button>
                  )}
                  {rv.status === "published" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => changeStatus(rv.id, "draft")}
                    >
                      Unpublish
                    </Button>
                  )}
                  {rv.status !== "sold" && rv.status !== "archived" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => changeStatus(rv.id, "sold")}
                    >
                      Mark Sold
                    </Button>
                  )}
                  {rv.status !== "archived" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => changeStatus(rv.id, "archived")}
                    >
                      Archive
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
