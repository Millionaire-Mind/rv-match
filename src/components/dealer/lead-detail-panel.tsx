"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LeadStatusBadge } from "./lead-status-badge";
import { leadStatusValues } from "@/server/validation/enums";
import { updateLeadStatus, addLeadNote, assignLead } from "@/server/dealer/lead-actions";
import { markLeadSold, type MarkSoldState } from "@/server/dealer/lead-actions";
import { formatRelativeDate } from "@/lib/utils";

interface LeadDetailPanelProps {
  dealershipId: string;
  leadId: string;
  currentStatus: (typeof leadStatusValues)[number];
  team: { userId: string; fullName: string | null; email: string }[];
  assignedTo: string | null;
  dealerInventory: { id: string; label: string }[];
  defaultSoldInventoryId: string;
  activity: {
    id: string;
    activityType: string;
    note: string | null;
    fromStatus: string | null;
    toStatus: string | null;
    createdAt: Date;
    actorName: string | null;
  }[];
}

export function LeadDetailPanel({
  dealershipId,
  leadId,
  currentStatus,
  team,
  assignedTo,
  dealerInventory,
  defaultSoldInventoryId,
  activity,
}: LeadDetailPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [showSoldForm, setShowSoldForm] = useState(false);

  function handleStatusChange(status: string) {
    if (status === "sold") {
      setShowSoldForm(true);
      return;
    }
    startTransition(async () => {
      await updateLeadStatus(dealershipId, leadId, status as typeof currentStatus);
      router.refresh();
    });
  }

  function handleAddNote() {
    const trimmed = note.trim();
    if (!trimmed) return;
    setNote("");
    startTransition(async () => {
      await addLeadNote(dealershipId, leadId, trimmed);
      router.refresh();
    });
  }

  function handleAssign(userId: string) {
    startTransition(async () => {
      await assignLead(dealershipId, leadId, userId);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <LeadStatusBadge status={currentStatus} />
        <Select value={currentStatus} onValueChange={handleStatusChange} disabled={pending}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Change status" />
          </SelectTrigger>
          <SelectContent>
            {leadStatusValues.map((s) => (
              <SelectItem key={s} value={s}>
                {s.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={assignedTo ?? undefined} onValueChange={handleAssign} disabled={pending}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Assign salesperson" />
          </SelectTrigger>
          <SelectContent>
            {team.map((t) => (
              <SelectItem key={t.userId} value={t.userId}>
                {t.fullName ?? t.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {showSoldForm && (
        <MarkSoldForm
          dealershipId={dealershipId}
          leadId={leadId}
          dealerInventory={dealerInventory}
          defaultSoldInventoryId={defaultSoldInventoryId}
          onDone={() => {
            setShowSoldForm(false);
            router.refresh();
          }}
        />
      )}

      <div>
        <h3 className="mb-2 font-medium">Activity</h3>
        <div className="space-y-3">
          {activity.map((a) => (
            <div key={a.id} className="rounded-lg border border-border p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium capitalize">{a.activityType.replace(/_/g, " ")}</span>
                <span className="text-xs text-muted-foreground">{formatRelativeDate(a.createdAt)}</span>
              </div>
              {a.fromStatus && a.toStatus && a.fromStatus !== a.toStatus && (
                <p className="text-xs text-muted-foreground">
                  {a.fromStatus} → {a.toStatus}
                </p>
              )}
              {a.note && <p className="mt-1">{a.note}</p>}
              {a.actorName && <p className="mt-1 text-xs text-muted-foreground">by {a.actorName}</p>}
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Textarea
          placeholder="Add a note…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
        />
        <Button variant="outline" size="sm" disabled={pending || !note.trim()} onClick={handleAddNote}>
          Add Note
        </Button>
      </div>
    </div>
  );
}

const initialMarkSoldState: MarkSoldState = { ok: false, error: "" };

function MarkSoldForm({
  dealershipId,
  leadId,
  dealerInventory,
  defaultSoldInventoryId,
  onDone,
}: {
  dealershipId: string;
  leadId: string;
  dealerInventory: { id: string; label: string }[];
  defaultSoldInventoryId: string;
  onDone: () => void;
}) {
  const boundAction = markLeadSold.bind(null, dealershipId, leadId);
  const [state, formAction, pending] = useActionState(boundAction, initialMarkSoldState);

  useEffect(() => {
    if (state.ok) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-accent/40 bg-accent/5 p-4">
      <p className="font-medium">Mark this lead sold</p>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="soldInventoryId">
          RV sold
        </label>
        <Select name="soldInventoryId" defaultValue={defaultSoldInventoryId}>
          <SelectTrigger id="soldInventoryId">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {dealerInventory.map((rv) => (
              <SelectItem key={rv.id} value={rv.id}>
                {rv.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          If they bought a different RV than the one they inquired about, select it here — RV Match
          is still credited as the source.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="saleDate">
            Sale date
          </label>
          <input
            id="saleDate"
            name="saleDate"
            type="date"
            defaultValue={new Date().toISOString().slice(0, 10)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="salePrice">
            Sale price ($, optional)
          </label>
          <input
            id="salePrice"
            name="salePrice"
            type="number"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="notes">
          Notes (optional)
        </label>
        <Textarea id="notes" name="notes" rows={2} />
      </div>
      {!state.ok && state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" variant="accent" disabled={pending}>
        {pending ? "Saving…" : "Confirm Sale"}
      </Button>
    </form>
  );
}
