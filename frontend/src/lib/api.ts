import { clearTokens, getStoredTokens, storeTokens } from "./auth-storage";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export type HealthResponse = {
  status: string;
  environment?: string;
  services?: {
    database: string;
    redis: string;
  };
};

export type User = {
  id: string;
  email: string;
  name: string;
  role: "platform_admin" | "ai_trainer" | "business_user";
  is_active: boolean;
};

export type TokenPair = {
  access_token: string;
  refresh_token: string;
  token_type: string;
};

export type Business = {
  id: string;
  name: string;
  industry: string | null;
  phone: string | null;
  email: string | null;
  timezone: string;
  status: string;
};

export type AIEmployee = {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  status: string;
  current_version_id: string | null;
};

export type TurnView = {
  role: "customer" | "ai" | "system";
  text: string;
  language: string;
  at: string;
  interrupted?: boolean;
};

export type Conversation = {
  id: string;
  business_id: string;
  ai_employee_id: string | null;
  state: string;
  language: string;
  escalation_reason: string | null;
  slots: Record<string, unknown>;
  turns: TurnView[];
  started_at: string;
  ended_at: string | null;
};

export type RoutingView = {
  intent: string;
  source: string;
  reason: string;
};

export type GroundingView = {
  prices: string[];
  quantities: number[];
  product_names: string[];
  passage_count: number;
};

export type ToolCallView = {
  tool: string;
  status: string;
  message: string;
  arguments: Record<string, unknown>;
  data: Record<string, unknown>;
  duration_ms: number;
};

export type ViolationView = {
  kind: string;
  detail: string;
};

export type KnowledgeSourceView = {
  document_id: string;
  document_name: string;
  chunk_index: number;
  score: number;
};

export type TurnResponse = {
  conversation_id: string;
  reply: string;
  language: string;
  state: string;
  transcript: string;
  blocked: boolean;
  escalated: boolean;
  escalation_reason: string | null;
  product_found: boolean | null;
  routing: RoutingView;
  grounding: GroundingView;
  violations: ViolationView[];
  knowledge_sources: KnowledgeSourceView[];
  tool_calls: ToolCallView[];
};

async function parseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: string | { msg?: string }[] };
    if (typeof body.detail === "string") {
      return body.detail;
    }
    if (Array.isArray(body.detail) && body.detail[0]?.msg) {
      return body.detail[0].msg;
    }
  } catch {
    // ignore parse failures
  }
  return `Request failed (${response.status})`;
}

async function refreshAccessToken(): Promise<string | null> {
  const tokens = getStoredTokens();
  if (!tokens) {
    return null;
  }

  const response = await fetch(`${API_URL}/api/v1/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: tokens.refreshToken }),
  });

  if (!response.ok) {
    clearTokens();
    return null;
  }

  const next = (await response.json()) as TokenPair;
  storeTokens({
    accessToken: next.access_token,
    refreshToken: next.refresh_token,
  });
  return next.access_token;
}

async function apiFetch<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const tokens = getStoredTokens();
  const headers = new Headers(init.headers);

  if (tokens?.accessToken) {
    headers.set("Authorization", `Bearer ${tokens.accessToken}`);
  }

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
  });

  if (response.status === 401 && retry && tokens?.refreshToken) {
    const accessToken = await refreshAccessToken();
    if (accessToken) {
      return apiFetch<T>(path, init, false);
    }
  }

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch(`${API_URL}/health`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status}`);
  }
  return response.json();
}

export async function login(email: string, password: string): Promise<TokenPair> {
  const response = await fetch(`${API_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }

  return response.json();
}

export async function fetchCurrentUser(): Promise<User> {
  return apiFetch<User>("/api/v1/auth/me");
}

export async function listBusinesses(): Promise<Business[]> {
  return apiFetch<Business[]>("/api/v1/businesses");
}

export async function listAIEmployees(businessId: string): Promise<AIEmployee[]> {
  return apiFetch<AIEmployee[]>(`/api/v1/businesses/${businessId}/ai-employees`);
}

export async function startConversation(
  businessId: string,
  aiEmployeeId?: string,
): Promise<Conversation> {
  return apiFetch<Conversation>(`/api/v1/businesses/${businessId}/conversations`, {
    method: "POST",
    body: JSON.stringify({
      ai_employee_id: aiEmployeeId ?? null,
      language: "english",
    }),
  });
}

export async function sendTurn(
  businessId: string,
  conversationId: string,
  message: string,
): Promise<TurnResponse> {
  return apiFetch<TurnResponse>(
    `/api/v1/businesses/${businessId}/conversations/${conversationId}/turns`,
    {
      method: "POST",
      body: JSON.stringify({ message }),
    },
  );
}

export async function getConversation(
  businessId: string,
  conversationId: string,
): Promise<Conversation> {
  return apiFetch<Conversation>(
    `/api/v1/businesses/${businessId}/conversations/${conversationId}`,
  );
}

export async function endConversation(
  businessId: string,
  conversationId: string,
): Promise<Conversation> {
  return apiFetch<Conversation>(
    `/api/v1/businesses/${businessId}/conversations/${conversationId}/end`,
    { method: "POST" },
  );
}

export async function previewRouting(
  businessId: string,
  text: string,
): Promise<{
  intent: string;
  source: string;
  tools: string[];
  reason: string;
  confidence: number;
}> {
  return apiFetch(`/api/v1/businesses/${businessId}/conversations/route`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}
