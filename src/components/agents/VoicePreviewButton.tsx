"use client";

import { useEffect, useRef, useState } from "react";

import type { AgentLanguage } from "@/lib/voice/agent-settings";

type Props = { voice: string; language: AgentLanguage; pace: number };

/** Plays a short sample of a voice in a language, at the agent's speaking speed. Click again to stop. */
export function VoicePreviewButton({ voice, language, pace }: Props) {
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  const [error, setError] = useState("");
  const audio = useRef<HTMLAudioElement | null>(null);
  const url = useRef<string | null>(null);

  function stop() {
    audio.current?.pause();
    audio.current = null;
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = null;
    setState("idle");
  }

  useEffect(() => stop, []);

  async function play() {
    if (state !== "idle") return stop();
    setError("");
    setState("loading");
    try {
      const res = await fetch("/api/voices/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voice, language, pace }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          data.error === "not_configured"
            ? "Voice preview needs a Sarvam speech API key on the server."
            : data.error ?? "Couldn't play this voice."
        );
      }
      url.current = URL.createObjectURL(await res.blob());
      const el = new Audio(url.current);
      audio.current = el;
      el.onended = stop;
      await el.play();
      setState("playing");
    } catch (err) {
      stop();
      setError((err as Error).message);
    }
  }

  const label = state === "playing" ? "Stop" : `Play ${voice} in ${language}`;

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={play}
        aria-label={label}
        title={error || label}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition ${
          error ? "border-warn text-warn" : "border-border text-ink hover:border-accent hover:text-accent"
        }`}
      >
        {state === "loading" ? (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : state === "playing" ? (
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
            <path d="M8 5.5v13a1 1 0 0 0 1.5.9l10-6.5a1 1 0 0 0 0-1.7l-10-6.5A1 1 0 0 0 8 5.5z" />
          </svg>
        )}
      </button>
      {error ? (
        <span role="alert" className="absolute right-0 top-full z-10 mt-1 w-56 rounded-lg bg-ink px-2.5 py-1.5 text-[11px] text-surface shadow">
          {error}
        </span>
      ) : null}
    </span>
  );
}
