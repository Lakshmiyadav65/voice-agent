/**
 * Which ad a lead came from. Ads link to the hosted form with UTM tags, and
 * Meta and Google append their own click ids, so the landing URL is the record.
 */

export const ATTRIBUTION_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "fbclid",
  "gclid",
] as const;

export type Attribution = Partial<Record<(typeof ATTRIBUTION_KEYS)[number], string>>;

const MAX_VALUE_LENGTH = 200;

/** Keeps only known keys with string values, so callers cannot store arbitrary JSON. */
export function sanitizeAttribution(value: unknown): Attribution {
  if (!value || typeof value !== "object") return {};

  const input = value as Record<string, unknown>;
  const result: Attribution = {};

  for (const key of ATTRIBUTION_KEYS) {
    const raw = input[key];
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim().slice(0, MAX_VALUE_LENGTH);
    if (trimmed) result[key] = trimmed;
  }

  return result;
}

export function attributionFromSearch(search: string): Attribution {
  return sanitizeAttribution(Object.fromEntries(new URLSearchParams(search)));
}

const SOURCE_ALIASES: Record<string, string> = {
  fb: "facebook",
  meta: "facebook",
  facebook: "facebook",
  ig: "instagram",
  instagram: "instagram",
  google: "google",
  adwords: "google",
  youtube: "youtube",
  whatsapp: "whatsapp",
  wa: "whatsapp",
};

/** A tagged source wins; otherwise a platform click id still tells us where the click came from. */
export function sourceFromAttribution(attribution: Attribution): string | undefined {
  const tagged = attribution.utm_source?.toLowerCase();
  if (tagged) return SOURCE_ALIASES[tagged] ?? tagged.slice(0, 50);
  if (attribution.fbclid) return "facebook";
  if (attribution.gclid) return "google";
  return undefined;
}

const SOURCE_LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  google: "Google",
  youtube: "YouTube",
  whatsapp: "WhatsApp",
  hosted_form: "Lead form (direct)",
  ad_form: "Website form",
  dev_test_page: "Test page",
};

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source.charAt(0).toUpperCase() + source.slice(1);
}

export function campaignOf(utm: unknown): string | undefined {
  return sanitizeAttribution(utm).utm_campaign;
}
