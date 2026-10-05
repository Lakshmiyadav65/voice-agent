"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { BUILT_IN_VARIABLES, keyFromName, type AgentSettings } from "@/lib/voice/agent-settings";
import type { AgentTest, TestRun } from "@/lib/voice/agent-tests";
import type { AgentTraining } from "@/lib/voice/agent-training";
import {
  AgentGlyph,
  BackIcon,
  InstructionsIcon,
  PhoneIcon,
  SettingsIcon,
  SparkleIcon,
  TestsIcon,
  ToolsIcon,
  TrainingIcon,
  VariablesIcon,
} from "./icons";
import { InstructionsSection } from "./InstructionsSection";
import { SettingsSection } from "./SettingsSection";
import { GeniePanel, TestChatPanel } from "./SidePanels";
import { TestsSection } from "./TestsSection";
import { ToolsSection } from "./ToolsSection";
import { TrainingSection } from "./TrainingSection";
import { VariablesSection } from "./VariablesSection";

export type SectionId = "training" | "instructions" | "variables" | "tools" | "settings" | "tests";

const SECTIONS: { id: SectionId; label: string; icon: ReactNode; blurb: string }[] = [
  { id: "training", label: "Training", icon: <TrainingIcon />, blurb: "How our team trained your agent." },
  { id: "instructions", label: "Instructions", icon: <InstructionsIcon />, blurb: "What the agent says first and how it handles every call." },
  { id: "variables", label: "Variables", icon: <VariablesIcon />, blurb: "Values filled into the greeting and instructions." },
  { id: "tools", label: "Tools", icon: <ToolsIcon />, blurb: "Actions the agent can take during a call." },
  { id: "settings", label: "Settings", icon: <SettingsIcon />, blurb: "How the agent sounds, listens and handles the call." },
  { id: "tests", label: "Tests", icon: <TestsIcon />, blurb: "Check the agent against callers you describe." },
];

type Props = {
  agentId: string;
  initialName: string;
  initialSettings: AgentSettings;
  initialTests: AgentTest[];
  initialSection: SectionId;
  // Recorded by staff; shown read-only.
  training: AgentTraining | null;
};

/** Problems that would make the server drop part of a save, caught before sending. */
function findProblem(settings: AgentSettings, tests: AgentTest[]): { section: SectionId; message: string } | null {
  const reserved = new Set(BUILT_IN_VARIABLES.map((v) => v.key));
  const keys = settings.variables.map((v) => keyFromName(v.key));
  if (keys.some((k) => !k)) return { section: "variables", message: "Give every variable a name, or remove the empty ones." };
  if (keys.some((k) => reserved.has(k))) return { section: "variables", message: "One of your variables uses a name that is filled in automatically." };
  if (new Set(keys).size !== keys.length) return { section: "variables", message: "Two variables have the same name." };
  for (const tool of settings.tools) {
    if (!keyFromName(tool.name)) return { section: "tools", message: "Give every API tool a name." };
    if (!/^https:\/\/[^\s/]+\.[^\s]+$/i.test(tool.url)) return { section: "tools", message: `Give "${tool.name}" a public https:// address.` };
  }
  if (tests.some((t) => !t.name.trim())) return { section: "tests", message: "Give every test a name." };
  return null;
}

