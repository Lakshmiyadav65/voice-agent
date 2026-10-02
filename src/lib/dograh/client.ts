import { formatE164PhoneNumber } from "@/lib/phone";

/**
 * Dograh REST API (docs.dograh.com/api-reference). Dograh runs the live call
 * (telephony, speech, the LLM turn loop) with each client's own agent, built in
 * Dograh by staff, or the shared default agent; the lead and business details
 * are sent from here with each call, and every result is pulled back into our
 * database.
 */

// Hosted Dograh's backend; a self-hosted install sets DOGRAH_BASE_URL to its own.
const DEFAULT_BASE_URL = "https://api.dograh.com";
const ATTEMPT_PREFIX = "dograh:";

type DograhConfig = { baseUrl: string; apiKey: string; defaultWorkflowId: number | null };

export type DograhRun = {
  id: number;
  workflow_id: number;
  name: string;
  is_completed: boolean;
  transcript_url: string | null;
  recording_url: string | null;
  transcript_public_url: string | null;
  recording_public_url: string | null;
  initial_context: Record<string, unknown> | null;
  gathered_context: Record<string, unknown> | null;
  usage_info: { call_duration_seconds?: number | null } | null;
  cost_info: { call_duration_seconds?: number | null } | null;
};

type Outcome<T> = { ok: true; data: T } | { ok: false; error: string; status?: number };

function readConfig(): DograhConfig | { error: string } {
  const apiKey = process.env.DOGRAH_API_KEY?.trim();
  if (!apiKey) return { error: "DOGRAH_API_KEY is not configured" };
  const workflowId = Number(process.env.DOGRAH_WORKFLOW_ID);
  const baseUrl = (process.env.DOGRAH_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, "");
  return { baseUrl, apiKey, defaultWorkflowId: Number.isInteger(workflowId) && workflowId > 0 ? workflowId : null };
}

/** The agent to use: the employee's own, else the shared default from DOGRAH_WORKFLOW_ID. */
function pickWorkflow(config: DograhConfig, workflowId?: number | null): Outcome<number> {
  const id = workflowId || config.defaultWorkflowId;
  return id
    ? { ok: true, data: id }
    : { ok: false, error: "This agent is not linked to a Dograh agent, and DOGRAH_WORKFLOW_ID is not set" };
}

