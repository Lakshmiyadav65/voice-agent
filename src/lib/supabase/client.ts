import { createBrowserClient } from "@supabase/ssr";

import { getPublicSupabaseAnonKey, getPublicSupabaseUrl } from "@/lib/env";

/**
 * Browser Supabase client. Returns null when env is not configured (Phase 1).
 * Auth flows arrive in Phase 2.
 */
export function createClient() {
  const url = getPublicSupabaseUrl();
  const anonKey = getPublicSupabaseAnonKey();

  if (!url || !anonKey) {
    return null;
  }

  return createBrowserClient(url, anonKey);
}
