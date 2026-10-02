"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { AgentGlyph } from "./icons";

type WidgetStatus = "idle" | "connecting" | "connected" | "failed";

/** The parts of Dograh's widget API (docs.dograh.com/voice-agent/add-to-website) used here. */
type DograhWidget = {
  start: () => void;
  end: () => void;
  setContext: (vars: Record<string, unknown>) => void;
  onStatusChange: (cb: (status: WidgetStatus) => void) => void;
  onCallConnected: (cb: (info: { workflowRunId: number }) => void) => void;
  onCallDisconnected: (cb: () => void) => void;
  onError: (cb: (err: Error) => void) => void;
};

declare global {
  interface Window {
    DograhWidget?: DograhWidget;
  }
}

type Phase = "loading" | "ready" | "connecting" | "live" | "saving" | "unavailable";

type CallResult = {
  status: string;
  summary: string | null;
  outcome: string | null;
  duration: number | null;
  failureReason: string | null;
};

const SCRIPT_ID = "dograh-widget";
const POLL_MS = 5000;
// Transcripts usually land within seconds of hanging up; three minutes covers a slow analysis.
const POLL_LIMIT = 36;

function loadWidget(src: string): Promise<DograhWidget> {
  return new Promise((resolve, reject) => {
    if (!document.getElementById(SCRIPT_ID)) {
      const script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src = src;
      script.async = true;
      script.onerror = () => reject(new Error("Could not load Dograh's call widget."));
      document.body.appendChild(script);
    }
    let tries = 0;
    const check = () => {
      if (window.DograhWidget) resolve(window.DograhWidget);
      else if (tries++ > 100) reject(new Error("Dograh's call widget did not start."));
      else setTimeout(check, 100);
    };
    check();
  });
}

async function postJson(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong. Try again.");
  return data;
}

/**
 * "Test agent" by voice: a live call in the browser through Dograh's website
 * widget, with the saved agent. The call is recorded like any other, so its
 * summary shows here and on the Calls page.
 */
export function BrowserCallPanel({ agentId, unsaved }: { agentId: string; unsaved: boolean }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState("");
  const [result, setResult] = useState<CallResult | null>(null);
  const widget = useRef<DograhWidget | null>(null);
  const nextCode = useRef<string | null>(null);
  const callCode = useRef<string | null>(null);
  const attemptId = useRef<Promise<string | null> | null>(null);
  const mounted = useRef(true);
  const inCall = useRef(false);

  // Each call needs its own code, so a fresh one is fetched before every call.
  async function prepare() {
    const { code, widgetUrl } = await postJson(`/api/agents/${agentId}/browser-call`);
    nextCode.current = code;
    if (!widget.current) widget.current = await loadWidget(widgetUrl);
  }

  async function waitForResult(id: string) {
    for (let i = 0; i < POLL_LIMIT && mounted.current; i++) {
      const res = await fetch(`/api/agents/${agentId}/browser-call/attempt?id=${id}`);
      const data: CallResult = await res.json().catch(() => null);
      if (res.ok && data?.status && data.status !== "dispatched") return data;
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
    return null;
  }

  useEffect(() => {
    mounted.current = true;
    prepare()
      .then(() => {
        const w = widget.current!;
        w.onStatusChange((status) => {
          inCall.current = status === "connecting" || status === "connected";
          if (status === "connecting") setPhase("connecting");
          if (status === "connected") setPhase("live");
          if (status === "failed") {
            setError("The call could not connect. Check the microphone permission and try again.");
            setPhase("ready");
          }
        });
        w.onError((err) => setError(err.message));
        w.onCallConnected(({ workflowRunId }) => {
          attemptId.current = postJson(`/api/agents/${agentId}/browser-call/attempt`, {
            code: callCode.current,
            workflowRunId,
          })
            .then((data) => data.attemptId as string)
            .catch((err) => {
              setError(err.message);
              return null;
            });
        });
        w.onCallDisconnected(async () => {
          setPhase("saving");
          const id = await attemptId.current;
          const found = id ? await waitForResult(id) : null;
          if (!mounted.current) return;
          if (id && !found) setError("The result is taking a while. It will appear on the Calls page.");
          setResult(found);
          await prepare().catch((err) => setError(err.message));
          setPhase("ready");
        });
        if (mounted.current) setPhase("ready");
      })
      .catch((err) => {
        if (!mounted.current) return;
        setError(err.message);
        setPhase("unavailable");
      });

    return () => {
      mounted.current = false;
      if (inCall.current) widget.current?.end();
    };
    // The widget keeps one listener per event, so these are registered once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  function start() {
    if (!widget.current || !nextCode.current) return;
    setError("");
    setResult(null);
    attemptId.current = null;
    callCode.current = nextCode.current;
    widget.current.setContext({ caller_number: callCode.current });
    // Must run inside the click so the browser grants the microphone.
    widget.current.start();
  }

  const busy = phase === "connecting" || phase === "live";

  return (
    <div className="flex h-full flex-col">
      <p className="pb-3 text-xs text-muted">
        A real voice call in your browser through Dograh, with the saved agent. Allow the microphone when asked.
        {unsaved ? " You have unsaved changes; save them first to hear them." : ""}
      </p>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <AgentGlyph size={56} faded={!busy} />
          <button
            type="button"
            disabled={phase === "loading" || phase === "saving" || phase === "unavailable"}
            onClick={() => (busy ? widget.current?.end() : start())}
            className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-surface disabled:opacity-60"
          >
            {phase === "loading"
              ? "Getting ready…"
              : phase === "connecting"
                ? "Connecting…"
                : phase === "live"
                  ? "End call"
                  : phase === "saving"
                    ? "Saving the call…"
                    : "Start voice call"}
          </button>
          {phase === "live" ? <p className="text-sm text-accent">Live. Speak as the caller would.</p> : null}
        </div>

        {result ? (
          <div className="rounded-lg bg-background p-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Call result</p>
            <p className="mt-2 text-foreground">
              {result.outcome ? result.outcome.replace(/_/g, " ") : result.status}
              {result.duration ? ` · ${result.duration}s` : ""}
            </p>
            {result.summary ? <p className="mt-2 leading-relaxed text-foreground">{result.summary}</p> : null}
            {result.failureReason ? <p className="mt-2 text-muted">{result.failureReason}</p> : null}
            <Link href="/dashboard/calls" className="mt-3 inline-block text-xs font-semibold text-accent hover:underline">
              See it on the Calls page
            </Link>
          </div>
        ) : null}
        {error ? <p className="mt-3 text-sm text-warn">{error}</p> : null}
      </div>
    </div>
  );
}
