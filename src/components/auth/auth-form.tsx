"use client";

import { useActionState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuthActionState } from "@/server/auth/actions";

interface AuthFormProps {
  mode: "signup" | "signin";
  action: (state: AuthActionState, formData: FormData) => Promise<AuthActionState>;
  altHref: string;
  altLabel: string;
}

export function AuthForm({ mode, action, altHref, altLabel }: AuthFormProps) {
  const [state, formAction, pending] = useActionState<AuthActionState, FormData>(action, {
    error: null,
  });

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {mode === "signup" && (
        <div className="space-y-2">
          <Label htmlFor="fullName">Full name</Label>
          <Input id="fullName" name="fullName" autoComplete="name" required maxLength={200} />
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          required
          minLength={mode === "signup" ? 8 : undefined}
        />
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" className="w-full" size="lg" variant="accent" disabled={pending}>
        {pending ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        {mode === "signup" ? "Already have an account? " : "New to RV Match? "}
        <Link href={altHref} className="font-medium text-accent hover:underline">
          {altLabel}
        </Link>
      </p>
    </form>
  );
}
