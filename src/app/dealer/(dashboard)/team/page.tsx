import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireDealerContext } from "@/server/dealer/context";
import { getDealerTeamDetailed } from "@/server/dealer/team-list";
import { DealerTeamTable } from "@/components/dealer/dealer-team-table";
import { InviteTeamMemberForm } from "@/components/dealer/invite-team-member-form";

export const metadata: Metadata = { title: "Team" };

export default async function DealerTeamPage() {
  const { userId, role, dealership } = await requireDealerContext();
  if (role !== "owner") redirect("/dealer");

  const members = await getDealerTeamDetailed(dealership.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Team</h1>
        <p className="text-muted-foreground">
          Manage who has access to {dealership.name} on RV Match, and what they can do.
        </p>
      </div>
      <InviteTeamMemberForm dealershipId={dealership.id} />
      <DealerTeamTable dealershipId={dealership.id} members={members} currentUserId={userId} />
    </div>
  );
}
