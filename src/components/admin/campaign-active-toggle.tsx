"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { setCampaignActiveAdmin } from "@/server/admin/platform-campaigns";

export function CampaignActiveToggle({ campaignId, active }: { campaignId: string; active: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      await setCampaignActiveAdmin(campaignId, !active);
      router.refresh();
    });
  }

  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={toggle}>
      {active ? "Deactivate" : "Activate"}
    </Button>
  );
}
