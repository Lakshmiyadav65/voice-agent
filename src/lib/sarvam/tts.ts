import type { AgentLanguage } from "@/lib/voice/agent-settings";

/**
 * Sarvam's speech API (Bulbul), used for voice previews. It is a different
 * product from Voice Agents and takes its own key: the Voice Agents key is
 * rejected here, so this reads SARVAM_TTS_API_KEY.
 */

const TTS_URL = "https://api.sarvam.ai/text-to-speech";

const LANGUAGE_CODES: Record<AgentLanguage, string> = {
  English: "en-IN",
  Hindi: "hi-IN",
  Telugu: "te-IN",
  Tamil: "ta-IN",
  Kannada: "kn-IN",
  Malayalam: "ml-IN",
  Marathi: "mr-IN",
  Bengali: "bn-IN",
  Gujarati: "gu-IN",
  Punjabi: "pa-IN",
  Odia: "od-IN",
};

export function isTtsConfigured(): boolean {
  return Boolean(process.env.SARVAM_TTS_API_KEY?.trim());
}

export type TtsResult = { ok: true; wav: Buffer } | { ok: false; status: number; error: string };

export async function synthesize(options: {
  text: string;
  voice: string;
  language: AgentLanguage;
  pace: number;
}): Promise<TtsResult> {
  const key = process.env.SARVAM_TTS_API_KEY?.trim();
  if (!key) return { ok: false, status: 503, error: "not_configured" };

  try {
    const res = await fetch(TTS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-subscription-key": key },
      body: JSON.stringify({
        text: options.text,
        target_language_code: LANGUAGE_CODES[options.language],
        speaker: options.voice,
        model: "bulbul:v3",
        pace: options.pace,
      }),
    });
    const data = await res.json().catch(() => null);
    const audio = data?.audios?.[0];
    if (!res.ok || typeof audio !== "string") {
      return { ok: false, status: 502, error: data?.error?.message ?? `Speech service error (${res.status})` };
    }
    return { ok: true, wav: Buffer.from(audio, "base64") };
  } catch (err) {
    return { ok: false, status: 502, error: (err as Error).message || "Speech service unreachable" };
  }
}
