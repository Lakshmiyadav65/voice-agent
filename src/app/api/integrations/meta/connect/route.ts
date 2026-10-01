import { randomBytes } from "crypto";

import { NextResponse } from "next/server";

import { canManageBusiness, getAccessScope, primaryBusinessId } from "@/lib/auth/access";
import { getSessionContext } from "@/lib/auth/session";
import { metaRedirectUri, META_STATE_COOKIE, settingsUrl } from "@/lib/meta/oauth";
import { getMetaConfig, oauthDialogUrl } from "@/lib/meta/graph";
import { createAdminClient } from "@/lib/supabase/admin";

/** Sends the owner to Facebook to pick which Pages' lead ads should reach us. */
export async function GET(request: Request) {
  const config = getMetaConfig();
  if (!config) return NextResponse.redirect(settingsUrl(request, { meta: "not_configured" }));

  const session = await getSessionContext();
  if (!session) return NextResponse.redirect(new URL("/login", request.url));

  const supabase = createAdminClient();
  const businessId = supabase ? primaryBusinessId(await getAccessScope(supabase, session)) : null;
  if (!supabase || !businessId || !(await canManageBusiness(supabase, session, businessId))) {
    return NextResponse.redirect(settingsUrl(request, { meta: "not_owner" }));
  }

  // The state ties Facebook's redirect back to this browser, so nobody can
  // trick an owner into attaching someone else's Page.
  const state = randomBytes(24).toString("hex");
  const response = NextResponse.redirect(oauthDialogUrl(config, metaRedirectUri(request), state));
  response.cookies.set(META_STATE_COOKIE, state, {
    httpOnly: true,
    secure: new URL(request.url).protocol === "https:",
    sameSite: "lax",
    path: "/api/integrations/meta",
    maxAge: 600,
  });
  return response;
}
