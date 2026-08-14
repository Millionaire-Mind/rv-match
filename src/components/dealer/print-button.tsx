"use client";

import { Button } from "@/components/ui/button";

export function PrintButton() {
  return (
    <Button variant="accent" onClick={() => window.print()}>
      Print
    </Button>
  );
}
