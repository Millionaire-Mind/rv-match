import type { Metadata } from "next";
import Link from "next/link";

import { AuthForm } from "@/components/auth/auth-form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { brand } from "@/config/brand";
import { signInAction } from "@/server/auth/actions";

export const metadata: Metadata = { title: "Dealer sign in" };

export default function DealerLoginPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-secondary/40 px-4 py-12">
      <Link href="/" className="mb-8 text-xl font-semibold tracking-tight">
        {brand.name} <span className="text-muted-foreground font-normal">for Dealers</span>
      </Link>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Dealer sign in</CardTitle>
          <CardDescription>Manage inventory, leads, and your pilot progress.</CardDescription>
        </CardHeader>
        <CardContent>
          <AuthForm
            mode="signin"
            action={signInAction}
            altHref="/dealer/apply"
            altLabel="Apply for a dealer account"
          />
        </CardContent>
      </Card>
    </main>
  );
}
