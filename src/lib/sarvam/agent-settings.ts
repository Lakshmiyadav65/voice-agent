import { GENERIC_ENQUIRY } from "@/lib/voice/agent-settings";
import type { CallBrief } from "@/lib/voice/dispatch-lead-call";

/**
 * Maps a call onto Sarvam. Agents are trained only in Sarvam's console (prompt,
 * greeting, language, voice, tools), so a call sends nothing that would change
 * how the agent behaves: just this lead's details and the knowledge base, under
 * the names Sarvam's agent builder gives them. Replacing the provider means
 * rewriting this file.
 *
 * The knowledge travels in business_description, so an agent only uses it if
 * its Sarvam prompt includes @business_description. Empty values are left out,
 * since sending one would blank the default the agent has in Sarvam.
 */
export function toSarvamVariables(brief: CallBrief): Record<string, string> {
  const v = brief.values;
  const vars: Record<string, string> = {
    business_name: v.business_name,
    business_type: v.business_type,
    business_description: brief.knowledge,
    lead_name: v.lead_name,
    lead_phone: v.lead_phone,
    lead_enquiry: v.lead_enquiry,
    interested_product: v.interested_product,
    customer_name: v.lead_name,
    interested_in: v.lead_enquiry === GENERIC_ENQUIRY ? "" : v.lead_enquiry,
  };
  return Object.fromEntries(Object.entries(vars).filter(([, value]) => value?.trim()));
}
