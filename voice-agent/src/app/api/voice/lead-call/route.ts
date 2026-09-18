import { NextResponse } from "next/server";
import { triggerLeadCall } from "@/lib/sarvam/client";
import { getSessionContext } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const session = await getSessionContext();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      aiEmployeeId,
      customerName = "Valued Customer",
      phoneNumber,
      reason,
      initialBotMessage,
      initialStateName,
      leadId,
      agentVariables: explicitVariables,
    } = body;

    if (!phoneNumber) {
      return NextResponse.json(
        { error: "Phone number (phoneNumber) is required to place a voice call." },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: "Database client unavailable" }, { status: 500 });
    }

    // 1. Resolve AI Employee & Business Details from Database
    let businessName = "Our Business";
    let businessType = "Consumer & Commercial Services";
    let employeeName = "Voice Agent";
    let employeeLanguage = "English";
    let compiledKnowledge = "";
    let effectiveOpeningMessage = initialBotMessage;

    if (aiEmployeeId) {
      const { data: employee } = await supabase
        .from("ai_employees")
        .select("*, businesses(*)")
        .eq("id", aiEmployeeId)
        .single();

      if (employee) {
        employeeName = employee.name;
        employeeLanguage = (employee as any).language || "English";
        const biz = (employee as any).businesses;
        if (biz) {
          businessName = biz.name || businessName;
          businessType = biz.industry || businessType;
        }

        // 2. Fetch Stored Business Knowledge from Supabase (both employee-level and business-level)
        const businessId = employee.business_id;
        let docQuery = supabase
          .from("knowledge_documents")
          .select("name, summary, raw_text, source_type, metadata");

        if (businessId) {
          docQuery = docQuery.or(`business_id.eq.${businessId},ai_employee_id.eq.${aiEmployeeId}`);
        } else {
          docQuery = docQuery.eq("ai_employee_id", aiEmployeeId);
        }

        const { data: docs } = await docQuery;

        if (docs && docs.length > 0) {
          // Build rich business_description knowledge payload strictly from verified database records
          const knowledgeSections: string[] = [];

          knowledgeSections.push(`BUSINESS OVERVIEW:`);
          knowledgeSections.push(`Company Name: ${businessName}`);
          knowledgeSections.push(`Representative AI: ${employeeName}`);
          knowledgeSections.push(`Business Category: ${businessType}`);

          // Extract facts, full product lists, and prices
          knowledgeSections.push(`\nVERIFIED BUSINESS FACTS, PRODUCTS & PRICING (FROM DATABASE):`);
          docs.forEach((d, idx) => {
            let docDetails = "";
            if (d.raw_text && d.raw_text.trim()) {
              docDetails = d.raw_text.replace(/\bn(\d{1,3}(?:,\d{2,3})*(?:\.\d+)?)\b/g, "₹$1").trim();
            }
            if (docDetails) {
              knowledgeSections.push(`[Knowledge Item ${idx + 1} - ${d.name}]:\n${docDetails}`);
            }
          });

          compiledKnowledge = knowledgeSections.join("\n\n").slice(0, 7500);
        }
      }
    }

    if (!compiledKnowledge) {
      compiledKnowledge = `Business Name: ${businessName}\nRepresentative: ${employeeName}\nType: ${businessType}\nRole: Sales, Lead Inquiries, and Customer Support.`;
    }

    if (!effectiveOpeningMessage) {
      effectiveOpeningMessage = `Hello! I am calling from ${businessName} regarding your recent inquiry. Am I speaking with ${customerName}?`;
    }

    // 3. Construct Sarvam's exact agent variables matching their console canvas:
    // { business_name, business_type, business_description, lead_name, lead_phone, preferred_language, lead_enquiry, interested_product }
    const finalAgentVariables: Record<string, any> = {
      business_name: businessName,
      business_type: businessType,
      business_description: compiledKnowledge,
      lead_name: customerName,
      lead_phone: phoneNumber,
      preferred_language: employeeLanguage.includes("Hindi") ? "Hindi" : "English",
      lead_enquiry: reason || "Inquiry regarding services and pricing",
      interested_product: "Services & Products from catalog",
      ...(explicitVariables || {}),
    };

    // Determine current host for webhook callback if deployed
    const origin = request.headers.get("origin") || request.headers.get("host");
    const webhookUrl = origin ? `${origin.startsWith("http") ? origin : `https://${origin}`}/api/voice/webhook` : undefined;

    // 4. Trigger Instant Outbound Voice Call via Sarvam API
    const result = await triggerLeadCall({
      customerName,
      phoneNumber,
      reason,
      agentVariables: finalAgentVariables,
      initialBotMessage: effectiveOpeningMessage,
      initialStateName,
      webhookUrl,
      metadata: leadId ? { lead_id: leadId, triggered_by: session.userId } : undefined,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      attemptId: result.attemptId,
      message: `Call dispatched to ${phoneNumber} for ${businessName}`,
      variablesSent: {
        business_name: businessName,
        lead_name: customerName,
        initialBotMessage: effectiveOpeningMessage,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to trigger voice call" },
      { status: 500 }
    );
  }
}
