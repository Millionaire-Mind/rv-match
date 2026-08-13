"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { rejectSale, verifySale } from "@/server/admin/sale-actions";

export function SaleVerificationButtons({ saleId }: { saleId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(action: (id: string) => Promise<void>) {
    startTransition(async () => {
      await action(saleId);
      router.refresh();
    });
  }

  return (
    <div className="flex gap-2">
      <Button size="sm" variant="accent" disabled={pending} onClick={() => run(verifySale)}>
        Verify
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => run(rejectSale)}>
        Reject
      </Button>
    </div>
  );
}
