import { BUILT_IN_VARIABLES, fillTemplate, type AgentSettings } from "@/lib/voice/agent-settings";
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
];

export function toSarvamOverrides(
  settings: AgentSettings,
  greeting: string
): Pick<SarvamAppOverrides, "initial_bot_message" | "initial_language_name"> {
  return {
    initial_bot_message: greeting,
    // Our language names are the same strings as Sarvam's enum.
    initial_language_name: settings.startingLanguage,
  };
}

/**
 * Only the variables the Sarvam canvas defines are sent; custom variables are
 * already filled into the greeting and instructions on our side. The canvas
 * prompt is generic, so an owner's own instructions travel inside
 * business_description, ahead of the knowledge, and take priority.
 */
export function toSarvamVariables(brief: CallBrief, settings: AgentSettings): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const { key } of BUILT_IN_VARIABLES) vars[key] = brief.values[key] ?? "";

  if (settings.instructions.trim()) {
    // Filled again without the knowledge, so a {{business_description}} in the
    // owner's text does not paste the knowledge in twice.
    const instructions = fillTemplate(settings.instructions, {
      ...brief.values,
      business_description: "the business knowledge below",
    });
    vars.business_description = [
      "INSTRUCTIONS FROM THE BUSINESS (follow these over any general guidance):",
      instructions,
      "BUSINESS KNOWLEDGE:",
      brief.knowledge,
    ].join("\n\n");
  }

  return vars;
}
