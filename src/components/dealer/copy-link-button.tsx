"use client";

import { useState } from "react";
import { Copy } from "lucide-react";

import { Button } from "@/components/ui/button";

export function CopyLinkButton({ link, label = "Copy Link" }: { link: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button size="sm" variant="outline" onClick={copy}>
      <Copy className="h-4 w-4" />
      {copied ? "Copied" : label}
    </Button>
  );
}
