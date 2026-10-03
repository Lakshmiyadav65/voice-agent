import { cache } from "react";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  canAccessDashboard,
  canAccessTrainerConsole,
  homePathForRole,
  isPlatformStaff,
} from "@/lib/auth/roles";
import { parseStaffViewCookie, STAFF_VIEW_COOKIE } from "@/lib/auth/staff-view";
import type { Profile } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

export type SessionContext = {
  userId: string;
  email: string;
  profile: Profile;
};

/**
 * Cached per request: the layout and the page it renders both need the
 * session, and each uncached call costs an auth round trip plus a profile
 * query.
 */
export const getSessionContext = cache(async function getSessionContext(): Promise<SessionContext | null> {
  const supabase = await createClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) return null;

  const typedProfile = profile as Profile;

  return {
    userId: user.id,
    email: user.email ?? typedProfile.email,
    profile: typedProfile,
  };
});

/**
 * The business whose dashboard a staff member is viewing, or null. Cached per request.
 * A client with the cookie gets null: only staff may look at another business.
 */
export const getStaffViewBusinessId = cache(async function getStaffViewBusinessId(): Promise<string | null> {
  const session = await getSessionContext();
  if (!session || !isPlatformStaff(session.profile.platform_role)) return null;
  return parseStaffViewCookie((await cookies()).get(STAFF_VIEW_COOKIE)?.value);
});

export async function requireAuth(): Promise<SessionContext> {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  return session;
}

/** Business owners, and staff while they are viewing a client's dashboard. */
export async function requireDashboardAccess(): Promise<SessionContext> {
  const session = await requireAuth();
  if (!canAccessDashboard(session.profile.platform_role) && !(await getStaffViewBusinessId())) {
    redirect(homePathForRole(session.profile.platform_role));
  }
  return session;
}

export async function requireTrainerAccess(): Promise<SessionContext> {
  const session = await requireAuth();
  if (!canAccessTrainerConsole(session.profile.platform_role)) {
    redirect(homePathForRole(session.profile.platform_role));
  }
  return session;
}
