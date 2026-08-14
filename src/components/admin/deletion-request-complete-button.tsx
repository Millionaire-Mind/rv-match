"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { completeAccountDeletion } from "@/server/admin/privacy-requests";

export function DeletionRequestCompleteButton({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      await completeAccountDeletion(requestId);
      router.refresh();
    });
  }

  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={run}>
      Mark Deleted
    </Button>
  );
}
