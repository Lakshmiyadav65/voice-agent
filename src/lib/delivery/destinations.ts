import type { DeliveryKind } from "@/lib/database.types";

/** Shared by the Settings form and the API so both reject the same input. */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SHEET_URL = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/;

// Owners paste URLs we then fetch from our server, so internal addresses are
// refused. This checks literal hosts only; it is a guard, not a full SSRF defence.
const PRIVATE_HOST =
  /^(localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|\[?f[cd])/i;

export const KIND_LABELS: Record<DeliveryKind, string> = {
  email: "Email",
  sheet: "Google Sheet",
  webhook: "Webhook",
};

export function validateDestination(kind: DeliveryKind, raw: string): string | null {
  const value = raw.trim();
  if (!value) return "Enter a destination.";

  if (kind === "email") {
    return EMAIL.test(value) && value.length <= 254 ? null : "Enter a valid email address.";
  }

  if (kind === "sheet") {
    return SHEET_URL.test(value)
      ? null
      : "Paste the Apps Script web app URL — it starts with https://script.google.com/macros/s/ and ends in /exec.";
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "Enter a full URL starting with https://.";
  }
  if (url.protocol !== "https:") return "The webhook URL must start with https://.";
  if (PRIVATE_HOST.test(url.hostname)) return "That address is not reachable from the internet.";
  return null;
}

export function isDeliveryKind(value: unknown): value is DeliveryKind {
  return value === "email" || value === "sheet" || value === "webhook";
}
