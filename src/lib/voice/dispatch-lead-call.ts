import { createAdminClient } from "@/lib/supabase/admin";
import { triggerLeadCall } from "@/lib/sarvam/client";

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

type ResolvedContext = {
  businessName: string;
  businessType: string;
  employeeName: string;
  employeeLanguage: string;
  knowledge: string;
};

/**
 * Sarvam receives business facts as a single prose blob, so knowledge documents
 * are flattened rather than passed as structured records.
 */
async function resolveEmployeeContext(aiEmployeeId?: string | null): Promise<ResolvedContext> {
  const context: ResolvedContext = {
    businessName: "Our Business",
    businessType: "Consumer & Commercial Services",
    employeeName: "Voice Agent",
    employeeLanguage: "English",
    knowledge: "",
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
  context.employeeLanguage = (employee as any).language || context.employeeLanguage;

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

export async function dispatchLeadCall(
  options: DispatchLeadCallOptions
): Promise<DispatchLeadCallResult> {
  const customerName = options.customerName?.trim() || "Valued Customer";

  if (!options.phoneNumber) {
    return { success: false, error: "Phone number is required to place a voice call." };
  }

  const context = await resolveEmployeeContext(options.aiEmployeeId);

  const knowledge =
    context.knowledge ||
    `Business Name: ${context.businessName}\nRepresentative: ${context.employeeName}\nType: ${context.businessType}\nRole: Sales, Lead Inquiries, and Customer Support.`;

  const openingMessage =
    options.initialBotMessage ||
    `Hello! I am calling from ${context.businessName} regarding your recent inquiry. Am I speaking with ${customerName}?`;

  // Keys mirror the variable names configured on the Sarvam agent canvas.
  const agentVariables: Record<string, any> = {
    business_name: context.businessName,
    business_type: context.businessType,
    business_description: knowledge,
    lead_name: customerName,
    lead_phone: options.phoneNumber,
    preferred_language: context.employeeLanguage.includes("Hindi") ? "Hindi" : "English",
    lead_enquiry: options.reason || "Inquiry regarding services and pricing",
    interested_product: "Services & Products from catalog",
    ...(options.agentVariables || {}),
  };

  const result = await triggerLeadCall({
    customerName,
    phoneNumber: options.phoneNumber,
    reason: options.reason,
    agentVariables,
    initialBotMessage: openingMessage,
    initialStateName: options.initialStateName,
    webhookUrl: options.webhookUrl,
    metadata: options.leadId
      ? { lead_id: options.leadId, triggered_by: options.triggeredBy }
      : undefined,
  });

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