async function dograhFetch<T>(config: DograhConfig, path: string, init?: RequestInit): Promise<Outcome<T>> {
  try {
    const res = await fetch(`${config.baseUrl}/api/v1${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", "X-API-Key": config.apiKey, ...init?.headers },
      cache: "no-store",
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const detail = typeof data?.detail === "string" ? data.detail : JSON.stringify(data?.detail ?? data);
      return { ok: false, status: res.status, error: `Dograh API error (${res.status}): ${detail}` };
    }
    return { ok: true, data: data as T };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not reach Dograh" };
  }
}

/** Any Dograh API call with the platform's key, for modules that own their own endpoints. */
export async function dograhRequest<T>(path: string, init?: RequestInit): Promise<Outcome<T>> {
  const config = readConfig();
  if ("error" in config) return { ok: false, error: config.error };
  return dograhFetch<T>(config, path, init);
}

// The call endpoint wants the agent's UUID; staff only see the numeric id in the URL.
const uuidCache = new Map<number, string>();

async function agentUuid(config: DograhConfig, workflowId: number): Promise<Outcome<string>> {
  const cached = uuidCache.get(workflowId);
  if (cached) return { ok: true, data: cached };

  const res = await dograhFetch<{ workflow_uuid?: string | null }>(config, `/workflow/fetch/${workflowId}`);
  if (!res.ok) return res;
  if (!res.data.workflow_uuid) return { ok: false, error: `Dograh workflow ${workflowId} has no agent UUID` };

  uuidCache.set(workflowId, res.data.workflow_uuid);
  return { ok: true, data: res.data.workflow_uuid };
}

/** Our call_attempts.attempt_id for a Dograh run; it carries the workflow so results can be fetched later. */
export function dograhAttemptId(workflowId: number, runId: number): string {
  return `${ATTEMPT_PREFIX}${workflowId}:${runId}`;
}

export function parseDograhAttemptId(attemptId: string): { workflowId: number; runId: number } | null {
  const match = /^dograh:(\d+):(\d+)$/.exec(attemptId);
  return match ? { workflowId: Number(match[1]), runId: Number(match[2]) } : null;
}

export const DOGRAH_ATTEMPT_PATTERN = `${ATTEMPT_PREFIX}%`;

/**
 * Places an outbound call. Production runs the published version of the agent;
 * DOGRAH_USE_DRAFT=true runs the latest saved draft instead, for trying changes
 * before publishing them in Dograh.
 */
export async function triggerDograhCall(options: {
  workflowId?: number | null;
  phoneNumber: string;
  initialContext: Record<string, unknown>;
}): Promise<{ success: true; attemptId: string } | { success: false; error: string }> {
  const config = readConfig();
  if ("error" in config) return { success: false, error: config.error };

  const workflow = pickWorkflow(config, options.workflowId);
  if (!workflow.ok) return { success: false, error: workflow.error };
  const uuid = await agentUuid(config, workflow.data);
  if (!uuid.ok) return { success: false, error: uuid.error };

  const telephonyConfigId = Number(process.env.DOGRAH_TELEPHONY_CONFIG_ID);
  const draft = process.env.DOGRAH_USE_DRAFT === "true" ? "/test" : "";

  const res = await dograhFetch<{ workflow_run_id: number }>(config, `/public/agent${draft}/workflow/${uuid.data}`, {
    method: "POST",
    body: JSON.stringify({
      phone_number: formatE164PhoneNumber(options.phoneNumber),
      initial_context: options.initialContext,
      ...(Number.isInteger(telephonyConfigId) && telephonyConfigId > 0
        ? { telephony_configuration_id: telephonyConfigId }
        : {}),
    }),
  });
  if (!res.ok) return { success: false, error: res.error };

  return { success: true, attemptId: dograhAttemptId(workflow.data, res.data.workflow_run_id) };
}

export async function getDograhRun(workflowId: number, runId: number): Promise<Outcome<DograhRun>> {
  const config = readConfig();
  if ("error" in config) return { ok: false, error: config.error };
  return dograhFetch<DograhRun>(config, `/workflow/${workflowId}/runs/${runId}`);
}

/** The agent an employee's calls go to: its own, else the shared default. */
export function dograhWorkflowFor(workflowId?: number | null): number | null {
  const config = readConfig();
  if ("error" in config) return null;
  const workflow = pickWorkflow(config, workflowId);
  return workflow.ok ? workflow.data : null;
}

/**
 * Every active agent in the Dograh organisation that staff can link a client to.
 * The shared default is left out: every unlinked client calls through it, so
 * linking one client would attach that client's knowledge to all their calls.
 */
export async function listDograhAgents(): Promise<Outcome<Array<{ id: number; name: string }>>> {
  const config = readConfig();
  if ("error" in config) return { ok: false, error: config.error };

  const res = await dograhFetch<Array<{ id: number; name: string; status: string }>>(config, "/workflow/fetch");
  if (!res.ok) return res;
  const agents = (Array.isArray(res.data) ? res.data : [])
    .filter((w) => w.status === "active" && w.id !== config.defaultWorkflowId)
    .map(({ id, name }) => ({ id, name }));
  return { ok: true, data: agents };
}

/**
 * The script address of an agent's website widget, which runs browser voice
 * calls. It only exists once "Add to Website" is switched on for that agent in
 * Dograh; the embed token inside it is public by design.
 */
export async function getDograhWidgetUrl(workflowId?: number | null): Promise<Outcome<string>> {
  const config = readConfig();
  if ("error" in config) return { ok: false, error: config.error };
  const workflow = pickWorkflow(config, workflowId);
  if (!workflow.ok) return workflow;

  const res = await dograhFetch<{ embed_script?: string } | null>(config, `/workflow/${workflow.data}/embed-token`);
  if (!res.ok) return res;

  const src = res.data?.embed_script ? /js\.src\s*=\s*'([^']+)'/.exec(res.data.embed_script)?.[1] : undefined;
  if (!src) {
    return {
      ok: false,
      error: "Turn on Add to Website for this agent in Dograh (agent settings → Configure Widget, Voice, Headless).",
    };
  }
  return { ok: true, data: src };
}

/** The transcript file behind a run's public link, as Dograh wrote it. */
export async function downloadDograhTranscript(publicUrl: string): Promise<string | null> {
  try {
    // The public link redirects to a short-lived signed URL; fetch follows it.
    const res = await fetch(publicUrl, { cache: "no-store" });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}
