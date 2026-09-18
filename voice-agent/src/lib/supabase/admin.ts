import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { getPublicSupabaseUrl } from "@/lib/env";

export function createAdminClient() {
  const url = getPublicSupabaseUrl();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return null;
  }

  return createSupabaseClient<Database>(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
