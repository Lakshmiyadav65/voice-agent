import { createAdminClient } from "@/lib/supabase/admin";
import { triggerLeadCall } from "@/lib/sarvam/client";
import { toSarvamOverrides, toSarvamVariables } from "@/lib/sarvam/agent-settings";
import {
  DEFAULT_AGENT_SETTINGS,
  effectiveInstructions,
  fillTemplate,
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
};

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
  let docQuery = supabase
    .from("knowledge_documents")
    .select("name, summary, raw_text, source_type, metadata");

  docQuery = businessId
    ? docQuery.or(`business_id.eq.${businessId},ai_employee_id.eq.${aiEmployeeId}`)
    : docQuery.eq("ai_employee_id", aiEmployeeId);

  const { data: docs } = await docQuery;
  if (!docs?.length) return context;

  const sections: string[] = [
    "BUSINESS OVERVIEW:",
    `Company Name: ${context.businessName}`,
    `Representative AI: ${context.employeeName}`,
    `Business Category: ${context.businessType}`,
    "\nVERIFIED BUSINESS FACTS, PRODUCTS & PRICING (FROM DATABASE):",
  ];

  docs.forEach((doc, index) => {
    // Seeded rupee amounts lost their symbol upstream and read as "n1,200" to the agent.
    const text = doc.raw_text?.replace(/\bn(\d{1,3}(?:,\d{2,3})*(?:\.\d+)?)\b/g, "₹$1").trim();
    if (text) {
      sections.push(`[Knowledge Item ${index + 1} - ${doc.name}]:\n${text}`);
    }
  });

  context.knowledge = sections.join("\n\n").slice(0, KNOWLEDGE_CHAR_LIMIT);
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
    lead_enquiry: lead.reason || "Inquiry regarding services and pricing",
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
  const overrides = toSarvamOverrides(context.settings, brief.greeting);

  return triggerLeadCall({
    agentId: context.sarvamAgentId ?? undefined,
    customerName,
    phoneNumber: options.phoneNumber,
    reason: options.reason,
    agentVariables: {
      ...toSarvamVariables(brief, context.settings),
      ...(options.agentVariables || {}),
    },
    initialBotMessage: overrides.initial_bot_message ?? brief.greeting,
    initialStateName: options.initialStateName,
    initialLanguage: overrides.initial_language_name,
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
