"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { dealerRoleDescriptions, dealerRoleLabels, dealerRoleValues, type DealerRole } from "@/server/validation/enums";
import { inviteDealerUser, type TeamActionState } from "@/server/dealer/team-actions";

export function InviteTeamMemberForm({ dealershipId }: { dealershipId: string }) {
  const [role, setRole] = useState<DealerRole>("salesperson");
  const [state, formAction, pending] = useActionState<TeamActionState, FormData>(
    (_prev, formData) => inviteDealerUser(dealershipId, formData),
    { ok: false, error: "" },
  );

  return (
    <form action={formAction} className="space-y-4 rounded-xl border border-border bg-card p-6">
      <div>
        <h2 className="text-base font-semibold">Add a team member</h2>
        <p className="text-sm text-muted-foreground">
          If they already have an RV Match account, they&apos;re added directly. Otherwise we create one
          and email them a temporary password.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="fullName">Full name</Label>
          <Input id="fullName" name="fullName" required />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required />
        </div>
      </div>
      <div>
        <Label htmlFor="role">Role</Label>
        <input type="hidden" name="role" value={role} />
        <Select value={role} onValueChange={(value) => setRole(value as DealerRole)}>
          <SelectTrigger id="role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {dealerRoleValues.map((r) => (
              <SelectItem key={r} value={r}>
                {dealerRoleLabels[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="mt-1 text-xs text-muted-foreground">{dealerRoleDescriptions[role]}</p>
      </div>
      {state.ok === false && state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add team member"}
      </Button>
    </form>
  );
}
