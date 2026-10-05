import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_AGENT_SETTINGS,
  effectiveInstructions,
  fillTemplate,
  GENERIC_ENQUIRY,
  languageRules,
  sanitizeAgentSettings,
  type AgentSettings,
} from "@/lib/voice/agent-settings";
import { captureBriefing, sanitizeCaptureFields } from "@/lib/voice/capture-fields";
import { localizeGreeting } from "@/lib/voice/localize-greeting";

// How much knowledge one call carries. The limit is about how well, and how fast, the
// agent uses a long prompt, so it can be tuned from the environment while real calls are compared.
const KNOWLEDGE_CHAR_LIMIT = Number(process.env.KNOWLEDGE_CHAR_LIMIT) || 7500;

export type DispatchLeadCallOptions = {
  aiEmployeeId?: string | null;
  customerName?: string;
  phoneNumber: string;
  reason?: string;
  initialBotMessage?: string;
  leadId?: string;
};

export type DispatchLeadCallResult =
  | {
      success: true;
      attemptId?: string;
      businessName: string;
      openingMessage: string;
    }
  | { success: false; error: string };

export type ResolvedContext = {
  businessName: string;
  businessType: string;
  employeeName: string;
  settings: AgentSettings;
  knowledge: string;
  captureBriefing: string;
  /** How the knowledge base fits the per-call limit; null when there is none. */
  knowledgeUsage: KnowledgeUsage | null;
};

export type KnowledgeItemUsage = {
  id: string;
  name: string;
  chars: number;
  // Whether a call carries this item whole, cut off partway, or not at all.
  sent: "all" | "part" | "none";
};

export type KnowledgeUsage = {
  limit: number;
  // Characters a call carries (at most the limit) and what the whole knowledge base would need.
  used: number;
  total: number;
  items: KnowledgeItemUsage[];
};

/**
 * Joins the header and documents into the one block a call carries, cut at the
 * limit, and records how far each document got, so the knowledge meter shows
 * owners exactly what the agent hears.
 */
export function bundleKnowledge(
  header: string[],
  docs: { id: string; name: string; text: string }[],
  limit = KNOWLEDGE_CHAR_LIMIT
): { text: string; usage: KnowledgeUsage } {
  const parts = [...header];
  let length = header.join("\n\n").length;
  const items: KnowledgeItemUsage[] = [];
  docs.forEach((doc, index) => {
    const part = `[Knowledge Item ${index + 1} - ${doc.name}]:\n${doc.text}`;
    const start = length + 2;
    length = start + part.length;
    parts.push(part);
    items.push({
      id: doc.id,
      name: doc.name,
      chars: doc.text.length,
      sent: length <= limit ? "all" : start < limit ? "part" : "none",
    });
  });
  const full = parts.join("\n\n");
  return {
    text: full.slice(0, limit),
    usage: { limit, used: Math.min(full.length, limit), total: full.length, items },
  };
}

/**
 * The business, its settings and its knowledge flattened into one block, since a
 * voice agent takes business facts as prose rather than structured records.
 */
