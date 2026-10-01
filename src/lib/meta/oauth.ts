export const META_STATE_COOKIE = "meta_oauth_state";

function publicBase(request: Request): string {
  const configured = process.env.APP_PUBLIC_URL?.trim();
  return configured ? configured.replace(/\/$/, "") : new URL(request.url).origin;
}

/** Must match a "Valid OAuth Redirect URI" in the Meta app settings exactly. */
export function metaRedirectUri(request: Request): string {
  return `${publicBase(request)}/api/integrations/meta/callback`;
}

export function settingsUrl(request: Request, params: Record<string, string>): URL {
  const url = new URL("/dashboard/settings", publicBase(request));
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.hash = "lead-ads";
  return url;
}
