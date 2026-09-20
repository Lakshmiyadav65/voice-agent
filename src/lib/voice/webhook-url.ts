const WEBHOOK_PATH = "/api/voice/webhook";

/**
 * Sarvam calls this back from its own infrastructure, so the URL must be
 * publicly reachable. Falls back to the request origin for local tunnels,
 * but a deployed app should set APP_PUBLIC_URL.
 */
export function resolveWebhookUrl(request: Request): string | undefined {
  const configured = process.env.APP_PUBLIC_URL?.trim();
  if (configured) {
    return `${configured.replace(/\/$/, "")}${WEBHOOK_PATH}`;
  }

  const origin = request.headers.get("origin") || request.headers.get("host");
  if (!origin) return undefined;

  const base = origin.startsWith("http") ? origin : `https://${origin}`;
  return `${base.replace(/\/$/, "")}${WEBHOOK_PATH}`;
}
