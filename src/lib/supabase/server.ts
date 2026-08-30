import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getPublicSupabaseAnonKey, getPublicSupabaseUrl } from "@/lib/env";

/**
 * Server Supabase client. Returns null when env is not configured (Phase 1).
 * Auth and RLS arrive in Phase 2.
 */
export async function createClient() {
  const url = getPublicSupabaseUrl();
  const anonKey = getPublicSupabaseAnonKey();

  if (!url || !anonKey) {
    return null;
  }

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component where cookies are read-only.
        }
      },
    },
  });
}
