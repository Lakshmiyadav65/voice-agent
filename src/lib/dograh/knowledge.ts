import type { SupabaseClient } from "@supabase/supabase-js";

import type { AiEmployee, Database } from "@/lib/database.types";

import { dograhRequest } from "./client";

type AdminClient = SupabaseClient<Database>;

/**
 * Clients view and edit their knowledge on our platform; their Dograh agent
 * reads it from one Dograh knowledge document per AI employee, attached to the
 * agent's Start node. Every change on our side rewrites that document, so the
 * platform is the only place anyone edits knowledge. "Full document" mode hands
 * the agent the whole text, and needs no embedding key in Dograh.
 */

type DocumentContent = { content: string; file_hash: string };
type WorkflowNode = { type: string; data: { document_uuids?: string[] | null } & Record<string, unknown> };
type Workflow = { version_status?: string; workflow_definition: { nodes: WorkflowNode[] } & Record<string, unknown> };

function knowledgeText(businessName: string, docs: Array<{ name: string; raw_text: string }>): string {
  const sections = docs
    .filter((d) => d.raw_text?.trim())
    .map((d) => `## ${d.name}\n\n${d.raw_text.trim()}`);
  return [
    `# ${businessName}: business knowledge`,
    "Copied from the platform's knowledge base. Edit it there: changes made here are overwritten.",
    ...(sections.length ? sections : ["No business details have been added yet."]),
  ].join("\n\n");
}

async function createDocument(filename: string, content: string): Promise<string> {
  const target = await dograhRequest<{ upload_url: string; document_uuid: string; s3_key: string }>(
    "/knowledge-base/upload-url",
    { method: "POST", body: JSON.stringify({ filename, mime_type: "text/plain" }) }
  );
  if (!target.ok) throw new Error(target.error);

  const upload = await fetch(target.data.upload_url, {
    method: "PUT",
    headers: { "Content-Type": "text/plain" },
    body: content,
  });
  if (!upload.ok) throw new Error(`Dograh upload failed (${upload.status})`);

  const processed = await dograhRequest<{ document_uuid: string }>("/knowledge-base/process-document", {
    method: "POST",
    body: JSON.stringify({
      document_uuid: target.data.document_uuid,
      s3_key: target.data.s3_key,
      retrieval_mode: "full_document",
    }),
  });
  if (!processed.ok) throw new Error(processed.error);
  return processed.data.document_uuid;
}

/** Rewrites an existing document; false when it no longer exists in Dograh. */
async function replaceDocument(uuid: string, content: string): Promise<boolean> {
  const path = `/knowledge-base/documents/${uuid}/content`;
  // Twice at most: a concurrent edit changes the hash between reading and writing.
  for (let attempt = 0; attempt < 2; attempt++) {
    const current = await dograhRequest<DocumentContent>(path);
    if (!current.ok) {
      if (current.status === 404) return false;
      throw new Error(current.error);
    }
    if (current.data.content === content) return true;

    const saved = await dograhRequest(path, {
      method: "PUT",
      body: JSON.stringify({ content, expected_file_hash: current.data.file_hash }),
    });
    if (saved.ok) return true;
    if (saved.status !== 409) throw new Error(saved.error);
  }
  throw new Error("Dograh kept reporting a newer version of the knowledge document");
}

/**
 * Makes sure the agent's Start node can read the document. Adding it creates a
 * draft; that draft is published only if nothing else was waiting in it, so a
 * half-finished edit by staff in Dograh never goes live on our account.
 */
async function attachToAgent(workflowId: number, uuid: string): Promise<void> {
  const workflow = await dograhRequest<Workflow>(`/workflow/fetch/${workflowId}`);
  if (!workflow.ok) throw new Error(workflow.error);

  const definition = workflow.data.workflow_definition;
  const start = definition.nodes.find((n) => n.type === "startCall");
  if (!start) throw new Error(`Dograh agent ${workflowId} has no Start node`);
  const attached = start.data.document_uuids ?? [];
  if (attached.includes(uuid)) return;

  start.data.document_uuids = [...attached, uuid];
  const updated = await dograhRequest(`/workflow/${workflowId}`, {
    method: "PUT",
    body: JSON.stringify({ workflow_definition: definition }),
  });
  if (!updated.ok) throw new Error(updated.error);

  if (workflow.data.version_status === "published") {
    const published = await dograhRequest(`/workflow/${workflowId}/publish`, { method: "POST" });
    if (!published.ok) throw new Error(published.error);
  }
}

async function syncEmployee(
  supabase: AdminClient,
  employee: Pick<AiEmployee, "id" | "business_id" | "dograh_knowledge_uuid">,
  workflowId: number,
  businessName: string
): Promise<void> {
  const { data: docs } = await supabase
    .from("knowledge_documents")
    .select("name, raw_text")
    .or(`business_id.eq.${employee.business_id},ai_employee_id.eq.${employee.id}`)
    .order("created_at", { ascending: true });
  const content = knowledgeText(businessName, docs ?? []);

  let uuid = employee.dograh_knowledge_uuid;
  if (!uuid || !(await replaceDocument(uuid, content))) {
    uuid = await createDocument(`knowledge-${employee.id}.txt`, content);
    await supabase.from("ai_employees").update({ dograh_knowledge_uuid: uuid }).eq("id", employee.id);
  }
  await attachToAgent(workflowId, uuid);
}

// One sync per business at a time, so two quick edits cannot both create a document.
const running = new Map<string, Promise<void>>();

/**
 * Copies a business's knowledge into each of its Dograh-built agents. Call it
 * after any knowledge change, from after() so the owner is not kept waiting.
 * Employees on the shared agent are skipped: they get knowledge with each call.
 */
export function syncBusinessKnowledge(supabase: AdminClient, businessId: string): Promise<void> {
  const previous = running.get(businessId) ?? Promise.resolve();
  const next = previous.then(async () => {
    const [{ data: business }, { data: employees }] = await Promise.all([
      supabase.from("businesses").select("name").eq("id", businessId).maybeSingle(),
      supabase.from("ai_employees").select("*").eq("business_id", businessId),
    ]);
    for (const employee of employees ?? []) {
      // Absent until the phase 13 migration is applied.
      if (!employee.dograh_workflow_id) continue;
      try {
        await syncEmployee(supabase, employee, employee.dograh_workflow_id, business?.name ?? "Business");
      } catch (err) {
        console.error("[Dograh knowledge] Sync failed for employee", employee.id, err);
      }
    }
  });
  const settled = next.finally(() => {
    if (running.get(businessId) === settled) running.delete(businessId);
  });
  running.set(businessId, settled);
  return settled;
}
