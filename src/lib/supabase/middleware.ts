import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { canAccessDashboard, canAccessTrainerConsole, isPlatformStaff } from "@/lib/auth/roles";
import { parseStaffViewCookie, STAFF_VIEW_COOKIE } from "@/lib/auth/staff-view";
import type { PlatformRole } from "@/lib/database.types";

export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey || url.includes("your-project")) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isProtected =
    pathname.startsWith("/dashboard") || pathname.startsWith("/trainer") || pathname.startsWith("/admin");

  if (!user && isProtected) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user && pathname === "/login") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("platform_role")
      .eq("id", user.id)
      .maybeSingle();

    const role = (profile?.platform_role ?? "business_owner") as PlatformRole;
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = canAccessTrainerConsole(role) ? "/trainer" : "/dashboard";
    homeUrl.search = "";
    return NextResponse.redirect(homeUrl);
  }

  if (user && pathname.startsWith("/dashboard")) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("platform_role")
      .eq("id", user.id)
      .maybeSingle();

    const role = (profile?.platform_role ?? "business_owner") as PlatformRole;
    // Staff viewing a client's dashboard pass; the pages check the cookie belongs to staff.
    const staffViewing = isPlatformStaff(role) && Boolean(parseStaffViewCookie(request.cookies.get(STAFF_VIEW_COOKIE)?.value));
    if (!canAccessDashboard(role) && !staffViewing) {
      const trainerUrl = request.nextUrl.clone();
      trainerUrl.pathname = "/trainer";
      return NextResponse.redirect(trainerUrl);
    }
  }

  if (user && pathname.startsWith("/trainer")) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("platform_role")
      .eq("id", user.id)
      .maybeSingle();

    const role = (profile?.platform_role ?? "business_owner") as PlatformRole;
    if (!canAccessTrainerConsole(role)) {
      const dashboardUrl = request.nextUrl.clone();
      dashboardUrl.pathname = "/dashboard";
      return NextResponse.redirect(dashboardUrl);
    }
  }

  return supabaseResponse;
}
