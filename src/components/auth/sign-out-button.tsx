"use client";

import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { signOutAction } from "@/server/auth/actions";

export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <Button type="submit" variant="ghost" size="sm" className="w-fit justify-start px-0 text-muted-foreground">
        <LogOut className="h-4 w-4" />
        Sign out
      </Button>
    </form>
  );
}
