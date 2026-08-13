"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createCreator,
  createCreatorCampaign,
  setCreatorActive,
  type CreatorCampaignFormState,
  type CreatorFormState,
} from "@/server/admin/creator-actions";

export interface CreatorRow {
  id: string;
  name: string;
  contactEmail: string | null;
  active: boolean;
}

const createInitial: CreatorFormState = { ok: false, error: "" };
const campaignInitial: CreatorCampaignFormState = { ok: false, error: "" };

export function CreatorManagement({ creators, appUrl }: { creators: CreatorRow[]; appUrl: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [createState, createAction, createPending] = useActionState(createCreator, createInitial);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function toggleActive(id: string, active: boolean) {
    startTransition(async () => {
      await setCreatorActive(id, active);
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        {creators.length === 0 ? (
          <p className="text-muted-foreground">No creators added yet.</p>
        ) : (
          creators.map((c) => (
            <div key={c.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {c.name} {!c.active && <Badge variant="secondary">Inactive</Badge>}
                  </p>
                  {c.contactEmail && <p className="text-sm text-muted-foreground">{c.contactEmail}</p>}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}>
                    {expandedId === c.id ? "Hide links" : "Manage links"}
                  </Button>
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => toggleActive(c.id, !c.active)}>
                    {c.active ? "Deactivate" : "Reactivate"}
                  </Button>
                </div>
              </div>
              {expandedId === c.id && <CreatorCampaignPanel creatorId={c.id} appUrl={appUrl} />}
            </div>
          ))
        )}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Add a creator</h2>
        <form action={createAction} className="max-w-md space-y-3 rounded-xl border border-border bg-card p-5">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contactEmail">Contact email</Label>
            <Input id="contactEmail" name="contactEmail" type="email" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Input id="notes" name="notes" />
          </div>
          {!createState.ok && createState.error && <p className="text-sm text-destructive">{createState.error}</p>}
          <Button type="submit" variant="accent" disabled={createPending}>
            {createPending ? "Adding…" : "Add Creator"}
          </Button>
        </form>
      </div>
    </div>
  );
}

function CreatorCampaignPanel({ creatorId, appUrl }: { creatorId: string; appUrl: string }) {
  const [state, formAction, pending] = useActionState(createCreatorCampaign, campaignInitial);

  return (
    <div className="mt-3 border-t border-border pt-3">
      <form action={formAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="creatorId" value={creatorId} />
        <div className="space-y-1">
          <Label htmlFor={`campaign-name-${creatorId}`}>New link name</Label>
          <Input id={`campaign-name-${creatorId}`} name="name" placeholder="Spring campaign" required />
        </div>
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Creating…" : "Create Link"}
        </Button>
      </form>
      {state.ok && (
        <p className="mt-2 text-sm">
          Link created: <code className="rounded bg-secondary px-1.5 py-0.5">{appUrl}/go/{state.code}</code>
        </p>
      )}
      {!state.ok && state.error && <p className="mt-2 text-sm text-destructive">{state.error}</p>}
    </div>
  );
}
