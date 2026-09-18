/**
 * Official Sarvam Voice Agents API types
 * Base URL for Outbound: https://apps.sarvam.ai/api/outbounds
 */

export interface SarvamConnectionConfig {
  connection_id: string;
  agent_phone_number: string;
}

export interface SarvamAppOverrides {
  initial_bot_message?: string | null;
  initial_state_name?: string | null;
  initial_language_name?:
    | "Bengali"
    | "Gujarati"
    | "Kannada"
    | "Malayalam"
    | "Tamil"
    | "Telugu"
    | "Punjabi"
    | "Sanskrit"
    | "Odia"
    | "Marathi"
    | "Hindi"
    | "English"
    | "Assamese"
    | null;
}

export interface SarvamAppConfig {
  app_id: string;
  app_version: number;
  app_type?: "agent";
  connection_config: SarvamConnectionConfig;
  agent_variables?: Record<string, any> | null;
  app_overrides?: SarvamAppOverrides | null;
}

export interface SarvamUserConfig {
  user_phone_number: string;
}

export interface SarvamWebhookConfig {
  url: string;
  metadata?: Record<string, any> | null;
}

export interface SarvamInstantOutboundRequest {
  app_config: SarvamAppConfig;
  user_config: SarvamUserConfig;
  webhook_config?: SarvamWebhookConfig | null;
}

export interface SarvamInstantOutboundResponse {
  attempt_id: string;
}

export interface SarvamWebhookPayload {
  attempt_id: string;
  status: "connected" | "no_answer" | "busy" | "failed";
  channel_info: {
    channel_type: "v2v" | "whatsapp" | string;
    channel_provider: string;
    agent_phone_number: string;
  };
  duration: number | null;
  interaction_id: string | null;
  failure_reason: string | null;
  final_agent_variables: Record<string, any> | null;
  webhook_config: {
    url: string;
    metadata: Record<string, any> | null;
  } | null;
  interaction_transcript: Array<{
    role: "agent" | "user";
    en_text: string;
  }> | null;
}
