import { formatE164PhoneNumber } from "@/lib/phone";
import {
  SarvamAppOverrides,
  SarvamInstantOutboundRequest,
  SarvamInstantOutboundResponse,
} from "./types";

const SARVAM_OUTBOUND_BASE_URL = "https://apps.sarvam.ai/api/outbounds";

// Lives in a browser-safe module; re-exported so existing imports keep working.
export { formatE164PhoneNumber };

export interface TriggerLeadCallOptions {
  customerName?: string;
  phoneNumber: string;
  reason?: string;
  agentVariables?: Record<string, any>;
  initialBotMessage?: string;
  initialStateName?: string;
  initialLanguage?: SarvamAppOverrides["initial_language_name"];
  webhookUrl?: string;
  metadata?: Record<string, any>;
  // Overrides for agent/connection if not using env vars
  agentId?: string;
  agentVersion?: number;
  connectionId?: string;
  fromPhoneNumber?: string;
}

/**
 * Triggers an instant outbound voice call using Sarvam Voice Agents API
 * Spec: POST https://apps.sarvam.ai/api/outbounds/v1/orgs/{org_id}/workspaces/{workspace_id}/outbounds
 */
export async function triggerLeadCall(
  options: TriggerLeadCallOptions
): Promise<{ success: boolean; attemptId?: string; error?: string }> {
  const apiKey = process.env.SARVAM_API_KEY;
  const orgId = process.env.SARVAM_ORG_ID;
  const workspaceId = process.env.SARVAM_WORKSPACE_ID;
  const agentId = options.agentId || process.env.SARVAM_AGENT_ID;
  // A client's own agent runs whatever staff last committed in Sarvam's console, so retraining
  // there needs no change here; the shared default stays pinned to SARVAM_AGENT_VERSION if set.
  const agentVersion =
    options.agentVersion ?? (options.agentId ? undefined : Number(process.env.SARVAM_AGENT_VERSION) || undefined);
  const connectionId = options.connectionId || process.env.SARVAM_CONNECTION_ID;
  const fromPhoneNumber = options.fromPhoneNumber || process.env.SARVAM_AGENT_PHONE_NUMBER;

  if (!apiKey) {
    return { success: false, error: "SARVAM_API_KEY is not configured in environment variables" };
  }
  if (!orgId || !workspaceId) {
    return { success: false, error: "SARVAM_ORG_ID or SARVAM_WORKSPACE_ID is missing" };
  }
  if (!agentId) {
    return { success: false, error: "Sarvam Agent ID (SARVAM_AGENT_ID) is required" };
  }
  if (!connectionId) {
    return { success: false, error: "Sarvam Connection ID (SARVAM_CONNECTION_ID) is required" };
  }
  if (!fromPhoneNumber) {
    return { success: false, error: "Sarvam From Phone Number (SARVAM_AGENT_PHONE_NUMBER) is required" };
  }

  const formattedToNumber = formatE164PhoneNumber(options.phoneNumber);
  const formattedFromNumber = formatE164PhoneNumber(fromPhoneNumber);

  // Interpolate any {{variable}} placeholders in initialBotMessage using agentVariables
  let resolvedBotMessage = options.initialBotMessage;
  if (resolvedBotMessage && options.agentVariables) {
    for (const [k, v] of Object.entries(options.agentVariables)) {
      if (typeof v === "string" || typeof v === "number") {
        resolvedBotMessage = resolvedBotMessage.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "g"), String(v));
      }
    }
  }

  const payload: SarvamInstantOutboundRequest = {
    app_config: {
      app_id: agentId,
      ...(agentVersion ? { app_version: agentVersion } : { version_filter: "latest_committed" as const }),
      app_type: "agent",
      connection_config: {
        connection_id: connectionId,
        agent_phone_number: formattedFromNumber,
      },
      ...(options.agentVariables && Object.keys(options.agentVariables).length > 0
        ? { agent_variables: options.agentVariables }
        : {}),
      ...(resolvedBotMessage || options.initialStateName || options.initialLanguage
        ? {
            app_overrides: {
              ...(resolvedBotMessage ? { initial_bot_message: resolvedBotMessage } : {}),
              ...(options.initialStateName ? { initial_state_name: options.initialStateName } : {}),
              ...(options.initialLanguage ? { initial_language_name: options.initialLanguage } : {}),
            },
          }
        : {}),
    },
    user_config: {
      user_phone_number: formattedToNumber,
    },
    ...(options.webhookUrl
      ? {
          webhook_config: {
            url: options.webhookUrl,
            metadata: options.metadata || null,
          },
        }
      : {}),
  };

  const url = `${SARVAM_OUTBOUND_BASE_URL}/v1/orgs/${orgId}/workspaces/${workspaceId}/outbounds`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok) {
      const errorMsg = data?.detail || data?.message || JSON.stringify(data);
      return { success: false, error: `Sarvam API error (${res.status}): ${errorMsg}` };
    }

    const result = data as SarvamInstantOutboundResponse;
    return { success: true, attemptId: result.attempt_id };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to contact Sarvam Voice Agents API" };
  }
}
