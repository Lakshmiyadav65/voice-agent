"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AgentGlyph, ArrowUpIcon, PhoneIcon, PlusIcon, SearchIcon } from "./icons";

export type AgentRow = { id: string; name: string; status: string; updatedAt: string };

const STATUS_LABEL: Record<string, string> = { draft: "Draft", testing: "Testing", live: "Live", paused: "Paused" };

function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function AgentsHome({ agents, canCreate }: { agents: AgentRow[]; canCreate: boolean }) {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState<"describe" | "scratch" | null>(null);
  const [error, setError] = useState("");

  async function create(fromDescription: boolean) {
    if (creating || (fromDescription && !description.trim())) return;
    setCreating(fromDescription ? "describe" : "scratch");
    setError("");
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fromDescription ? { description } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not create the agent.");
      router.push(`/dashboard/agents/${data.id}`);
    } catch (err) {
      setError((err as Error).message);
      setCreating(null);
    }
  }

  const shown = agents.filter((a) => a.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="min-h-[calc(100vh-2rem)] rounded-2xl border border-border bg-surface px-4 py-5 sm:px-8 sm:py-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-medium text-ink">Agents</h1>
        {canCreate ? (
          <button
            type="button"
            onClick={() => create(false)}
            disabled={creating !== null}
            className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-surface transition hover:opacity-90 disabled:opacity-60"
          >
            <PlusIcon />
            {creating === "scratch" ? "Creating…" : "Create from scratch"}
          </button>
        ) : null}
      </div>

      <div className="mx-auto flex max-w-3xl flex-col items-center pt-12 text-center sm:pt-16">
        <AgentGlyph size={96} faded />
        <h2 className="mt-8 font-display text-3xl text-ink sm:text-5xl">What should your voice agent do?</h2>

        {canCreate ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              create(true);
            }}
            className="mt-10 flex w-full items-center gap-3 rounded-full border border-border bg-background py-2 pl-5 pr-2 shadow-xs focus-within:border-accent"
          >
            <span className="shrink-0 text-muted">
              <PhoneIcon />
            </span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={1000}
              placeholder="Create a voice agent to call people who filled our site-visit form"
              aria-label="Describe your agent"
              className="min-w-0 flex-1 bg-transparent py-2 text-sm text-ink outline-hidden placeholder:text-muted sm:text-base"
            />
            <button
              type="submit"
              aria-label="Create agent from description"
              disabled={!description.trim() || creating !== null}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink text-surface transition hover:opacity-90 disabled:bg-muted"
            >
              {creating === "describe" ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-surface border-t-transparent" /> : <ArrowUpIcon />}
            </button>
          </form>
        ) : (
          <p className="mt-6 text-sm text-muted">Agents are created from a business account.</p>
        )}
        {creating === "describe" ? <p className="mt-3 text-sm text-muted">Drafting your agent…</p> : null}
        {error ? <p className="mt-3 text-sm text-warn">{error}</p> : null}
      </div>

      <div className="mx-auto mt-14 max-w-4xl">
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
                    <span className="text-sm text-muted">{timeAgo(agent.updatedAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-8 text-sm text-muted">
              {agents.length ? "No agents match that search." : "No agents yet. Describe one above to get started."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
