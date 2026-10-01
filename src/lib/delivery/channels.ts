import { createHmac } from "crypto";

import type { DeliveryTarget } from "@/lib/database.types";
import { formatCapturedValue } from "@/lib/voice/capture-fields";
import {
  OUTCOME_TEXT,
  resultHeadline,
  toSheetRow,
  type CallResultPayload,
} from "@/lib/delivery/payload";

export type SendResult = { ok: true; code?: number } | { ok: false; code?: number; error: string };

const TIMEOUT_MS = 10_000;
const RESEND_URL = "https://api.resend.com/emails";
// Resend's shared test sender works without a verified domain, but only to the account's own address.
const DEFAULT_FROM = "AI Employee <onboarding@resend.dev>";

async function post(url: string, body: string, headers: Record<string, string>): Promise<SendResult> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) return { ok: true, code: res.status };
    const text = (await res.text().catch(() => "")).slice(0, 300);
    return { ok: false, code: res.status, error: `HTTP ${res.status}${text ? `: ${text}` : ""}` };
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    return { ok: false, error: timedOut ? "No response within 10 seconds" : "Could not connect" };
  }
}

/** Receivers verify with HMAC-SHA256 of the raw body using the target's secret. */
export function signBody(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

function sendWebhook(target: DeliveryTarget, payload: CallResultPayload) {
  const body = JSON.stringify(payload);
  return post(target.destination, body, {
    "X-Voice-Agent-Event": payload.event,
    "X-Voice-Agent-Signature": signBody(body, target.secret),
  });
}

function sendSheet(target: DeliveryTarget, payload: CallResultPayload) {
  return post(target.destination, JSON.stringify(toSheetRow(payload)), {});
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderEmail(payload: CallResultPayload): { subject: string; html: string; text: string } {
  const { lead, call } = payload;
  const headline = resultHeadline(payload);
  const prefix = payload.event === "test" ? "[Test] " : "";
  const subject = `${prefix}${lead.name} — ${headline}`;

  const rows: Array<[string, string]> = [
    ["Phone", lead.phone],
    ["Result", headline],
    ["Outcome", call.outcome ? OUTCOME_TEXT[call.outcome] ?? call.outcome : "—"],
    ["Source", lead.campaign ? `${lead.source_label} · ${lead.campaign}` : lead.source_label],
    ["Enquiry", lead.enquiry ?? "—"],
    ["Call length", call.duration_seconds ? `${call.duration_seconds}s` : "—"],
  ];
  for (const item of call.captured) {
    const value = formatCapturedValue(item);
    if (value) rows.push([item.label, value]);
  }
  if (call.preferred_visit_at) {
    rows.push([
      "Preferred visit",
      new Date(call.preferred_visit_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
    ]);
  }

  const html = `<div style="font-family:system-ui,sans-serif;max-width:560px;color:#1a2a24">
  <p style="font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#5a6d64;margin:0">${escapeHtml(payload.business.name)} · new call result</p>
  <h1 style="font-size:22px;margin:8px 0 16px">${escapeHtml(lead.name)} — ${escapeHtml(headline)}</h1>
  ${call.summary ? `<p style="background:#eef3f0;padding:12px 14px;border-radius:8px;line-height:1.5;margin:0 0 16px">${escapeHtml(call.summary)}</p>` : ""}
  <table style="border-collapse:collapse;font-size:14px;width:100%">
    ${rows
      .map(
        ([k, v]) =>
          `<tr><td style="padding:6px 12px 6px 0;color:#5a6d64;white-space:nowrap;vertical-align:top">${escapeHtml(k)}</td><td style="padding:6px 0">${escapeHtml(v)}</td></tr>`
      )
      .join("")}
  </table>
  ${payload.dashboard_url ? `<p style="margin-top:20px"><a href="${escapeHtml(payload.dashboard_url)}" style="color:#0b6b52;font-weight:600">Open your dashboard →</a></p>` : ""}
</div>`;

  const text = [
    `${lead.name} — ${headline}`,
    call.summary ?? "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    payload.dashboard_url ?? "",
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html, text };
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

function sendEmail(target: DeliveryTarget, payload: CallResultPayload): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    return Promise.resolve({ ok: false, error: "Email is not set up yet (RESEND_API_KEY missing)" });
  }

  const { subject, html, text } = renderEmail(payload);
  return post(
    RESEND_URL,
    JSON.stringify({
      from: process.env.RESULTS_FROM_EMAIL?.trim() || DEFAULT_FROM,
      to: [target.destination],
      subject,
      html,
      text,
    }),
    { Authorization: `Bearer ${key}` }
  );
}

export function sendToTarget(target: DeliveryTarget, payload: CallResultPayload): Promise<SendResult> {
  switch (target.kind) {
    case "email":
      return sendEmail(target, payload);
    case "sheet":
      return sendSheet(target, payload);
    case "webhook":
      return sendWebhook(target, payload);
  }
}
