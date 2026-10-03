import { NextResponse } from "next/server";

import { isPlatformStaff } from "@/lib/auth/roles";
import { getSessionContext } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyTrainingEdit, sanitizeAgentTraining } from "@/lib/voice/agent-training";

const NEEDS_MIGRATION = "Apply the phase 15 database migration first (supabase db push), then try again.";

/**
 * Records what staff trained for a client's agent in Sarvam's console, so the
 * client can read it on their agent page. Staff only: clients see it, never edit it.
 */
export async function PUT(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isPlatformStaff(session.profile.platform_role)) {
    return NextResponse.json({ error: "Only platform staff can record an agent's training." }, { status: 403 });
  }
  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const body = await request.json().catch(() => null);
  const employeeId = String(body?.employeeId ?? "").trim();
  if (!employeeId) return NextResponse.json({ error: "Choose the AI employee to update." }, { status: 400 });

  // "*" rather than naming agent_training, so a missing column reads as "not migrated" below.
  const { data: employee } = await supabase.from("ai_employees").select("*").eq("id", employeeId).maybeSingle();
  if (!employee) return NextResponse.json({ error: "That AI employee was not found." }, { status: 404 });
  if (!("agent_training" in employee)) return NextResponse.json({ error: NEEDS_MIGRATION }, { status: 500 });

  const training = applyTrainingEdit(
    sanitizeAgentTraining(employee.agent_training),
    body,
    session.profile.full_name?.trim() || session.email
  );
  const { error } = await supabase.from("ai_employees").update({ agent_training: training }).eq("id", employeeId);
  if (error) {
    return NextResponse.json(
      { error: /agent_training/.test(error.message) ? NEEDS_MIGRATION : "Could not save the training." },
      { status: 500 }
    );
  }
  return NextResponse.json({ training });
}
