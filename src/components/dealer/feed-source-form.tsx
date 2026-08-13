"use client";

import { useActionState, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createFeedSource, previewFeedSource, type FeedPreviewResult, type FeedSourceFormState } from "@/server/dealer/feed-actions";
import { CANONICAL_FEED_FIELDS } from "@/server/dealer/feed-import/parse";

const initialState: FeedSourceFormState = { ok: false, error: "" };

/**
 * "I Know What I Want"-style single form for both preview and save: the
 * dealer fills in the feed's connection details once, can Preview as many
 * times as they like to check their field mapping before anything is
 * written, then Save when it looks right.
 */
export function FeedSourceForm({ dealershipId }: { dealershipId: string }) {
  const [state, formAction, pending] = useActionState(
    (prev: FeedSourceFormState, formData: FormData) => createFeedSource(dealershipId, prev, formData),
    initialState,
  );
  const [format, setFormat] = useState<"csv" | "json" | "xml">("csv");
  const [previewPending, startPreview] = useTransition();
  const [preview, setPreview] = useState<FeedPreviewResult | null>(null);

  function handlePreview(formData: FormData) {
    setPreview(null);
    startPreview(async () => {
      const result = await previewFeedSource(dealershipId, formData);
      setPreview(result);
    });
  }

  return (
    <form action={formAction} className="max-w-2xl space-y-4 rounded-xl border border-border bg-card p-5">
      <input type="hidden" name="format" value={format} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Feed name</Label>
          <Input id="name" name="name" required placeholder="Manufacturer Inventory Feed" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="format">Format</Label>
          <Select value={format} onValueChange={(v) => setFormat(v as typeof format)}>
            <SelectTrigger id="format">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="csv">CSV</SelectItem>
              <SelectItem value="json">JSON</SelectItem>
              <SelectItem value="xml">XML</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="url">Feed URL</Label>
        <Input id="url" name="url" type="url" required placeholder="https://example.com/inventory.csv" />
      </div>

      {format !== "csv" && (
        <div className="space-y-2">
          <Label htmlFor="recordPath">
            Record path <span className="text-muted-foreground">(where the list of vehicles lives, e.g. &quot;vehicles&quot; or &quot;Inventory.Vehicle&quot;)</span>
          </Label>
          <Input id="recordPath" name="recordPath" placeholder="vehicles" />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="fieldMapping">
          Field mapping (JSON) <span className="text-muted-foreground">- optional if your feed already uses our field names</span>
        </Label>
        <Textarea
          id="fieldMapping"
          name="fieldMapping"
          rows={4}
          placeholder={`{"stock_number": "StockNum", "make": "Manufacturer"}`}
        />
        <p className="text-xs text-muted-foreground">
          Our field names: {CANONICAL_FEED_FIELDS.join(", ")}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="refreshIntervalMinutes">
          Auto-refresh every (minutes) <span className="text-muted-foreground">- leave blank for manual-only</span>
        </Label>
        <Input id="refreshIntervalMinutes" name="refreshIntervalMinutes" type="number" min={5} placeholder="360" />
      </div>

      {!state.ok && state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}

      {preview && (
        <div className="rounded-lg border border-border bg-secondary/50 p-3 text-sm">
          {preview.ok ? (
            <>
              <p className="font-medium">
                {preview.totalRows} row{preview.totalRows === 1 ? "" : "s"} found. First {preview.sample?.length ?? 0} shown:
              </p>
              <ul className="mt-2 space-y-1">
                {preview.sample?.map((row, i) => (
                  <li key={i} className={row.valid ? "text-foreground" : "text-destructive"}>
                    {row.stockNumber ?? "(no stock number)"} — {row.valid ? "valid" : row.errors}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-destructive">{preview.error}</p>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={previewPending}
          onClick={(e) => {
            const form = e.currentTarget.closest("form");
            if (form) handlePreview(new FormData(form));
          }}
        >
          {previewPending ? "Previewing…" : "Preview"}
        </Button>
        <Button type="submit" variant="accent" disabled={pending}>
          {pending ? "Saving…" : "Save Feed Source"}
        </Button>
      </div>
    </form>
  );
}
