/**
 * How an AI employee sounds and behaves on a call. This is our own shape, not
 * any provider's: the editor, the API and the call dispatcher share it, and each
 * voice provider maps whatever it supports (see src/lib/sarvam/agent-settings.ts).
 * Switching providers means writing a new mapping, never migrating these settings.
 */

export const AGENT_LANGUAGES = [
  "English",
  "Hindi",
  "Telugu",
  "Tamil",
  "Kannada",
  "Malayalam",
  "Marathi",
  "Bengali",
  "Gujarati",
  "Punjabi",
  "Odia",
] as const;

export type AgentLanguage = (typeof AGENT_LANGUAGES)[number];

/** Voice ids are lowercase, matching the Bulbul v3 catalogue the current provider uses. */
export const AGENT_VOICES = [
  "shubh", "aditya", "ritu", "priya", "neha", "rahul", "pooja", "rohan", "simran",
  "kavya", "amit", "dev", "ishita", "shreya", "ratan", "varun", "manan", "sumit",
  "roopa", "kabir", "aayan", "ashutosh", "advait", "anand", "tanya", "tarun",
  "sunny", "mani", "gokul", "vijay", "shruti", "suhani", "mohit", "kavitha",
  "rehan", "soham", "rupali",
] as const;

export type Eagerness = "patient" | "balanced" | "eager";
export type SoundSensitivity = "low" | "medium" | "high";
export type SwitchAfter = "quick" | "balanced" | "patient";
export type BackgroundSound = "none" | "quiet_office" | "call_center" | "city_traffic";

export const BACKGROUND_SOUND_LABELS: Record<BackgroundSound, string> = {
  none: "No sound",
  quiet_office: "Quiet office",
  call_center: "Call center",
  city_traffic: "City traffic",
};

export type Nudge = { text: string; afterSeconds: number };
export type Pronunciation = { language: AgentLanguage; word: string; sayAs: string };

export type AgentSettings = {
  greeting: string;
  // Speaking
  voice: string;
  perLanguageVoices: { enabled: boolean; voices: Partial<Record<AgentLanguage, string>> };
  speakingSpeed: number;
  pitch: number;
  pronunciations: Pronunciation[];
  // Thinking
  temperature: number;
  // Listening
  allowInterruptions: boolean;
  eagerness: Eagerness;
  soundSensitivity: SoundSensitivity;
  // Environment
  backgroundSound: BackgroundSound;
  backgroundVolume: number;
  // Language
  startingLanguage: AgentLanguage;
  allowedLanguages: AgentLanguage[];
  switchLanguageDuringCall: boolean;
  autoDetectLanguage: boolean;
  switchAfter: SwitchAfter;
  indicNumbers: boolean;
  // In-call actions
  nudges: { enabled: boolean; messages: Nudge[]; hangUpAfter: boolean };
  voicemail: { enabled: boolean; message: string };
  callForwarding: { enabled: boolean; number: string };
  maxCallMinutes: number;
};

export const LIMITS = {
  speakingSpeed: { min: 0.5, max: 2, step: 0.05 },
  pitch: { min: -0.75, max: 0.75, step: 0.05 },
  temperature: { min: 0.1, max: 0.9, step: 0.1 },
  backgroundVolume: { min: 0, max: 1, step: 0.05 },
  nudgeSeconds: { min: 2, max: 60 },
  maxCallMinutes: { min: 1, max: 60 },
  nudges: 5,
  pronunciations: 200,
  text: 300,
} as const;

export const DEFAULT_GREETING =
  "Hello! I am calling from {{business_name}} regarding your recent inquiry. Am I speaking with {{lead_name}}?";

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  greeting: DEFAULT_GREETING,
  voice: "shubh",
  perLanguageVoices: { enabled: false, voices: {} },
  speakingSpeed: 1,
  pitch: 0,
  pronunciations: [],
  temperature: 0.3,
  allowInterruptions: true,
  eagerness: "balanced",
  soundSensitivity: "medium",
  backgroundSound: "quiet_office",
  backgroundVolume: 0.3,
  startingLanguage: "English",
  allowedLanguages: ["English", "Hindi", "Telugu"],
  switchLanguageDuringCall: true,
  autoDetectLanguage: true,
  switchAfter: "quick",
  indicNumbers: true,
  nudges: {
    enabled: true,
    messages: [{ text: "Hey, are you still on the call?", afterSeconds: 5 }],
    hangUpAfter: true,
  },
  voicemail: {
    enabled: true,
    message: "Hey, seems like I have reached your voicemail. I shall call you back at a later time.",
  },
  callForwarding: { enabled: false, number: "" },
  maxCallMinutes: 15,
};

function isLanguage(value: unknown): value is AgentLanguage {
  return typeof value === "string" && (AGENT_LANGUAGES as readonly string[]).includes(value);
}

function isVoice(value: unknown): value is string {
  return typeof value === "string" && (AGENT_VOICES as readonly string[]).includes(value);
}

function oneOf<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return typeof value === "string" && (options as readonly string[]).includes(value) ? (value as T) : fallback;
}

