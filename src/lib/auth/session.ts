import { redirect } from "next/navigation";

import {
  canAccessDashboard,
  canAccessTrainerConsole,
  homePathForRole,
} from "@/lib/auth/roles";
import type { Profile } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

export type SessionContext = {
  userId: string;
  email: string;
  profile: Profile;
};

export async function getSessionContext(): Promise<SessionContext | null> {
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
}

export async function requireAuth(): Promise<SessionContext> {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  return session;
}

export async function requireDashboardAccess(): Promise<SessionContext> {
  const session = await requireAuth();
  if (!canAccessDashboard(session.profile.platform_role)) {
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
