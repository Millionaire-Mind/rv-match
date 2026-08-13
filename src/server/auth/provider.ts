import "server-only";

import {
  localGetUserId,
  localSignIn,
  localSignOut,
  localSignUp,
} from "./local-provider";
import {
  supabaseGetUserId,
  supabaseSignIn,
  supabaseSignOut,
  supabaseSignUp,
} from "./supabase-provider";

function usesRealSupabase(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return Boolean(url && !url.includes("your-project"));
}

export async function authSignUp(params: { email: string; password: string; fullName?: string }) {
  return usesRealSupabase() ? supabaseSignUp(params) : localSignUp(params);
}

export async function authSignIn(params: { email: string; password: string }) {
  return usesRealSupabase() ? supabaseSignIn(params) : localSignIn(params);
}

export async function authSignOut() {
  return usesRealSupabase() ? supabaseSignOut() : localSignOut();
}

export async function authGetUserId(): Promise<string | null> {
  return usesRealSupabase() ? supabaseGetUserId() : localGetUserId();
}

export { AuthError } from "./local-provider";
