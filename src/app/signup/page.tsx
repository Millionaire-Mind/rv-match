import type { Metadata } from "next";
import Link from "next/link";

import { AuthForm } from "@/components/auth/auth-form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { brand } from "@/config/brand";
import { signUpAction } from "@/server/auth/actions";

export const metadata: Metadata = { title: "Create your account" };

export default function SignUpPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-12">
      <Link href="/" className="mb-8 text-xl font-semibold tracking-tight">
        {brand.name}
      </Link>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Save your RV Match</CardTitle>
          <CardDescription>
            Create an account to keep your preferences, saved RVs, and match results across
            devices. Everything you&apos;ve already done in this session carries over.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AuthForm mode="signup" action={signUpAction} altHref="/login" altLabel="Sign in" />
        </CardContent>
      </Card>
    </main>
  );
}