export function AgentBuilder({ agentId, initialName, initialSettings, initialTests, initialSection, training }: Props) {
  const [section, setSection] = useState<SectionId>(initialSection);
  const [panel, setPanelState] = useState<"genie" | "test" | null>("genie");
  // Genie starts open beside the editor on wide screens; on phones it stays hidden until asked for.
  const [panelChosen, setPanelChosen] = useState(false);
  const setPanel = (next: "genie" | "test" | null) => {
    setPanelState(next);
    setPanelChosen(true);
  };
  const [name, setName] = useState(initialName);
  const [settings, setSettings] = useState(initialSettings);
  const [tests, setTests] = useState(initialTests);
  const [saved, setSaved] = useState({ name: initialName, settings: initialSettings, tests: initialTests });
  const [editingName, setEditingName] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState("");

  const agentDirty = name !== saved.name || JSON.stringify(settings) !== JSON.stringify(saved.settings);
  const testsDirty = JSON.stringify(tests) !== JSON.stringify(saved.tests);
  const dirty = agentDirty || testsDirty;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function go(id: SectionId) {
    setSection(id);
    const url = new URL(window.location.href);
    url.searchParams.set("section", id);
    window.history.replaceState(null, "", url);
  }

  function edit<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setStatus("idle");
    };
  }

  async function saveTests(list: AgentTest[]): Promise<AgentTest[]> {
    const res = await fetch(`/api/agents/${agentId}/tests`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tests: list }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Could not save the tests.");
    return data.tests;
  }

  async function save() {
    const problem = findProblem(settings, tests);
    if (problem) {
      go(problem.section);
      setError(problem.message);
      return;
    }
    setStatus("saving");
    setError("");
    try {
      let next = { name, settings, tests };
      if (agentDirty) {
        const res = await fetch(`/api/agents/${agentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, settings }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Could not save.");
        next = { ...next, name: data.name, settings: data.settings };
      }
      if (testsDirty) next = { ...next, tests: await saveTests(tests) };
      setName(next.name);
      setSettings(next.settings);
      setTests(next.tests);
      setSaved(next);
      setStatus("saved");
    } catch (err) {
      setError((err as Error).message);
      setStatus("idle");
    }
  }

  async function runTest(testId: string) {
    let current = tests;
    if (testsDirty) {
      current = await saveTests(tests);
      setTests(current);
      setSaved((s) => ({ ...s, tests: current }));
    }
    const res = await fetch(`/api/agents/${agentId}/tests/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ testId, settings }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "The test could not run.");
    const run = data.run as TestRun;
    const withRun = (list: AgentTest[]) => list.map((t) => (t.id === testId ? { ...t, lastRun: run } : t));
    setTests(withRun);
    setSaved((s) => ({ ...s, tests: withRun(s.tests) }));
  }

  const meta = SECTIONS.find((s) => s.id === section)!;

  return (
    <div className="flex min-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-2xl border border-border bg-surface">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 sm:px-6">
        <Link href="/dashboard/agents" aria-label="Back to agents" className="rounded-full p-1.5 text-muted hover:bg-background hover:text-ink">
          <BackIcon />
        </Link>
        <AgentGlyph size={28} />
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {editingName ? (
            <input
              autoFocus
              value={name}
              maxLength={60}
              aria-label="Agent name"
              onChange={(e) => edit(setName)(e.target.value)}
              onBlur={() => setEditingName(false)}
              onKeyDown={(e) => e.key === "Enter" && setEditingName(false)}
              className="min-w-0 rounded-md border border-accent bg-background px-2 py-1 text-lg text-ink outline-hidden"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingName(true)}
              title="Rename"
              className="truncate text-lg text-ink hover:underline"
            >
              {name}
            </button>
          )}
          <span className="text-muted">/</span>
          <span className="shrink-0 text-sm text-muted">{dirty ? "Unsaved changes" : "Saved"}</span>
        </div>
        <div className="flex items-center gap-2">
          {status === "saved" && !dirty ? <span className="hidden text-sm text-accent sm:inline">Saved. Applies from the next call.</span> : null}
          <button
            type="button"
            onClick={save}
            disabled={!dirty || status === "saving"}
            className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-ink transition hover:border-accent disabled:opacity-40"
          >
            {status === "saving" ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setPanel(panel === "test" ? null : "test")}
            className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-surface transition hover:opacity-90"
          >
            <PhoneIcon />
            Test agent
          </button>
          <button
            type="button"
            onClick={() => {
              // Before any choice, Genie is only on screen on wide layouts.
              const showing = panel === "genie" && (panelChosen || window.matchMedia("(min-width: 1024px)").matches);
              setPanel(showing ? null : "genie");
            }}
            aria-pressed={panel === "genie"}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-sm font-semibold transition ${
              panel === "genie" ? "border-accent text-accent" : "border-border text-ink hover:border-accent"
            }`}
          >
            <SparkleIcon />
            Genie
          </button>
        </div>
        {error ? <p className="w-full text-sm text-warn">{error}</p> : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Section nav */}
        <nav aria-label="Agent sections" className="border-b border-border p-2 lg:w-52 lg:shrink-0 lg:border-b-0 lg:border-r lg:p-4">
          <ul className="flex gap-1 overflow-x-auto lg:flex-col">
            {SECTIONS.map((s) => (
              <li key={s.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => go(s.id)}
                  aria-current={section === s.id ? "page" : undefined}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                    section === s.id ? "bg-background font-semibold text-ink" : "text-foreground hover:bg-background"
                  }`}
                >
                  {s.icon}
                  {s.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Section content */}
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-8">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-lg font-semibold text-ink">{meta.label}</h2>
            <p className="mb-6 text-sm text-muted">{meta.blurb}</p>
            {section === "training" ? (
              <TrainingSection training={training} />
            ) : section === "instructions" ? (
              <InstructionsSection settings={settings} onChange={edit(setSettings)} />
            ) : section === "variables" ? (
              <VariablesSection settings={settings} onChange={edit(setSettings)} />
            ) : section === "tools" ? (
              <ToolsSection settings={settings} onChange={edit(setSettings)} />
            ) : section === "settings" ? (
              <SettingsSection settings={settings} onChange={edit(setSettings)} />
            ) : (
              <TestsSection tests={tests} onChange={edit(setTests)} onRun={runTest} />
            )}
          </div>
        </main>

        {/* Genie / test call */}
        {panel ? (
          <aside className={`${panelChosen ? "" : "hidden lg:block"} border-t border-border p-4 lg:sticky lg:top-0 lg:h-[calc(100vh-2rem)] lg:w-96 lg:shrink-0 lg:border-l lg:border-t-0`}>
            <div className="mb-3 flex items-center justify-between">
              <p className="flex items-center gap-2 text-base font-medium text-ink">
                {panel === "genie" ? <SparkleIcon /> : <PhoneIcon />}
                {panel === "genie" ? "Genie" : "Test agent"}
              </p>
              <button type="button" onClick={() => setPanel(null)} className="text-xs font-semibold text-muted hover:text-ink">
                Close
              </button>
            </div>
            <div className="h-[28rem] lg:h-[calc(100%-2.5rem)]">
              {panel === "genie" ? (
                <GeniePanel
                  agentId={agentId}
                  name={name}
                  settings={settings}
                  onApply={(n, s) => {
                    setName(n);
                    setSettings(s);
                    setStatus("idle");
                  }}
                />
              ) : (
                <TestChatPanel agentId={agentId} settings={settings} />
              )}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
