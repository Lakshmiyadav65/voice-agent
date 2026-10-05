"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

import { AgentGlyph, SearchIcon } from "./icons";

export type AgentRow = { id: string; name: string; status: string; updatedAt: string };

const STATUS_LABEL: Record<string, string> = { draft: "Being set up", testing: "Testing", live: "Live", paused: "Paused" };

// A shared minute clock. The server snapshot is null, so the first client render matches the
// server HTML and the relative times fill in right after hydration.
let clockNow = 0;
function subscribeClock(onTick: () => void) {
  // React re-reads the snapshot after subscribing, so a page reopened later starts fresh.
  clockNow = Date.now();
  const timer = setInterval(() => {
    clockNow = Date.now();
    onTick();
  }, 60_000);
  return () => clearInterval(timer);
}
function useNow(): number | null {
  return useSyncExternalStore(
    subscribeClock,
    () => clockNow || (clockNow = Date.now()),
    () => null
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

function timeAgo(iso: string, now: number): string {
  const minutes = Math.round((now - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

/**
 * The owner's agents. Staff create each one when they add the client and train it in
 * the voice provider's console, so there is nothing to create here.
 */
export function AgentsHome({ agents }: { agents: AgentRow[] }) {
  const now = useNow();
  const [query, setQuery] = useState("");

  const shown = agents.filter((a) => a.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="min-h-[calc(100vh-2rem)] rounded-2xl border border-border bg-surface px-4 py-5 sm:px-8 sm:py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-lg font-medium text-ink">Agents</h1>
        <p className="text-sm text-muted">Our team sets up and trains your agents.</p>
      </div>

      <div className="mx-auto mt-8 max-w-4xl">
        <h3 className="text-xl font-medium text-ink">Recents</h3>
        <label className="mt-4 flex w-full max-w-xs items-center gap-2 rounded-full border border-border px-4 py-2 text-muted focus-within:border-accent">
          <SearchIcon />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            aria-label="Search agents"
            className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-hidden placeholder:text-muted"
          />
        </label>

        <div className="mt-6">
          <div className="grid grid-cols-[1fr_auto] gap-4 border-b border-border px-4 pb-3 text-sm text-muted sm:grid-cols-[1fr_12rem]">
            <span>Agent</span>
            <span>Last edited</span>
          </div>
          {shown.length ? (
            <ul>
              {shown.map((agent) => (
                <li key={agent.id} className="border-b border-border">
                  <Link
                    href={`/dashboard/agents/${agent.id}`}
                    className="grid grid-cols-[1fr_auto] items-center gap-4 px-4 py-4 transition hover:bg-background sm:grid-cols-[1fr_12rem]"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <AgentGlyph size={30} />
                      <span className="truncate font-medium text-ink">{agent.name}</span>
                      <span className="hidden rounded-full border border-border px-2 py-0.5 text-[11px] text-muted sm:inline">
                        {STATUS_LABEL[agent.status] ?? agent.status}
                      </span>
                    </span>
                    <span className="text-sm text-muted">
                      {now === null ? formatDate(agent.updatedAt) : timeAgo(agent.updatedAt, now)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-8 text-sm text-muted">
              {agents.length ? "No agents match that search." : "Your agent is being set up. It will appear here once our team has added it."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
