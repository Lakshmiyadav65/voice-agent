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
export type AgentVariable = { key: string; value: string; description: string };
export type ToolParam = { name: string; description: string; required: boolean };
export type AgentTool = {
  name: string;
  whenToUse: string;
  method: "GET" | "POST";
  url: string;
  params: ToolParam[];
};
export type Pronunciation = { language: AgentLanguage; word: string; sayAs: string };

export type AgentSettings = {
  // Instructions: empty means the platform's standard instructions.
  instructions: string;
  variables: AgentVariable[];
  tools: AgentTool[];
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
  instructions: 8000,
  variables: 20,
  tools: 10,
  toolParams: 10,
} as const;

/**
 * Values every call fills in automatically. Custom variables cannot reuse these
 * names, so an owner never shadows the lead's name with a fixed value.
 */
export const BUILT_IN_VARIABLES: { key: string; description: string }[] = [
  { key: "business_name", description: "Your business name" },
  { key: "business_type", description: "Your business category" },
  { key: "business_description", description: "Everything the agent learned from your knowledge base" },
  { key: "lead_name", description: "The name of the person being called" },
  { key: "lead_phone", description: "Their phone number" },
  { key: "preferred_language", description: "The starting language from Settings" },
  { key: "lead_enquiry", description: "What they asked about in the form or ad" },
  { key: "interested_product", description: "The product or service they are interested in" },
];

/** The standard instructions every agent starts from; owners can rewrite them. */
export const DEFAULT_INSTRUCTIONS = `You are an AI voice sales and customer-engagement assistant for {{business_name}}.
Your role is to call leads on behalf of the business, understand their requirements, answer questions using the business's knowledge, qualify the lead, and record the outcome of the conversation.

CONVERSATION OBJECTIVE
- Politely introduce yourself and the business, and confirm you are speaking with {{lead_name}}.
- Ask whether it is a convenient time to talk.
- Understand the reason for their enquiry ({{lead_enquiry}}) and ask one question at a time about their needs.
- Answer questions using only the business knowledge. Never invent prices, offers, availability or policies; if you do not know, say so and offer a callback from the team.
- Qualify the lead as HOT, WARM, COLD or NOT INTERESTED and agree the next step.

STYLE
- Speak naturally and professionally, keep replies short, and do not repeat questions already answered.
- Use the customer's preferred language ({{preferred_language}}) and follow them if they switch.
- If asked, say clearly that you are an AI assistant calling on behalf of {{business_name}}.
- If they are not interested, do not pressure them; thank them and end the call politely.`;

export const DEFAULT_GREETING =
  "Hello! I am calling from {{business_name}} regarding your recent inquiry. Am I speaking with {{lead_name}}?";

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  instructions: "",
  variables: [],
  tools: [],
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

export function keyFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

function sanitizeVariables(value: unknown): AgentVariable[] {
  if (!Array.isArray(value)) return [];
  const reserved = new Set(BUILT_IN_VARIABLES.map((v) => v.key));
  const seen = new Set<string>();
  const out: AgentVariable[] = [];
  for (const item of value) {
    const v = obj(item);
    const key = keyFromName(typeof v.key === "string" ? v.key : "");
    if (!key || reserved.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, value: text(v.value, ""), description: text(v.description, "").slice(0, 160) });
    if (out.length === LIMITS.variables) break;
  }
  return out;
}

function sanitizeTools(value: unknown): AgentTool[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: AgentTool[] = [];
  for (const item of value) {
    const t = obj(item);
    const name = keyFromName(typeof t.name === "string" ? t.name : "");
    const url = text(t.url, "").slice(0, 500);
    // Only public https endpoints: a tool URL is called by the voice provider, never by us.
    if (!name || seen.has(name) || !/^https:\/\/[^\s/]+\.[^\s]+$/i.test(url)) continue;
    seen.add(name);
    const params = Array.isArray(t.params)
      ? t.params
          .map((p) => {
            const raw = obj(p);
            return {
              name: keyFromName(typeof raw.name === "string" ? raw.name : ""),
              description: text(raw.description, "").slice(0, 160),
              required: bool(raw.required, false),
            };
          })
          .filter((p) => p.name)
          .slice(0, LIMITS.toolParams)
      : [];
    out.push({
      name,
      whenToUse: text(t.whenToUse, ""),
      method: t.method === "GET" ? "GET" : "POST",
      url,
      params,
    });
    if (out.length === LIMITS.tools) break;
  }
  return out;
}

/**
 * The language settings as plain rules. Providers that only take a starting
 * language would otherwise ignore the allowed set and the switch toggle, so
 * every call and every simulation carries these words.
 */
export function languageRules(settings: AgentSettings): string {
  const start = settings.startingLanguage;
  const others = settings.allowedLanguages.filter((l) => l !== start);
  if (settings.switchLanguageDuringCall && others.length) {
    return `Open the call in ${start} and keep speaking ${start}. If the caller speaks ${others.join(" or ")}, switch to that language. Never reply in any other language; if the caller uses one, continue in ${start}.`;
  }
  return `Speak only ${start} for the whole call, from the first word to the last, even if the caller uses another language.`;
}

/** The instructions the agent actually follows: the owner's own, or the standard ones. */
export function effectiveInstructions(settings: AgentSettings): string {
  return settings.instructions.trim() || DEFAULT_INSTRUCTIONS;
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

  const instructions =
    typeof raw.instructions === "string" ? raw.instructions.trim().slice(0, LIMITS.instructions) : "";

  return {
    // Saving the standard text unchanged stays "standard", so later improvements reach it.
    instructions: instructions === DEFAULT_INSTRUCTIONS ? "" : instructions,
    variables: sanitizeVariables(raw.variables),
    tools: sanitizeTools(raw.tools),
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

/**
 * Applies a partial edit. Grouped settings (nudges, voicemail...) merge one level
 * deep so changing one part of a group keeps the rest; lists replace whole.
 */
export function mergeAgentSettings(current: AgentSettings, changes: unknown): AgentSettings {
  const patch = obj(changes);
  const merged: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    const existing = (current as Record<string, unknown>)[key];
    merged[key] =
      existing && typeof existing === "object" && !Array.isArray(existing) && value && typeof value === "object" && !Array.isArray(value)
        ? { ...existing, ...value }
        : value;
  }
  return sanitizeAgentSettings(merged);
}
