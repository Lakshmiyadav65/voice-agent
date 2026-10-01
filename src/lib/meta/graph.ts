import { createHmac, timingSafeEqual } from "crypto";

/**
 * Thin Graph API client for lead ads: just the calls we need, with fetch, so
 * there is no SDK to keep in step with Meta's version churn.
 */

const DEFAULT_VERSION = "v26.0";
const TIMEOUT_MS = 10_000;

// What the Page owner grants when connecting. leads_retrieval reads the lead;
// pages_manage_metadata subscribes our app to the Page's leadgen webhook.
export const META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_metadata",
  "pages_manage_ads",
  "leads_retrieval",
  "ads_management",
];

export type MetaConfig = { appId: string; appSecret: string; verifyToken: string; version: string };

export function getMetaConfig(): MetaConfig | null {
  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();
  const verifyToken = process.env.META_VERIFY_TOKEN?.trim();
  if (!appId || !appSecret || !verifyToken) return null;
  return { appId, appSecret, verifyToken, version: process.env.META_GRAPH_VERSION?.trim() || DEFAULT_VERSION };
}

/** Meta signs each webhook body with the app secret; anything else is forged. */
export function signatureMatches(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`);
  const received = Buffer.from(header);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

class GraphError extends Error {}

async function graph<T>(config: MetaConfig, path: string, params: Record<string, string>, method = "GET"): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${config.version}/${path}`);
  const init: RequestInit = { method, signal: AbortSignal.timeout(TIMEOUT_MS) };

  if (method === "GET") {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  } else {
    init.body = new URLSearchParams(params);
  }

  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new GraphError(data.error?.message ?? `Graph API error ${res.status}`);
  }
  return data as T;
}

// ---------------------------------------------------------------- leads

export type MetaLead = {
  id: string;
  created_time?: string;
  field_data?: Array<{ name: string; values?: string[] }>;
  ad_name?: string;
  adset_name?: string;
  campaign_name?: string;
  form_id?: string;
  platform?: string;
  is_organic?: boolean;
};

const FULL_FIELDS = "id,created_time,field_data,ad_name,adset_name,campaign_name,form_id,platform,is_organic";

export async function fetchLead(config: MetaConfig, leadgenId: string, pageToken: string): Promise<MetaLead> {
  try {
    return await graph<MetaLead>(config, leadgenId, { access_token: pageToken, fields: FULL_FIELDS });
  } catch (err) {
    // Ad-level names need ads permissions the Page may not have granted; the answers matter more.
    if (!(err instanceof GraphError)) throw err;
    return graph<MetaLead>(config, leadgenId, { access_token: pageToken, fields: "id,created_time,field_data" });
  }
}

const NAME_FIELDS = ["full_name", "name"];
const PHONE_FIELDS = ["phone_number", "phone", "mobile_number", "whatsapp_number"];
const EMAIL_FIELDS = ["email", "work_email"];

function humanize(question: string): string {
  const text = question.replace(/_/g, " ").replace(/\?+$/, "").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Splits Meta's flat answers into contact details and everything else the form asked. */
export function mapLeadFields(fieldData: MetaLead["field_data"] = []) {
  const answers = new Map<string, string>();
  for (const field of fieldData) {
    const value = field.values?.filter(Boolean).join(", ").trim();
    if (field.name && value) answers.set(field.name.toLowerCase(), value);
  }

  const take = (keys: string[]) => {
    for (const key of keys) {
      const value = answers.get(key);
      if (value) {
        answers.delete(key);
        return value;
      }
    }
    return undefined;
  };

  const first = take(["first_name"]);
  const last = take(["last_name"]);
  const name = take(NAME_FIELDS) ?? ([first, last].filter(Boolean).join(" ") || undefined);
  const phone = take(PHONE_FIELDS);
  const email = take(EMAIL_FIELDS);

  // Custom questions ("what are you looking for?") become the enquiry the agent opens with.
  const enquiry = [...answers.entries()].map(([q, a]) => `${humanize(q)}: ${a}`).join("; ") || undefined;

  return { name, phone, email, enquiry };
}

// ---------------------------------------------------------------- connecting a Page

export function oauthDialogUrl(config: MetaConfig, redirectUri: string, state: string): string {
  const url = new URL(`https://www.facebook.com/${config.version}/dialog/oauth`);
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", META_SCOPES.join(","));
  url.searchParams.set("response_type", "code");
  return url.toString();
}

/** Code → short-lived user token → long-lived user token, whose Page tokens never expire. */
export async function exchangeCodeForUserToken(config: MetaConfig, code: string, redirectUri: string) {
  const short = await graph<{ access_token: string }>(config, "oauth/access_token", {
    client_id: config.appId,
    client_secret: config.appSecret,
    redirect_uri: redirectUri,
    code,
  });
  const long = await graph<{ access_token: string }>(config, "oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: config.appId,
    client_secret: config.appSecret,
    fb_exchange_token: short.access_token,
  });
  return long.access_token;
}

export type MetaPage = { id: string; name: string; access_token: string };

/** Only the Pages the owner ticked in Facebook's dialog come back here. */
export async function listPages(config: MetaConfig, userToken: string): Promise<MetaPage[]> {
  const data = await graph<{ data: MetaPage[] }>(config, "me/accounts", {
    access_token: userToken,
    fields: "id,name,access_token",
    limit: "100",
  });
  return data.data ?? [];
}

export async function subscribePageToLeads(config: MetaConfig, page: MetaPage) {
  await graph(config, `${page.id}/subscribed_apps`, { subscribed_fields: "leadgen", access_token: page.access_token }, "POST");
}

export async function unsubscribePage(config: MetaConfig, pageId: string, pageToken: string) {
  await graph(config, `${pageId}/subscribed_apps`, { access_token: pageToken }, "DELETE");
}
