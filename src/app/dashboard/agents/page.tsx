import { AgentsHome } from "@/components/agents/AgentsHome";
import { requireDashboardAccess } from "@/lib/auth/session";
import { getOwnerWorkspace } from "@/lib/data/workspace";

export default async function AgentsPage() {
  const session = await requireDashboardAccess();
  const workspace = await getOwnerWorkspace(session.userId);

  const agents = [...workspace.aiEmployees]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .map((e) => ({ id: e.id, name: e.name, status: e.status, updatedAt: e.updated_at }));

  return <AgentsHome agents={agents} />;
}
