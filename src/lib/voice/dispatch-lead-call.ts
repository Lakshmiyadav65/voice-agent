import { createAdminClient } from "@/lib/supabase/admin";
import { triggerLeadCall } from "@/lib/sarvam/client";
import { toSarvamVariables } from "@/lib/sarvam/agent-settings";
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

const KNOWLEDGE_CHAR_LIMIT = 7500;

export type DispatchLeadCallOptions = {
  aiEmployeeId?: string | null;
  customerName?: string;
  phoneNumber: string;
  reason?: string;
  initialBotMessage?: string;
  initialStateName?: string;
  leadId?: string;
  agentVariables?: Record<string, any>;
  webhookUrl?: string;
  triggeredBy?: string;
};

export type DispatchLeadCallResult =
  | { success: true; attemptId?: string; businessName: string; openingMessage: string }
  | { success: false; error: string };

export type ResolvedContext = {
  /** The client's own Sarvam agent, trained by staff in Sarvam's console; null uses SARVAM_AGENT_ID. */
  sarvamAgentId: string | null;
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
 * Sarvam receives business facts as a single prose blob, so knowledge documents
 * are flattened rather than passed as structured records.
 */
export async function resolveEmployeeContext(aiEmployeeId?: string | null): Promise<ResolvedContext> {
  const context: ResolvedContext = {
    sarvamAgentId: null,
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
  // Absent until the phase 14 migration is applied; calls then use the shared agent.
  context.sarvamAgentId = employee.sarvam_agent_id ?? null;
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

export async function dispatchLeadCall(
  options: DispatchLeadCallOptions
): Promise<DispatchLeadCallResult> {
  const customerName = options.customerName?.trim() || "Valued Customer";

  if (!options.phoneNumber) {
    return { success: false, error: "Phone number is required to place a voice call." };
  }

  const context = await resolveEmployeeContext(options.aiEmployeeId);

  const brief = await prepareCallBrief(
    context,
    { name: customerName, phone: options.phoneNumber, reason: options.reason },
    options.initialBotMessage
  );
  const openingMessage = brief.greeting;

  const result = await placeSarvamCall(options, context, brief, customerName);

  if (!result.success) {
    return { success: false, error: result.error || "Failed to trigger voice call" };
  }

  return {
    success: true,
    attemptId: result.attemptId,
    businessName: context.businessName,
    openingMessage,
  };
}

async function placeSarvamCall(
  options: DispatchLeadCallOptions,
  context: ResolvedContext,
  brief: CallBrief,
  customerName: string
) {
  return triggerLeadCall({
    agentId: context.sarvamAgentId ?? undefined,
    customerName,
    phoneNumber: options.phoneNumber,
    reason: options.reason,
    agentVariables: {
      ...toSarvamVariables(brief),
      ...(options.agentVariables || {}),
    },
    // The agent's own greeting and language from Sarvam's console, unless this call asks for a greeting.
    initialBotMessage: options.initialBotMessage ? brief.greeting : undefined,
    initialStateName: options.initialStateName,
    webhookUrl: options.webhookUrl,
    metadata: {
      ...(options.leadId ? { lead_id: options.leadId } : {}),
      ...(options.triggeredBy ? { triggered_by: options.triggeredBy } : {}),
      // Echoed back by Sarvam so the webhook can reject forged posts.
      ...(process.env.SARVAM_WEBHOOK_SECRET
        ? { webhook_secret: process.env.SARVAM_WEBHOOK_SECRET }
        : {}),
    },
  });
}
