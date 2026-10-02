import { effectiveInstructions, type AgentSettings } from "@/lib/voice/agent-settings";
import { composeBriefing } from "@/lib/voice/briefing";
import type { CallBrief } from "@/lib/voice/dispatch-lead-call";

/**
 * Maps our provider-neutral agent onto Dograh. Dograh fills {{variables}} in its
 * node prompts from the initial_context sent with each call. A client's own
 * agent, built in Dograh, uses whichever of these it references ({{lead_name}},
 * {{lead_enquiry}}, {{business_name}}...). The shared default agent is a thin
 * shell whose Start node prompt is only {{agent_prompt}} and greeting only
 * {{greeting_text}}, so it runs entirely on what was set up here. Nothing is
 * forced on an agent: unused variables are simply ignored.
 */
export function toDograhContext(
  brief: CallBrief,
  settings: AgentSettings,
  extra: { leadId?: string }
): Record<string, unknown> {
  return {
    ...brief.values,
    agent_prompt: composeBriefing(brief, effectiveInstructions(settings)),
    // A variable rather than Dograh's greeting_override, which would replace a
    // client agent's own greeting, and which Dograh ignores when it arrives by
    // pre-call fetch anyway.
    greeting_text: brief.greeting,
    ...(extra.leadId ? { lead_id: extra.leadId } : {}),
  };
}
