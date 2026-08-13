import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

/**
 * Storage abstraction: local filesystem in development (writes under
 * public/media and serves at /media/*), Supabase Storage in production.
 * Same switch condition as src/server/auth/provider.ts.
 */
function usesRealSupabase(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return Boolean(url && !url.includes("your-project"));
}

const LOCAL_MEDIA_DIR = path.join(process.cwd(), "public", "media");
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "rv-match-media";

export async function uploadBuffer(
  key: string,
  data: Buffer,
  _contentType: string,
): Promise<string> {
  if (usesRealSupabase()) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(key, data, { contentType: _contentType, upsert: true });
    if (error) throw new Error(`Storage upload failed: ${error.message}`);
    const { data: publicUrl } = supabase.storage.from(BUCKET).getPublicUrl(key);
    return publicUrl.publicUrl;
  }

  const destination = path.join(LOCAL_MEDIA_DIR, key);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, data);
  return `/media/${key}`;
}

export function isLocalStorage(): boolean {
  return !usesRealSupabase();
}
