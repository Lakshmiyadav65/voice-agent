import { notFound } from "next/navigation";

import { AgentBuilder, type SectionId } from "@/components/agents/AgentBuilder";
import { canManageBusiness } from "@/lib/auth/access";
import { requireDashboardAccess } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeAgentSettings } from "@/lib/voice/agent-settings";
import { sanitizeTests } from "@/lib/voice/agent-tests";
import { sanitizeAgentTraining } from "@/lib/voice/agent-training";

const SECTIONS: SectionId[] = ["training", "instructions", "variables", "tools", "settings", "tests"];

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function AgentPage({ params, searchParams }: PageProps) {
  const session = await requireDashboardAccess();
  const supabase = createAdminClient();
  if (!supabase) notFound();

  const { id } = await params;
  const { data: employee } = await supabase.from("ai_employees").select("*").eq("id", id).maybeSingle();
  if (!employee || !(await canManageBusiness(supabase, session, employee.business_id))) notFound();

  const requested = (await searchParams).section;
  const section = SECTIONS.find((s) => s === requested) ?? "training";

  return (
    <AgentBuilder
      key={employee.id}
      agentId={employee.id}
      initialName={employee.name}
      initialSettings={sanitizeAgentSettings(employee.agent_settings)}
      initialTests={sanitizeTests(employee.agent_tests)}
      initialSection={section}
      training={sanitizeAgentTraining(employee.agent_training)}
    />
  );
}
