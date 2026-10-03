import { NextResponse } from "next/server";

import { getAccessScope, primaryBusinessId } from "@/lib/auth/access";
import { isPlatformStaff } from "@/lib/auth/roles";
import { getSessionContext } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeAgentSettings } from "@/lib/voice/agent-settings";
import { draftAgentFromDescription } from "@/lib/voice/agent-simulation";

/**
 * Creates an agent, either blank ("Create from scratch") or drafted from a one-line description.
 * Retired: staff create each client's agent when adding the client and train it in Sarvam's
 * console, so owners can no longer add one.
 */
export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isPlatformStaff(session.profile.platform_role)) {
    return NextResponse.json({ error: "Agents are set up by our team." }, { status: 403 });
  }

  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const scope = await getAccessScope(supabase, session);
  const businessId = primaryBusinessId(scope);
  if (!businessId) {
    return NextResponse.json({ error: "Agents are created from a business account." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const description = typeof body?.description === "string" ? body.description.trim().slice(0, 1000) : "";

  const { data: business } = await supabase.from("businesses").select("name").eq("id", businessId).single();
  const draft = description
    ? await draftAgentFromDescription(description, business?.name ?? "the business")
    : { name: "New agent", settings: sanitizeAgentSettings({}) };

  const { data: employee, error } = await supabase
    .from("ai_employees")
    .insert({
      business_id: businessId,
      name: draft.name,
      description: description || "Voice agent",
      status: "draft",
      agent_settings: draft.settings,
    })
    .select("id")
    .single();

  if (error || !employee) return NextResponse.json({ error: "Could not create the agent." }, { status: 500 });
  return NextResponse.json({ id: employee.id }, { status: 201 });
}
