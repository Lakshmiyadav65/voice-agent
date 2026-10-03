import { NextResponse } from "next/server";

import { isPlatformStaff } from "@/lib/auth/roles";
import { getSessionContext } from "@/lib/auth/session";
import { parseStaffViewCookie, STAFF_VIEW_COOKIE, STAFF_VIEW_MAX_AGE_SECONDS } from "@/lib/auth/staff-view";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Starts or ends staff viewing a client's dashboard. ?businessId=<id> opens that client's
 * dashboard; ?exit=1 goes back to /admin. A link, so it works from any staff page.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const session = await getSessionContext();
  if (!session || !isPlatformStaff(session.profile.platform_role)) {
    return NextResponse.redirect(new URL("/login", url));
  }

  if (url.searchParams.get("exit")) {
    const response = NextResponse.redirect(new URL("/admin", url));
    response.cookies.delete(STAFF_VIEW_COOKIE);
    return response;
  }

  const businessId = parseStaffViewCookie(url.searchParams.get("businessId") ?? undefined);
  const supabase = createAdminClient();
  const { data: business } =
    businessId && supabase
      ? await supabase.from("businesses").select("id").eq("id", businessId).maybeSingle()
      : { data: null };
  if (!business) return NextResponse.redirect(new URL("/admin", url));

  const response = NextResponse.redirect(new URL("/dashboard", url));
  response.cookies.set(STAFF_VIEW_COOKIE, business.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: url.protocol === "https:",
    path: "/",
    maxAge: STAFF_VIEW_MAX_AGE_SECONDS,
  });
  return response;
}
