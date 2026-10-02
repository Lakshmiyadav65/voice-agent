import { createHmac, timingSafeEqual } from "crypto";

/**
 * Browser test calls run through Dograh's website widget, which caps the context
 * it carries at 2,000 characters a value: far too small for an agent's brief.
 * So the widget sends this short signed code as the caller number instead, and
 * Dograh's pre-call fetch trades it for the full brief at
 * /api/voice/dograh/pre-call. The signature is the only proof needed there.
 */

const PREFIX = "web";
const TTL_MS = 15 * 60_000;

export type BrowserCallCode = { aiEmployeeId: string; userId: string };

function signature(payload: string): string | null {
  const apiKey = process.env.DOGRAH_API_KEY?.trim();
  if (!apiKey) return null;
  const key = createHmac("sha256", apiKey).update("browser-call").digest();
  return createHmac("sha256", key).update(payload).digest("base64url");
}

export function createBrowserCallCode(code: BrowserCallCode): string | null {
  const payload = [PREFIX, code.aiEmployeeId, code.userId, (Date.now() + TTL_MS).toString(36)].join(".");
  const sig = signature(payload);
  return sig ? `${payload}.${sig}` : null;
}

/** The code's contents if it is ours, untampered and unexpired; null for anything else, real phone numbers included. */
export function readBrowserCallCode(value: unknown): BrowserCallCode | null {
  if (typeof value !== "string") return null;
  const parts = value.split(".");
  if (parts.length !== 5 || parts[0] !== PREFIX) return null;

  const [, aiEmployeeId, userId, expires, sig] = parts;
  const expected = signature(parts.slice(0, 4).join("."));
  if (!expected || expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) {
    return null;
  }
  if (parseInt(expires, 36) < Date.now()) return null;
  return { aiEmployeeId, userId };
}