export async function resolveEmployeeContext(aiEmployeeId?: string | null): Promise<ResolvedContext> {
  const context: ResolvedContext = {
    businessName: "Our Business",
    businessType: "Consumer & Commercial Services",
    employeeName: "Voice Agent",
    settings: DEFAULT_AGENT_SETTINGS,
    knowledge: "",
    captureBriefing: "",
    knowledgeUsage: null,
  };

  if (!aiEmployeeId) return context;

  const supabase = createAdminClient();
  if (!supabase) return context;

  const { data: employee } = await supabase
    .from("ai_employees")
    .select("*, businesses(*)")
    .eq("id", aiEmployeeId)
    .single();

  if (!employee) return context;

  context.employeeName = employee.name;
  context.captureBriefing = captureBriefing(sanitizeCaptureFields(employee.capture_fields));
  context.settings = sanitizeAgentSettings(employee.agent_settings);

  const business = (employee as any).businesses;
  if (business) {
    context.businessName = business.name || context.businessName;
    context.businessType = business.industry || context.businessType;
  }

  const businessId = employee.business_id;
  // Oldest first, so which item a full knowledge base cuts off is predictable: the newest.
  let docQuery = supabase
    .from("knowledge_documents")
    .select("id, name, raw_text")
    .order("created_at", { ascending: true });

  docQuery = businessId
    ? docQuery.or(`business_id.eq.${businessId},ai_employee_id.eq.${aiEmployeeId}`)
    : docQuery.eq("ai_employee_id", aiEmployeeId);

  const { data: docs } = await docQuery;
  if (!docs?.length) return context;

  const header: string[] = [
    "BUSINESS OVERVIEW:",
    `Company Name: ${context.businessName}`,
    `Representative AI: ${context.employeeName}`,
    `Business Category: ${context.businessType}`,
    "\nVERIFIED BUSINESS FACTS, PRODUCTS & PRICING (FROM DATABASE):",
  ];

  const items = docs
    .map((doc) => ({
      id: doc.id,
      name: doc.name,
      // Seeded rupee amounts lost their symbol upstream and read as "n1,200" to the agent.
      text: doc.raw_text?.replace(/\bn(\d{1,3}(?:,\d{2,3})*(?:\.\d+)?)\b/g, "₹$1").trim() ?? "",
    }))
    .filter((doc) => doc.text);

  const { text, usage } = bundleKnowledge(header, items);
  context.knowledge = text;
  context.knowledgeUsage = usage;
  return context;
}

export type CallBrief = {
  /** Every {{variable}} value for this call: built-ins win over the owner's custom ones. */
  values: Record<string, string>;
  knowledge: string;
  greeting: string;
  /** The full instructions with every variable filled, as the agent should read them. */
  instructions: string;
  /** The language settings spelled out, since providers only take a starting language. */
  languageRules: string;
};

/**
 * Everything the agent is told for one call, in provider-neutral form. Real calls,
 * the test chat and automated tests all use this, so a test sees exactly what a
 * call would.
 */
export function buildCallBrief(
  context: ResolvedContext,
  lead: { name: string; phone: string; reason?: string },
  greetingOverride?: string
): CallBrief {
  const facts =
    context.knowledge ||
    `Business Name: ${context.businessName}\nRepresentative: ${context.employeeName}\nType: ${context.businessType}\nRole: Sales, Lead Inquiries, and Customer Support.`;
  const knowledge = [facts, context.captureBriefing].filter(Boolean).join("\n\n");

  const custom = Object.fromEntries(context.settings.variables.map((v) => [v.key, v.value]));
  const values: Record<string, string> = {
    ...custom,
    business_name: context.businessName,
    business_type: context.businessType,
    business_description: knowledge,
    lead_name: lead.name,
    lead_phone: lead.phone,
    preferred_language: context.settings.startingLanguage,
    lead_enquiry: lead.reason || GENERIC_ENQUIRY,
    interested_product: "Services & Products from catalog",
  };

  return {
    values,
    knowledge,
    greeting: fillTemplate(greetingOverride || context.settings.greeting, values),
    instructions: fillTemplate(effectiveInstructions(context.settings), values),
    languageRules: languageRules(context.settings),
  };
}

/** The brief with its greeting translated into the starting language, as the caller will hear it. */
export async function prepareCallBrief(
  context: ResolvedContext,
  lead: { name: string; phone: string; reason?: string },
  greetingOverride?: string
): Promise<CallBrief> {
  const brief = buildCallBrief(context, lead, greetingOverride);
  return { ...brief, greeting: await localizeGreeting(brief.greeting, context.settings.startingLanguage) };
}

/**
 * Why no call goes out. Sarvam was removed on 2026-10-05 and Cartesia is not connected
 * yet, so every lead is saved, recorded as a call failure for the staff alerts, and left
 * "new" for the owner to call by hand.
 */
export const NO_VOICE_PROVIDER =
  "No voice provider is connected yet, so no call was placed. Calls start once Cartesia is set up.";

export async function dispatchLeadCall(
  options: DispatchLeadCallOptions
): Promise<DispatchLeadCallResult> {
  if (!options.phoneNumber) {
    return { success: false, error: "Phone number is required to place a voice call." };
  }

  // The provider takes the brief from prepareCallBrief(resolveEmployeeContext(...)) and
  // returns its call id; its webhook hands results to recordCallResult in call-result.ts.
  return { success: false, error: NO_VOICE_PROVIDER };
}
