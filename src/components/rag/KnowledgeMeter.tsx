"use client";

import { useEffect, useState } from "react";

import type { KnowledgeUsage } from "@/lib/voice/dispatch-lead-call";

type Props = {
  aiEmployeeId: string;
  // Changes whenever a document is added, edited or removed, so the meter re-reads.
  refreshKey: string;
};

const number = (n: number) => n.toLocaleString("en-IN");

const SENT_LABEL: Record<KnowledgeUsage["items"][number]["sent"], { text: string; className: string }> = {
  all: { text: "Agent hears all of it", className: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  part: { text: "Cut off partway", className: "border-amber-200 bg-amber-50 text-amber-800" },
  none: { text: "Agent does not hear this", className: "border-red-200 bg-red-50 text-red-700" },
};

/**
 * How full the agent's knowledge is: every call carries the knowledge base as one
 * block with a size limit, and whatever falls past it is silently left out. This
 * shows owners and staff what the agent actually hears, item by item.
 */
export function KnowledgeMeter({ aiEmployeeId, refreshKey }: Props) {
  const [usage, setUsage] = useState<KnowledgeUsage | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/rag/knowledge-usage?aiEmployeeId=${aiEmployeeId}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then(
        (data) => {
          if (cancelled) return;
          setUsage(data.usage ?? null);
          setFailed(false);
        },
        () => !cancelled && setFailed(true)
      );
    return () => {
      cancelled = true;
    };
  }, [aiEmployeeId, refreshKey]);

  if (failed) return <p className="text-xs text-muted">Could not check how much your agent can hear right now.</p>;
  if (!usage) return <div className="h-16 animate-pulse rounded-xl bg-background" aria-busy="true" />;

  const over = usage.total > usage.limit;
  const percent = Math.min(100, Math.round((usage.used / usage.limit) * 100));
  const nearlyFull = !over && percent >= 90;
  const barColor = over ? "bg-red-500" : nearlyFull ? "bg-amber-500" : "bg-accent";
  const missed = usage.items.filter((i) => i.sent !== "all");

  return (
    <div
      className={`space-y-3 rounded-xl border p-4 ${
        over ? "border-red-200 bg-red-50/60" : nearlyFull ? "border-amber-200 bg-amber-50/60" : "border-border bg-background"
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-ink">What your agent hears on each call</p>
        <p className="text-xs text-muted">
          <span className="font-semibold text-ink">{number(usage.used)}</span> of {number(usage.limit)} characters ({percent}%)
        </p>
      </div>

      <div
        className="h-2.5 w-full overflow-hidden rounded-full bg-border"
        role="meter"
        aria-label="Knowledge the agent hears"
        aria-valuemin={0}
        aria-valuemax={usage.limit}
        aria-valuenow={usage.used}
      >
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${percent}%` }} />
      </div>

      {over ? (
        <p className="text-xs text-red-700">
          Your knowledge base is {number(usage.total - usage.limit)} characters over the limit, so the agent does not hear
          the end of it. Shorten or remove something, or move the most important facts into an earlier item.
        </p>
      ) : nearlyFull ? (
        <p className="text-xs text-amber-800">
          Nearly full: only {number(usage.limit - usage.used)} characters left. Anything added past that will not reach the agent.
        </p>
      ) : (
        <p className="text-xs text-muted">
          Everything fits. Items are sent oldest first, so if the knowledge base grows past the limit, the newest is cut off first.
        </p>
      )}

      {usage.items.length > 1 || missed.length ? (
        <ul className="space-y-1.5">
          {usage.items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="min-w-0 truncate text-foreground">
                {item.name} <span className="text-muted">· {number(item.chars)} characters</span>
              </span>
              <span className={`shrink-0 rounded-full border px-2 py-0.5 font-semibold ${SENT_LABEL[item.sent].className}`}>
                {SENT_LABEL[item.sent].text}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
