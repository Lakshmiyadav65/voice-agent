import Link from "next/link";

import { AppSectionPage } from "@/components/shell/AppSectionPage";
import { AddClientForm } from "@/components/trainer/AddClientForm";
import { ClientAgentField } from "@/components/trainer/ClientAgentField";
import { ClientTrainingEditor } from "@/components/trainer/ClientTrainingEditor";
import { requireTrainerAccess } from "@/lib/auth/session";
import type { PageMeta } from "@/lib/pages";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeAgentTraining, type AgentTraining } from "@/lib/voice/agent-training";

const meta: PageMeta = {
  title: "Add clients",
  description: "Create a client's login and business, then send them the login details.",
  breadcrumbs: [{ label: "Trainer", href: "/trainer" }, { label: "Add clients" }],
};

type ClientRow = {
  id: string;
  name: string;
  createdAt: string;
  owners: string[];
  employee: { id: string; name: string; sarvamAgentId: string | null; training: AgentTraining | null } | null;
};

async function loadClients(): Promise<ClientRow[]> {
  const supabase = createAdminClient();
  if (!supabase) return [];

  // Plain reads joined here: the embedded-select typing has no relationships to follow.
  const [{ data: businesses }, { data: members }, { data: profiles }, { data: employees }] = await Promise.all([
    supabase.from("businesses").select("id, name, created_at").order("created_at", { ascending: false }),
    supabase.from("business_members").select("business_id, user_id").eq("role", "owner"),
    supabase.from("profiles").select("id, email"),
    // "*" rather than naming sarvam_agent_id or agent_training, so the page still loads before phases 14 and 15.
    supabase.from("ai_employees").select("*").order("created_at", { ascending: true }),
  ]);

  const emailOf = new Map((profiles ?? []).map((p) => [p.id, p.email]));
  return (businesses ?? []).map((b) => {
    const employee = (employees ?? []).find((e) => e.business_id === b.id);
    const owners = (members ?? []).filter((m) => m.business_id === b.id).map((m) => emailOf.get(m.user_id) ?? "—");
    return {
      id: b.id,
      name: b.name,
      createdAt: b.created_at,
      owners,
      employee: employee
        ? {
            id: employee.id,
            name: employee.name,
            sarvamAgentId: employee.sarvam_agent_id ?? null,
            training: sanitizeAgentTraining(employee.agent_training),
          }
        : null,
    };
  });
}

export default async function AdminPage() {
  await requireTrainerAccess();
  const clients = await loadClients();

  return (
    <AppSectionPage meta={meta} showEmpty={false}>
      <AddClientForm startOpen />

      <section className="mt-10">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Clients ({clients.length})</h2>
          <Link href="/trainer/businesses" className="text-sm font-semibold text-accent hover:underline">
            Manage call credits
          </Link>
        </div>
        {clients.length ? (
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {clients.map((client) => (
              <li key={client.id} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 p-4">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{client.name}</p>
                  <p className="text-sm text-muted">{client.owners.length ? client.owners.join(", ") : "No owner login"}</p>
                </div>
                <div className="text-right text-sm">
                  {client.employee ? (
                    <ClientAgentField
                      employeeId={client.employee.id}
                      employeeName={client.employee.name}
                      sarvamAgentId={client.employee.sarvamAgentId}
                    />
                  ) : (
                    <p className="text-foreground">No agent yet</p>
                  )}
                  <p className="text-xs text-muted">
                    Added{" "}
                    {new Date(client.createdAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      timeZone: "Asia/Kolkata",
                    })}
                  </p>
                </div>
                {client.employee ? (
                  <div className="w-full">
                    <ClientTrainingEditor
                      employeeId={client.employee.id}
                      employeeName={client.employee.name}
                      training={client.employee.training}
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No clients yet. Add your first one above.</p>
        )}
      </section>
    </AppSectionPage>
  );
}
