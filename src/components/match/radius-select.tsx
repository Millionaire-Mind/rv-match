"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { setSearchRadius } from "@/server/discovery/location";

const OPTIONS = [
  { value: "25", label: "25 miles" },
  { value: "50", label: "50 miles" },
  { value: "100", label: "100 miles" },
  { value: "250", label: "250 miles" },
  { value: "500", label: "500 miles" },
  { value: "5000", label: "Nationwide" },
];

export function RadiusSelect({ initialRadius }: { initialRadius: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleChange(value: string) {
    startTransition(async () => {
      await setSearchRadius(Number(value));
      router.refresh();
    });
  }

  return (
    <Select defaultValue={String(initialRadius)} onValueChange={handleChange} disabled={pending}>
      <SelectTrigger className="w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
