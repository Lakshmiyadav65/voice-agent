import { NextResponse } from "next/server";

import { getSessionContext } from "@/lib/auth/session";
import { synthesize } from "@/lib/sarvam/tts";
import { AGENT_LANGUAGES, AGENT_VOICES, LIMITS, type AgentLanguage } from "@/lib/voice/agent-settings";
import { VOICE_SAMPLES } from "@/lib/voice/voice-samples";

// Previews are a fixed line per voice, language and speed, so each one is paid for once per server.
const cache = new Map<string, Buffer>();
const MAX_CACHED = 300;

function wavResponse(wav: Buffer) {
  return new NextResponse(new Uint8Array(wav), {
    headers: { "Content-Type": "audio/wav", "Cache-Control": "private, max-age=86400" },
  });
}

export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const voice = (AGENT_VOICES as readonly string[]).includes(body?.voice) ? (body.voice as string) : null;
  const language = (AGENT_LANGUAGES as readonly string[]).includes(body?.language)
    ? (body.language as AgentLanguage)
    : "English";
  if (!voice) return NextResponse.json({ error: "Unknown voice." }, { status: 400 });

  const raw = Number(body?.pace);
  const { min, max } = LIMITS.speakingSpeed;
  // Rounded so slider nudges reuse the same cached clip.
  const pace = Number.isFinite(raw) ? Math.round(Math.min(max, Math.max(min, raw)) * 10) / 10 : 1;

  const key = `${voice}|${language}|${pace}`;
  const hit = cache.get(key);
  if (hit) return wavResponse(hit);

  const result = await synthesize({ text: VOICE_SAMPLES[language], voice, language, pace });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error === "not_configured" ? "not_configured" : result.error },
      { status: result.status }
    );
  }

  if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value!);
  cache.set(key, result.wav);
  return wavResponse(result.wav);
}