function num(value: unknown, range: { min: number; max: number }, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(Math.min(range.max, Math.max(range.min, n)) * 100) / 100;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" ? value.trim().slice(0, LIMITS.text) : fallback;
}

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/**
 * Fills gaps with defaults and clamps everything into range, so stored JSON from
 * any era (or a hand-edited request) is always safe to hand to a provider.
 */
export function sanitizeAgentSettings(value: unknown): AgentSettings {
  const raw = obj(value);
  const d = DEFAULT_AGENT_SETTINGS;

  const allowed = Array.isArray(raw.allowedLanguages)
    ? [...new Set(raw.allowedLanguages.filter(isLanguage))]
    : d.allowedLanguages;
  const startingLanguage = isLanguage(raw.startingLanguage) ? raw.startingLanguage : d.startingLanguage;
  // The agent must be allowed to speak the language it opens in.
  const allowedLanguages = allowed.includes(startingLanguage) ? allowed : [startingLanguage, ...allowed];

  const plv = obj(raw.perLanguageVoices);
  const voiceMap: Partial<Record<AgentLanguage, string>> = {};
  for (const [lang, voice] of Object.entries(obj(plv.voices))) {
    if (isLanguage(lang) && isVoice(voice)) voiceMap[lang] = voice;
  }

  const pronunciations: Pronunciation[] = [];
  const seen = new Set<string>();
  if (Array.isArray(raw.pronunciations)) {
    for (const item of raw.pronunciations) {
      const p = obj(item);
      const word = text(p.word, "").slice(0, 100);
      const sayAs = text(p.sayAs, "").slice(0, 200);
      const language = isLanguage(p.language) ? p.language : "English";
      const key = `${language}:${word.toLowerCase()}`;
      if (!word || !sayAs || seen.has(key)) continue;
      seen.add(key);
      pronunciations.push({ language, word, sayAs });
      if (pronunciations.length === LIMITS.pronunciations) break;
    }
  }

  const nudgesRaw = obj(raw.nudges);
  const messages = Array.isArray(nudgesRaw.messages)
    ? nudgesRaw.messages
        .map((m) => {
          const n = obj(m);
          return { text: text(n.text, ""), afterSeconds: Math.round(num(n.afterSeconds, LIMITS.nudgeSeconds, 5)) };
        })
        .filter((m) => m.text)
        .slice(0, LIMITS.nudges)
    : d.nudges.messages;

  const voicemail = obj(raw.voicemail);
  const forwarding = obj(raw.callForwarding);
  const forwardNumber = text(forwarding.number, "").replace(/[^\d+]/g, "").slice(0, 16);

  return {
    greeting: text(raw.greeting, d.greeting) || d.greeting,
    voice: isVoice(raw.voice) ? raw.voice : d.voice,
    perLanguageVoices: { enabled: bool(plv.enabled, d.perLanguageVoices.enabled), voices: voiceMap },
    speakingSpeed: num(raw.speakingSpeed, LIMITS.speakingSpeed, d.speakingSpeed),
    pitch: num(raw.pitch, LIMITS.pitch, d.pitch),
    pronunciations,
    temperature: num(raw.temperature, LIMITS.temperature, d.temperature),
    allowInterruptions: bool(raw.allowInterruptions, d.allowInterruptions),
    eagerness: oneOf(raw.eagerness, ["patient", "balanced", "eager"], d.eagerness),
    soundSensitivity: oneOf(raw.soundSensitivity, ["low", "medium", "high"], d.soundSensitivity),
    backgroundSound: oneOf(
      raw.backgroundSound,
      Object.keys(BACKGROUND_SOUND_LABELS) as BackgroundSound[],
      d.backgroundSound
    ),
    backgroundVolume: num(raw.backgroundVolume, LIMITS.backgroundVolume, d.backgroundVolume),
    startingLanguage,
    allowedLanguages,
    switchLanguageDuringCall: bool(raw.switchLanguageDuringCall, d.switchLanguageDuringCall),
    autoDetectLanguage: bool(raw.autoDetectLanguage, d.autoDetectLanguage),
    switchAfter: oneOf(raw.switchAfter, ["quick", "balanced", "patient"], d.switchAfter),
    indicNumbers: bool(raw.indicNumbers, d.indicNumbers),
    nudges: {
      enabled: bool(nudgesRaw.enabled, d.nudges.enabled),
      messages,
      hangUpAfter: bool(nudgesRaw.hangUpAfter, d.nudges.hangUpAfter),
    },
    voicemail: {
      enabled: bool(voicemail.enabled, d.voicemail.enabled),
      message: text(voicemail.message, d.voicemail.message) || d.voicemail.message,
    },
    callForwarding: {
      // Forwarding with nowhere to forward to is meaningless, so it switches itself off.
      enabled: bool(forwarding.enabled, d.callForwarding.enabled) && forwardNumber.length >= 10,
      number: forwardNumber,
    },
    maxCallMinutes: Math.round(num(raw.maxCallMinutes, LIMITS.maxCallMinutes, d.maxCallMinutes)),
  };
}

/** Replaces {{name}} placeholders; unknown ones are left in place so mistakes stay visible. */
export function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => values[key] ?? match);
}
