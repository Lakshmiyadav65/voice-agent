import {
  DEFAULT_AGENT_SETTINGS,
  DEFAULT_GREETING,
  GENERIC_ENQUIRY,
  type AgentSettings,
} from "@/lib/voice/agent-settings";
import { composeBriefing } from "@/lib/voice/briefing";
import type { CallBrief } from "@/lib/voice/dispatch-lead-call";
import type { SarvamAppOverrides } from "./types";

/**
 * Maps our provider-neutral agent onto Sarvam. Sarvam's outbound API accepts the
 * opening line, starting language and the variables already defined on its
 * canvas; everything else (voice, speed, nudges, voicemail, tools...) is fixed on
 * the agent in the Sarvam console with no API-key route to change it. Replacing
 * the provider means rewriting this file, not the settings.
 */

/** Settings keys that reach a live call through this provider today. */
export const SARVAM_PER_CALL_SETTINGS: ReadonlyArray<keyof AgentSettings> = [
  "instructions",
  "variables",
  "greeting",
  "startingLanguage",
  "allowedLanguages",
  "switchLanguageDuringCall",
];

/*
 * Agents are trained in Sarvam's console, so an agent keeps its own greeting and
 * language unless someone changed them on our platform: sending our defaults would
 * replace, say, a Telugu agent's own intro with our English one.
 */
function greetingChanged(settings: AgentSettings): boolean {
  return settings.greeting.trim() !== DEFAULT_GREETING;
}

function languageChanged(settings: AgentSettings): boolean {
  const d = DEFAULT_AGENT_SETTINGS;
  const sameLanguages = [...settings.allowedLanguages].sort().join() === [...d.allowedLanguages].sort().join();
  return (
    settings.startingLanguage !== d.startingLanguage ||
    settings.switchLanguageDuringCall !== d.switchLanguageDuringCall ||
    !sameLanguages
  );
}

export function toSarvamOverrides(
  settings: AgentSettings,
  greeting: string
): Pick<SarvamAppOverrides, "initial_bot_message" | "initial_language_name"> {
  return {
    ...(greetingChanged(settings) ? { initial_bot_message: greeting } : {}),
    // Our language names are the same strings as Sarvam's enum.
    ...(languageChanged(settings) ? { initial_language_name: settings.startingLanguage } : {}),
  };
}

/**
 * Every value the agent might use: the built-ins (knowledge, instructions and any
 * changed language rules travel in business_description), the owner's custom
 * variables (e.g. project_name for an agent whose facts are variables), and the
 * lead under the names Sarvam's agent builder gives them. Empty values are left
 * out, since sending one would blank the default the agent has in Sarvam.
 */
export function toSarvamVariables(brief: CallBrief, settings: AgentSettings): Record<string, string> {
  const language = languageChanged(settings);
  const vars: Record<string, string> = {
    ...brief.values,
    business_description: composeBriefing(brief, settings.instructions, language),
    customer_name: brief.values.lead_name,
    interested_in: brief.values.lead_enquiry === GENERIC_ENQUIRY ? "" : brief.values.lead_enquiry,
  };
  if (!language) delete vars.preferred_language;
  return Object.fromEntries(Object.entries(vars).filter(([, value]) => value?.trim()));
}
