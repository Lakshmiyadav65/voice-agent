"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AGENT_LANGUAGES, AGENT_VOICES } from "@/lib/voice/agent-settings";
import { formatTrainingDate, TRAINING_LIMITS, type AgentTraining } from "@/lib/voice/agent-training";

type Props = { employeeId: string; employeeName: string; training: AgentTraining | null };

/**
 * Where staff record what they trained for a client in Sarvam's console. The
 * client reads the same record, read-only, on their agent page.
 */
export function ClientTrainingEditor({ employeeId, employeeName, training }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [greeting, setGreeting] = useState("");
  const [language, setLanguage] = useState("");
  const [voice, setVoice] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function start() {
    setPrompt(training?.prompt ?? "");
    setGreeting(training?.greeting ?? "");
    setLanguage(training?.language ?? "");
    setVoice(training?.voice ?? "");
    setNote("");
    setError("");
    setOpen(true);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/trainer/agent-training", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, prompt, greeting, language, voice, note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not save the training.");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const input = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-ink outline-hidden focus:border-accent";
  const label = "block text-sm font-medium text-ink";

  if (!open) {
    return (
      <p className="text-sm text-muted">
        Training:{" "}
        {training ? (
          <span className="text-foreground">
            updated {formatTrainingDate(training.updatedAt)} by {training.updatedBy}
          </span>
        ) : (
          "not recorded yet"
        )}{" "}
        <button type="button" onClick={start} className="font-semibold text-accent hover:underline">
          {training ? "Edit training" : "Add training"}
        </button>
      </p>
    );
  }

  return (
    <form onSubmit={save} className="mt-2 space-y-3 rounded-xl border border-border bg-background p-4">
      <p className="text-sm text-muted">
        Copy what you set for <span className="font-semibold text-ink">{employeeName}</span> in Sarvam&apos;s console. The
        client sees this on their agent page but cannot change it. It does not change the calls.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={`${label} sm:col-span-3`}>
          Greeting
          <input
            value={greeting}
            maxLength={TRAINING_LIMITS.greeting}
            placeholder="e.g. హలో సర్?"
            onChange={(e) => setGreeting(e.target.value)}
            className={`${input} mt-1`}
          />
        </label>
        <label className={label}>
          Language
          <select value={language} onChange={(e) => setLanguage(e.target.value)} className={`${input} mt-1`}>
            <option value="">Not set</option>
            {AGENT_LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Voice
          <input
            value={voice}
            list="training-voices"
            maxLength={TRAINING_LIMITS.voice}
            placeholder="e.g. pooja"
            onChange={(e) => setVoice(e.target.value)}
            className={`${input} mt-1`}
          />
          <datalist id="training-voices">
            {AGENT_VOICES.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        </label>
        <label className={`${label} sm:col-span-3`}>
          Prompt
          <textarea
            value={prompt}
            rows={12}
            maxLength={TRAINING_LIMITS.prompt}
            placeholder="Paste the agent's prompt from Sarvam"
            onChange={(e) => setPrompt(e.target.value)}
            className={`${input} mt-1 font-mono text-[13px] leading-relaxed`}
          />
        </label>
        <label className={`${label} sm:col-span-3`}>
          What changed?
          <input
            value={note}
            maxLength={TRAINING_LIMITS.note}
            placeholder="e.g. Added Gachibowli prices"
            onChange={(e) => setNote(e.target.value)}
            className={`${input} mt-1`}
          />
          <span className="mt-1 block text-xs text-muted">Optional. Shown to the client in the change history.</span>
        </label>
      </div>
      {error ? <p className="text-sm text-warn">{error}</p> : null}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? "Saving…" : "Save training"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="px-3 py-2 text-sm text-muted hover:text-ink">
          Cancel
        </button>
      </div>
    </form>
  );
}
