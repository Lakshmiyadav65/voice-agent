import type { CallAttempt, CallOutcomeLabel } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

export type CallStats = {
  total: number;
  connected: number;
  connectRate: number;
  avgDurationSeconds: number;
  visitRequests: number;
  outcomes: Array<{ label: CallOutcomeLabel; count: number }>;
  topTopics: Array<{ topic: string; count: number }>;
};

export type KnowledgeGap = {
  question: string;
  count: number;
  lastAskedAt: string;
};

async function fetchAttempts(businessId: string): Promise<CallAttempt[]> {
  const supabase = await createClient();
  if (!supabase) return [];

  const { data } = await supabase
    .from("call_attempts")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(500);

  return (data as CallAttempt[] | null) ?? [];
}

function countInto(map: Map<string, number>, values: string[]) {
  for (const value of values) {
    map.set(value, (map.get(value) ?? 0) + 1);
  }
}

export async function getCallStats(businessId: string): Promise<CallStats> {
  const attempts = await fetchAttempts(businessId);

  const connectedCalls = attempts.filter((a) => a.status === "connected");
  const withDuration = connectedCalls.filter((a) => typeof a.duration === "number");
  const totalDuration = withDuration.reduce((sum, a) => sum + (a.duration ?? 0), 0);

  const outcomeCounts = new Map<string, number>();
  const topicCounts = new Map<string, number>();

  for (const attempt of attempts) {
    if (attempt.outcome) countInto(outcomeCounts, [attempt.outcome]);
    countInto(topicCounts, attempt.topics ?? []);
  }

  return {
    total: attempts.length,
    connected: connectedCalls.length,
    connectRate: attempts.length ? connectedCalls.length / attempts.length : 0,
    avgDurationSeconds: withDuration.length
      ? Math.round(totalDuration / withDuration.length)
      : 0,
    visitRequests: attempts.filter((a) => a.visit_requested).length,
    outcomes: [...outcomeCounts.entries()]
      .map(([label, count]) => ({ label: label as CallOutcomeLabel, count }))
      .sort((a, b) => b.count - a.count),
    topTopics: [...topicCounts.entries()]
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
  };
}

/**
 * Groups near-identical questions by a normalised key so "what is the price?"
 * and "What's the price" count as one gap rather than two.
 */
export async function getKnowledgeGaps(businessId: string): Promise<KnowledgeGap[]> {
  const attempts = await fetchAttempts(businessId);
  const grouped = new Map<string, KnowledgeGap>();

  for (const attempt of attempts) {
    for (const question of attempt.unanswered_questions ?? []) {
      const key = question.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
      if (!key) continue;

      const existing = grouped.get(key);
      if (existing) {
        existing.count += 1;
        if (attempt.created_at > existing.lastAskedAt) {
          existing.lastAskedAt = attempt.created_at;
        }
      } else {
        grouped.set(key, { question, count: 1, lastAskedAt: attempt.created_at });
      }
    }
  }

  return [...grouped.values()].sort(
    (a, b) => b.count - a.count || b.lastAskedAt.localeCompare(a.lastAskedAt)
  );
}

export async function getKnowledgeGapsAcrossBusinesses(): Promise<KnowledgeGap[]> {
  const supabase = await createClient();
  if (!supabase) return [];

  const { data } = await supabase
    .from("call_attempts")
    .select("unanswered_questions, created_at")
    .order("created_at", { ascending: false })
    .limit(500);

  const grouped = new Map<string, KnowledgeGap>();

  for (const row of (data as Array<Pick<CallAttempt, "unanswered_questions" | "created_at">> | null) ?? []) {
    for (const question of row.unanswered_questions ?? []) {
      const key = question.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
      if (!key) continue;

      const existing = grouped.get(key);
      if (existing) {
        existing.count += 1;
        if (row.created_at > existing.lastAskedAt) existing.lastAskedAt = row.created_at;
      } else {
        grouped.set(key, { question, count: 1, lastAskedAt: row.created_at });
      }
    }
  }

  return [...grouped.values()].sort(
    (a, b) => b.count - a.count || b.lastAskedAt.localeCompare(a.lastAskedAt)
  );
}
