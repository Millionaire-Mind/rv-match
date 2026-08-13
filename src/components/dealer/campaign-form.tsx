"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createDealerCampaign, type CampaignFormState } from "@/server/dealer/campaign-actions";

const initialState: CampaignFormState = { ok: false, error: "" };

export function CampaignForm({
  dealershipId,
  inventoryOptions,
}: {
  dealershipId: string;
  inventoryOptions: { id: string; label: string }[];
}) {
  const [state, formAction, pending] = useActionState(
    (prev: CampaignFormState, formData: FormData) => createDealerCampaign(dealershipId, prev, formData),
    initialState,
  );

  return (
    <form action={formAction} className="max-w-lg space-y-4 rounded-xl border border-border bg-card p-5">
      <div className="space-y-2">
        <Label htmlFor="name">Link name</Label>
        <Input id="name" name="name" required placeholder="Front lot QR code" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="inventoryId">Point at a specific RV (optional)</Label>
        <Select name="inventoryId" defaultValue="__none__">
          <SelectTrigger id="inventoryId">
            <SelectValue placeholder="No — send scanners to your full inventory" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">No — send scanners to your full inventory</SelectItem>
            {inventoryOptions.map((rv) => (
              <SelectItem key={rv.id} value={rv.id}>
                {rv.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {!state.ok && state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" variant="accent" disabled={pending}>
        {pending ? "Creating…" : "Create Link / QR Code"}
      </Button>
    </form>
  );
}
