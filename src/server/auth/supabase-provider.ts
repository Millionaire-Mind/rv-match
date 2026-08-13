import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { AuthError } from "./local-provider";

/**
 * Production auth provider: real Supabase Auth. Requires
 * NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY to point at a
 * real project (see README.md "External Setup I Must Perform"). This
 * codebase was built and tested end-to-end against the local provider
 * (`local-provider.ts`) because this sandbox has no Docker/hosted Supabase
 * access; this provider follows the documented `@supabase/ssr` server
 * pattern and takes over automatically once real credentials are present
 * (see `provider.ts`).
 */
async function getSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component render; middleware refreshes
            // the session cookie instead. Safe to ignore.
          }
        },
      },
    },
  );
}

export async function supabaseSignUp(params: {
  email: string;
  password: string;
  fullName?: string;
}): Promise<{ userId: string }> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: params.email,
    password: params.password,
    options: { data: { full_name: params.fullName ?? null } },
  });
  if (error || !data.user) throw new AuthError(error?.message ?? "Sign up failed.");
  return { userId: data.user.id };
}

export async function supabaseSignIn(params: {
  email: string;
  password: string;
}): Promise<{ userId: string }> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: params.email,
    password: params.password,
  });
  if (error || !data.user) throw new AuthError(error?.message ?? "Invalid email or password.");
  return { userId: data.user.id };
}

export async function supabaseSignOut(): Promise<void> {
  const supabase = await getSupabaseServerClient();
  await supabase.auth.signOut();
}

export async function supabaseGetUserId(): Promise<string | null> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}
