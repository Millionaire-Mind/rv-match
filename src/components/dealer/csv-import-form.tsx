"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { importInventoryCsv, type CsvImportReport } from "@/server/dealer/csv-import";

export function CsvImportForm({ dealershipId }: { dealershipId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [report, setReport] = useState<CsvImportReport | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = inputRef.current?.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    startTransition(async () => {
      const result = await importInventoryCsv(dealershipId, formData);
      setReport(result);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          required
          className="text-sm"
        />
        <Button type="submit" variant="accent" disabled={pending}>
          {pending ? "Importing…" : "Import"}
        </Button>
      </form>

      {report && (
        <div className="space-y-3">
          <div className="flex gap-4 text-sm">
            <span className="text-muted-foreground">{report.totalRows} rows</span>
            <span className="text-success">{report.created} created</span>
            <span className="text-accent">{report.updated} updated</span>
            <span className="text-destructive">{report.errors} errors</span>
          </div>
          {report.rows.length > 0 && (
            <div className="max-h-80 overflow-y-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-secondary/60 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Row</th>
                    <th className="px-3 py-2">Stock #</th>
                    <th className="px-3 py-2">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((r) => (
                    <tr key={r.row} className="border-t border-border">
                      <td className="px-3 py-2">{r.row}</td>
                      <td className="px-3 py-2">{r.stockNumber ?? "—"}</td>
                      <td className="px-3 py-2">
                        {r.status === "error" ? (
                          <span className="flex items-center gap-1 text-destructive">
                            <XCircle className="h-3.5 w-3.5" /> {r.message}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-success capitalize">
                            <CheckCircle2 className="h-3.5 w-3.5" /> {r.status}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
