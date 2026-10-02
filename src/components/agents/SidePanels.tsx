"use client";

import { useEffect, useRef, useState } from "react";

import type { AgentSettings } from "@/lib/voice/agent-settings";
import type { TranscriptLine } from "@/lib/voice/agent-tests";
import { BrowserCallPanel } from "./BrowserCallPanel";
import { AgentGlyph, ArrowUpIcon } from "./icons";

const SUGGESTIONS = [
  "Rename this agent and tighten the greeting",
  "Switch the voice to Hindi and slow the pace",
  "Nudge the caller if they go quiet for 6 seconds",
];

type GenieTurn = { role: "user" | "genie"; text: string; undo?: { name: string; settings: AgentSettings } };

function Composer({
  placeholder,
  disabled,
  onSend,
}: {
  placeholder: string;
  disabled: boolean;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim() || disabled) return;
        onSend(text.trim());
        setText("");
      }}
      className="rounded-2xl border border-border bg-background p-3 focus-within:border-accent"
    >
      <textarea
        value={text}
        rows={2}
        maxLength={1000}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }
        }}
        className="w-full resize-none bg-transparent text-sm text-ink outline-hidden placeholder:text-muted"
      />
      <div className="flex justify-end">
        <button
          type="submit"
          aria-label="Send"
          disabled={disabled || !text.trim()}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-surface disabled:bg-muted"
        >
          <ArrowUpIcon />
        </button>
      </div>
    </form>
  );
}

export function GeniePanel({
  agentId,
  name,
  settings,
  onApply,
}: {
  agentId: string;
  name: string;
  settings: AgentSettings;
  onApply: (name: string, settings: AgentSettings) => void;
}) {
  const [turns, setTurns] = useState<GenieTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [turns, busy]);

  async function ask(request: string) {
    const before = { name, settings };
    setTurns((t) => [...t, { role: "user", text: request }]);
    setBusy(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/genie`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request, name, settings, history: turns.map(({ role, text }) => ({ role, text })) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Genie is unavailable right now.");
      const changed = data.name !== name || JSON.stringify(data.settings) !== JSON.stringify(settings);
      if (changed) onApply(data.name, data.settings);
      setTurns((t) => [...t, { role: "genie", text: data.reply, ...(changed ? { undo: before } : {}) }]);
    } catch (err) {
      setTurns((t) => [...t, { role: "genie", text: (err as Error).message }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {turns.length === 0 ? (
          <div className="pt-6">
            <AgentGlyph size={56} faded />
            <p className="mt-6 font-display text-2xl text-ink">What&apos;s on your mind?</p>
            <ul className="mt-4 divide-y divide-border">
              {SUGGESTIONS.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => ask(s)}
                    className="w-full py-3 text-left text-sm text-foreground hover:text-accent"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ul className="space-y-3 pb-2">
            {turns.map((turn, i) => (
              <li key={i} className={turn.role === "user" ? "flex justify-end" : ""}>
                <div
                  className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm ${
                    turn.role === "user" ? "bg-ink text-surface" : "bg-background text-foreground"
                  }`}
                >
                  {turn.text}
                  {turn.undo ? (
                    <div className="mt-2 flex items-center gap-3 text-xs">
                      <span className="text-muted">Changes added to your draft. Review, then Save.</span>
                      <button
                        type="button"
                        onClick={() => {
                          onApply(turn.undo!.name, turn.undo!.settings);
                          setTurns((t) => t.map((x, j) => (j === i ? { ...x, undo: undefined, text: `${x.text} (undone)` } : x)));
                        }}
                        className="font-semibold text-accent hover:underline"
                      >
                        Undo
                      </button>
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
            {busy ? <li className="text-sm text-muted">Genie is thinking…</li> : null}
          </ul>
        )}
        <div ref={end} />
      </div>
      <Composer placeholder="What's on your mind?" disabled={busy} onSend={ask} />
    </div>
  );
}

/** "Test agent": a text chat with the draft, or a voice call with the saved agent. */
export function TestAgentPanel({
  agentId,
  settings,
  unsaved,
}: {
  agentId: string;
  settings: AgentSettings;
  unsaved: boolean;
}) {
  const [mode, setMode] = useState<"text" | "voice">("text");
  return (
    <div className="flex h-full flex-col">
      <div role="tablist" aria-label="How to test" className="mb-3 flex gap-1 rounded-full border border-border p-1">
        {(["text", "voice"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`flex-1 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              mode === m ? "bg-ink text-surface" : "text-muted hover:text-ink"
            }`}
          >
            {m === "text" ? "Text chat" : "Voice call"}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        {mode === "text" ? (
          <TestChatPanel agentId={agentId} settings={settings} />
        ) : (
          <BrowserCallPanel agentId={agentId} unsaved={unsaved} />
        )}
      </div>
    </div>
  );
}

export function TestChatPanel({ agentId, settings }: { agentId: string; settings: AgentSettings }) {
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [lines, busy]);

  async function send(transcript: TranscriptLine[]) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/agents/${agentId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, settings }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "The agent didn't answer. Try again.");
      setLines([...transcript, { role: "agent", text: data.reply }]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 pb-3">
        <p className="text-xs text-muted">
          A text call with your draft: instructions, variables and knowledge. Voice and sound settings only apply on
          real calls.
        </p>
        {lines.length ? (
          <button type="button" onClick={() => setLines([])} className="shrink-0 text-xs font-semibold text-accent">
            Restart
          </button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {lines.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 py-10 text-center">
            <AgentGlyph size={56} faded />
            <button
              type="button"
              disabled={busy}
              onClick={() => send([])}
              className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-surface disabled:opacity-60"
            >
              {busy ? "Connecting…" : "Start test call"}
            </button>
          </div>
        ) : (
          <ul className="space-y-3 pb-2">
            {lines.map((line, i) => (
              <li key={i} className={line.role === "caller" ? "flex justify-end" : ""}>
                <div
                  className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm ${
                    line.role === "caller" ? "bg-ink text-surface" : "bg-background text-foreground"
                  }`}
                >
                  {line.text}
                </div>
              </li>
            ))}
            {busy ? <li className="text-sm text-muted">Agent is replying…</li> : null}
          </ul>
        )}
        {error ? <p className="text-sm text-warn">{error}</p> : null}
        <div ref={end} />
      </div>
      {lines.length ? (
        <Composer
          placeholder="Reply as the caller…"
          disabled={busy}
          onSend={(text) => {
            const next: TranscriptLine[] = [...lines, { role: "caller", text }];
            setLines(next);
            send(next);
          }}
        />
      ) : null}
    </div>
  );
}
