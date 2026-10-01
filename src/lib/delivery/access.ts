import { canManageBusiness } from "@/lib/auth/access";
import type { SessionContext } from "@/lib/auth/session";
import type { DeliveryTarget } from "@/lib/database.types";
import { createAdminClient } from "@/lib/supabase/admin";

/** Returns the target only if the caller may manage it; otherwise null, so ids cannot be probed. */
export async function loadManageableTarget(session: SessionContext, id: string) {
  const supabase = createAdminClient();
  if (!supabase) return { supabase: null, target: null };

  const { data: target } = await supabase
    .from("delivery_targets")
    .select("*")
    .eq("id", id)
    .maybeSingle<DeliveryTarget>();

  if (!target || !(await canManageBusiness(supabase, session, target.business_id))) {
    return { supabase, target: null };
  }
  return { supabase, target };
}
