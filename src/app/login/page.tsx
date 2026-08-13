import type { Metadata } from "next";
import Link from "next/link";

import { AuthForm } from "@/components/auth/auth-form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { brand } from "@/config/brand";
import { signInAction } from "@/server/auth/actions";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-12">
      <Link href="/" className="mb-8 text-xl font-semibold tracking-tight">
        {brand.name}
      </Link>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Welcome back</CardTitle>
          <CardDescription>Sign in to see your saved RVs and match results.</CardDescription>
        </CardHeader>
        <CardContent>
          <AuthForm mode="signin" action={signInAction} altHref="/signup" altLabel="Create one" />
        </CardContent>
      </Card>
      <p className="mt-6 text-xs text-muted-foreground">
        Dealer team member? <Link href="/dealer/login" className="underline">Sign in here</Link>.
      </p>
    </main>
  );
}
