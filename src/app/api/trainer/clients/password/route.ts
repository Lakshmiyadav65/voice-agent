import { NextResponse } from "next/server";

import { generatePassword } from "@/lib/auth/password";
import { isPlatformStaff } from "@/lib/auth/roles";
import { getSessionContext } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

function loginUrl(request: Request): string {
  const base = process.env.APP_PUBLIC_URL?.trim() || new URL(request.url).origin;
  return `${base.replace(/\/$/, "")}/login`;
}

/**
 * Staff give a client a new password, for when "Forgot password?" is no help (no access
 * to the email, or the email never came). The new password is returned once, to share.
 * Only business owners: staff logins are not reset from here.
 */
export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isPlatformStaff(session.profile.platform_role)) {
    return NextResponse.json({ error: "Only platform staff can reset a client's password." }, { status: 403 });
  }
  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const body = await request.json().catch(() => null);
  const userId = String(body?.userId ?? "").trim();
  const { data: profile } = await supabase
    .from("profiles")
    .select("email, platform_role")
    .eq("id", userId)
    .maybeSingle();
  if (!profile || profile.platform_role !== "business_owner") {
    return NextResponse.json({ error: "That client login was not found." }, { status: 404 });
  }

  const password = generatePassword();
  const { error } = await supabase.auth.admin.updateUserById(userId, { password });
  if (error) return NextResponse.json({ error: "Could not reset the password." }, { status: 500 });
  return NextResponse.json({ email: profile.email, password, loginUrl: loginUrl(request) });
}
