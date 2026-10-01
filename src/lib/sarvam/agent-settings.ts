import type { AgentSettings } from "@/lib/voice/agent-settings";
import type { SarvamAppOverrides } from "./types";

/**
 * Maps our provider-neutral settings onto Sarvam. Sarvam's outbound API only
 * accepts the opening line and starting language per call; everything else
 * (voice, speed, nudges, voicemail...) is fixed on the agent in the Sarvam
 * console and has no API-key route to change it. Replacing the provider means
 * rewriting this file, not the settings.
 */

/** Settings keys that reach a live call through this provider today. */
export const SARVAM_PER_CALL_SETTINGS: ReadonlyArray<keyof AgentSettings> = ["greeting", "startingLanguage"];

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
