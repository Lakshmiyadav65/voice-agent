import type { SupabaseClient } from "@supabase/supabase-js";

import { isPlatformStaff } from "@/lib/auth/roles";
import type { SessionContext } from "@/lib/auth/session";
import type { Database } from "@/lib/database.types";

type AdminClient = SupabaseClient<Database>;

/**
 * API routes run on the service-role client, which bypasses RLS, so tenant
 * isolation has to be enforced here instead. Staff see every business; owners
 * see only the businesses they are members of.
 */
export type AccessScope = { staff: true } | { staff: false; businessIds: string[] };

export async function getAccessScope(
  supabase: AdminClient,
  session: SessionContext
): Promise<AccessScope> {
  if (isPlatformStaff(session.profile.platform_role)) return { staff: true };

  const { data } = await supabase
    .from("business_members")
    .select("business_id")
    .eq("user_id", session.userId);

  return { staff: false, businessIds: (data ?? []).map((row) => row.business_id) };
}

export function canAccessBusiness(scope: AccessScope, businessId: string | null | undefined) {
  if (!businessId) return false;
  return scope.staff || scope.businessIds.includes(businessId);
}

/** The caller's own business, or null for staff and for owners with no membership yet. */
export function primaryBusinessId(scope: AccessScope): string | null {
  return scope.staff ? null : scope.businessIds[0] ?? null;
}

/**
 * Loads an AI employee only if the caller may act on its business. Returns null
 * both when it does not exist and when it belongs to someone else, so callers
 * cannot probe for other tenants' ids.
 */
export async function loadAccessibleEmployee(
  supabase: AdminClient,
  session: SessionContext,
  aiEmployeeId: string
) {
  const { data: employee } = await supabase
    .from("ai_employees")
    .select("*, businesses(*)")
    .eq("id", aiEmployeeId)
    .maybeSingle();

  if (!employee) return null;

  const scope = await getAccessScope(supabase, session);
  return canAccessBusiness(scope, employee.business_id) ? employee : null;
}

/**
 * Stricter than canAccessBusiness: only owners (and staff) may change where a
 * business's lead data is sent, since a webhook receives every lead's phone number.
 */
export async function canManageBusiness(
  supabase: AdminClient,
  session: SessionContext,
  businessId: string
): Promise<boolean> {
  if (isPlatformStaff(session.profile.platform_role)) return true;

  const { data } = await supabase
    .from("business_members")
    .select("role")
    .eq("user_id", session.userId)
    .eq("business_id", businessId)
    .maybeSingle();

  return data?.role === "owner";
}
