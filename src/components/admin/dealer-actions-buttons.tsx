"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { approveDealer, reactivateDealer, rejectDealer, suspendDealer } from "@/server/admin/dealer-actions";

export function DealerActionButtons({
  dealershipId,
  status,
}: {
  dealershipId: string;
  status: "pending" | "approved" | "suspended" | "rejected";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(action: (id: string) => Promise<void>) {
    startTransition(async () => {
      await action(dealershipId);
      router.refresh();
    });
  }

  if (status === "pending") {
    return (
      <div className="flex gap-2">
        <Button size="sm" variant="accent" disabled={pending} onClick={() => run(approveDealer)}>
          Approve
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(rejectDealer)}>
          Reject
        </Button>
      </div>
    );
  }

  if (status === "approved") {
    return (
      <Button size="sm" variant="outline" disabled={pending} onClick={() => run(suspendDealer)}>
        Suspend
      </Button>
    );
  }

  if (status === "suspended") {
    return (
      <Button size="sm" variant="accent" disabled={pending} onClick={() => run(reactivateDealer)}>
        Reactivate
      </Button>
    );
  }

  return null;
}
