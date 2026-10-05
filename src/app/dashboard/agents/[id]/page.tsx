import Link from "next/link";
import { notFound } from "next/navigation";

import { AgentGlyph, BackIcon } from "@/components/agents/icons";
import { TrainingSection } from "@/components/agents/TrainingSection";
import { canManageBusiness } from "@/lib/auth/access";
import { requireDashboardAccess } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeAgentTraining } from "@/lib/voice/agent-training";

type PageProps = { params: Promise<{ id: string }> };

const STATUS_LABEL: Record<string, string> = { draft: "Being set up", testing: "Testing", live: "Live", paused: "Paused" };

/**
 * An agent as its owner sees it. Its behaviour is set only in the voice provider's console, so
 * the page shows how our team trained it, read-only, and points to the one thing
 * the owner changes: the knowledge base.
 */
export default async function AgentPage({ params }: PageProps) {
  const session = await requireDashboardAccess();
  const supabase = createAdminClient();
  if (!supabase) notFound();

  const { id } = await params;
  const { data: employee } = await supabase.from("ai_employees").select("*").eq("id", id).maybeSingle();
  if (!employee || !(await canManageBusiness(supabase, session, employee.business_id))) notFound();

  return (
    <div className="min-h-[calc(100vh-2rem)] overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 sm:px-6">
        <Link href="/dashboard/agents" aria-label="Back to agents" className="rounded-full p-1.5 text-muted hover:bg-background hover:text-ink">
          <BackIcon />
        </Link>
        <AgentGlyph size={28} />
        <h1 className="min-w-0 truncate text-lg text-ink">{employee.name}</h1>
        <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted">
          {STATUS_LABEL[employee.status] ?? employee.status}
        </span>
      </div>

      <div className="mx-auto max-w-3xl space-y-8 px-4 py-6 sm:px-8">
        <section>
          <h2 className="text-lg font-semibold text-ink">Training</h2>
          <p className="mb-6 text-sm text-muted">How our team trained your agent: its greeting, language, voice and prompt.</p>
          <TrainingSection training={sanitizeAgentTraining(employee.agent_training)} />
        </section>

        <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-background p-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">What your agent knows</p>
            <p className="text-sm text-muted">
              Prices, projects and other facts come from your knowledge base. A change reaches the agent on its next call.
            </p>
          </div>
          <Link
            href="/dashboard/ai-employee"
            className="shrink-0 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-surface transition hover:opacity-90"
          >
            Open knowledge base
          </Link>
        </section>
      </div>
    </div>
  );
}
