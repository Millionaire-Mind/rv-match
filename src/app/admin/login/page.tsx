import type { Metadata } from "next";
import Link from "next/link";

import { AuthForm } from "@/components/auth/auth-form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { brand } from "@/config/brand";
import { signInAction } from "@/server/auth/actions";

export const metadata: Metadata = { title: "Admin sign in" };

export default function AdminLoginPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-[#0a0a0b] px-4 py-12 text-white">
      <Link href="/" className="mb-8 text-xl font-semibold tracking-tight">
        {brand.name} <span className="text-white/50 font-normal">Admin</span>
      </Link>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Platform admin</CardTitle>
          <CardDescription>Restricted access. Sign in with your admin account.</CardDescription>
        </CardHeader>
        <CardContent>
          <AuthForm mode="signin" action={signInAction} altHref="/" altLabel="Back to RV Match" />
        </CardContent>
      </Card>
    </main>
  );
}
