"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { dealerRoleLabels, dealerRoleValues, type DealerRole } from "@/server/validation/enums";
import { setDealerUserActive, updateDealerUserRole } from "@/server/dealer/team-actions";
import type { DealerTeamMember } from "@/server/dealer/team-list";

export function DealerTeamTable({
  dealershipId,
  members,
  currentUserId,
}: {
  dealershipId: string;
  members: DealerTeamMember[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function changeRole(membershipId: string, role: DealerRole) {
    setError(null);
    startTransition(async () => {
      const result = await updateDealerUserRole(dealershipId, membershipId, role);
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }

  function toggleActive(membershipId: string, active: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await setDealerUserActive(dealershipId, membershipId, active);
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-secondary/60 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Active</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.membershipId} className="border-t border-border">
                <td className="px-4 py-3 font-medium">
                  {member.fullName ?? "—"}
                  {member.userId === currentUserId && (
                    <Badge variant="secondary" className="ml-2">
                      You
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{member.email}</td>
                <td className="px-4 py-3">
                  <Select
                    value={member.role}
                    disabled={pending}
                    onValueChange={(value) => changeRole(member.membershipId, value as DealerRole)}
                  >
                    <SelectTrigger className="h-8 w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {dealerRoleValues.map((role) => (
                        <SelectItem key={role} value={role}>
                          {dealerRoleLabels[role]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-4 py-3">
                  <Switch
                    checked={member.active}
                    disabled={pending}
                    onCheckedChange={(checked) => toggleActive(member.membershipId, checked)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
