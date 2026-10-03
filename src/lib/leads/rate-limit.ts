import { createHash } from "crypto";

import { createAdminClient } from "@/lib/supabase/admin";

const PHONE_COOLDOWN_MINUTES = 10;
const IP_WINDOW_MINUTES = 60;
const IP_MAX_SUBMISSIONS = 5;

export type ThrottleVerdict = { allowed: true } | { allowed: false; reason: string };

export function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  // Salted with the service role key so the hashes are useless if the table leaks.
  const salt = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

export function clientIpFrom(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip");
}

/**
 * Each accepted submission places a real phone call, so an unthrottled form
 * lets anyone spend the account's call budget on arbitrary numbers.
 */
export async function checkSubmissionAllowed(
  phone: string,
  ipHash: string | null
): Promise<ThrottleVerdict> {
  const supabase = createAdminClient();
  if (!supabase) return { allowed: true };

  // The cooldown guards the call budget, so a request whose call was never placed (still
  // "new", e.g. the voice account refused it) does not block a retry. Anything from the last
  // minute still counts, so a double submit cannot slip in while the first call is dialling.
  const phoneSince = new Date(Date.now() - PHONE_COOLDOWN_MINUTES * 60_000).toISOString();
  const justNow = new Date(Date.now() - 60_000).toISOString();
  const { data: recentForPhone } = await supabase
    .from("leads")
    .select("id")
    .eq("phone", phone)
    .gte("created_at", phoneSince)
    .or(`status.neq.new,created_at.gte.${justNow}`)
    .limit(1);

  if (recentForPhone?.length) {
    return {
      allowed: false,
      reason: `We already have a request for this number. Please wait ${PHONE_COOLDOWN_MINUTES} minutes before submitting again.`,
    };
  }

  if (ipHash) {
    const ipSince = new Date(Date.now() - IP_WINDOW_MINUTES * 60_000).toISOString();
    const { count } = await supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .gte("created_at", ipSince);

    if ((count ?? 0) >= IP_MAX_SUBMISSIONS) {
      return {
        allowed: false,
        reason: "Too many requests from this location. Please try again later.",
      };
    }
  }

  return { allowed: true };
}
