import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { getPublicSupabaseUrl, getServiceRoleKey } from "@/lib/env";

export function createAdminClient() {
  const url = getPublicSupabaseUrl();
  const serviceRoleKey = getServiceRoleKey();

  if (!url || !serviceRoleKey) {
    return null;
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
