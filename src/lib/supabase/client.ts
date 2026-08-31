import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/lib/database.types";
import { getPublicSupabaseAnonKey, getPublicSupabaseUrl } from "@/lib/env";

export function createClient() {
  const url = getPublicSupabaseUrl();
  const anonKey = getPublicSupabaseAnonKey();

  if (!url || !anonKey) {
    return null;
  }

  return createBrowserClient<Database>(url, anonKey);
}
