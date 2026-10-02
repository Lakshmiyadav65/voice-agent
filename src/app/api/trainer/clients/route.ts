import { after, NextResponse } from "next/server";

import { isPlatformStaff } from "@/lib/auth/roles";
import { getSessionContext } from "@/lib/auth/session";
import { listDograhAgents } from "@/lib/dograh/client";
import { syncBusinessKnowledge } from "@/lib/dograh/knowledge";
import { createAdminClient } from "@/lib/supabase/admin";

const MIN_PASSWORD_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function loginUrl(request: Request): string {
  const base = process.env.APP_PUBLIC_URL?.trim() || new URL(request.url).origin;
  return `${base.replace(/\/$/, "")}/login`;
}

/**
 * Onboards a client in one step: the owner's login (already confirmed, so it
 * works at once), their business, its AI employee, and the Dograh agent that
 * calls for it. Staff then share the returned login details with the client.
 */
export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isPlatformStaff(session.profile.platform_role)) {
    return NextResponse.json({ error: "Only platform staff can add clients." }, { status: 403 });
  }
  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const body = await request.json().catch(() => null);
  const businessName = String(body?.businessName ?? "").trim();
  const ownerName = String(body?.ownerName ?? "").trim();
  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");
  const workflowId = body?.dograhWorkflowId ? Number(body.dograhWorkflowId) : null;

  if (!businessName || !ownerName) {
    return NextResponse.json({ error: "Enter the business name and the owner's name." }, { status: 400 });
  }
  if (!EMAIL_PATTERN.test(email)) return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json({ error: `The password needs at least ${MIN_PASSWORD_LENGTH} characters.` }, { status: 400 });
  }

  // The employee takes the Dograh agent's name, so both consoles show the same agent.
  let agentName = "AI Employee";
  if (workflowId) {
    const agents = await listDograhAgents();
    const agent = agents.ok ? agents.data.find((a) => a.id === workflowId) : undefined;
    if (!agent) return NextResponse.json({ error: "That Dograh agent was not found." }, { status: 400 });
    agentName = agent.name;

    // Knowledge is attached to the linked agent, so a shared one would read out another client's details.
    const { data: linked } = await supabase
      .from("ai_employees")
      .select("id")
      .eq("dograh_workflow_id", workflowId)
      .limit(1);
    if (linked?.length) {
      return NextResponse.json(
        { error: "That Dograh agent already belongs to another client. Each client needs their own agent." },
        { status: 409 }
      );
    }
  }

  const { data: created, error: userError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: ownerName },
  });
  if (userError || !created.user) {
    const taken = /already|registered|exists/i.test(userError?.message ?? "");
    return NextResponse.json(
      { error: taken ? "An account with this email already exists." : userError?.message || "Could not create the login." },
      { status: taken ? 409 : 500 }
    );
  }
  const userId = created.user.id;

  // Undo everything if a later step fails, so a retry with the same email starts clean.
  const fail = async (message: string, businessId?: string) => {
    if (businessId) await supabase.from("businesses").delete().eq("id", businessId);
    await supabase.auth.admin.deleteUser(userId);
    return NextResponse.json({ error: message }, { status: 500 });
  };

  const { data: business } = await supabase
    .from("businesses")
    .insert({ name: businessName, email, status: "active", timezone: "Asia/Kolkata" })
    .select("id")
    .single();
  if (!business) return fail("Could not create the business.");

  const { error: memberError } = await supabase
    .from("business_members")
    .insert({ business_id: business.id, user_id: userId, role: "owner" });
  if (memberError) return fail("Could not give the owner access to the business.", business.id);

  const { error: employeeError } = await supabase.from("ai_employees").insert({
    business_id: business.id,
    name: agentName,
    status: workflowId ? "live" : "draft",
    ...(workflowId ? { dograh_workflow_id: workflowId } : {}),
  });
  if (employeeError) {
    return fail(
      /dograh_workflow_id/.test(employeeError.message)
        ? "Apply the phase 13 database migration first (supabase db push), then try again."
        : "Could not create the AI employee.",
      business.id
    );
  }

  // Creates their knowledge document in Dograh and attaches it to the agent, ready for what they add later.
  if (workflowId) after(() => syncBusinessKnowledge(supabase, business.id));

  return NextResponse.json({ businessId: business.id, loginUrl: loginUrl(request), email, password });
}
