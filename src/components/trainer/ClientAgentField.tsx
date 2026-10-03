"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = { employeeId: string; employeeName: string; sarvamAgentId: string | null };

/**
 * Which Sarvam agent a client's calls use, changeable in place, so staff link a
 * newly trained agent here instead of editing any file.
 */
export function ClientAgentField({ employeeId, employeeName, sarvamAgentId }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function start() {
    setValue(sarvamAgentId ?? "");
    setError("");
    setEditing(true);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/trainer/clients", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, sarvamAgentId: value.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not save the agent.");
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <p className="text-foreground">
        {employeeName}{" "}
        <span className="text-muted">
          ({sarvamAgentId ? <span className="font-mono">{sarvamAgentId}</span> : "shared agent"})
        </span>{" "}
        <button type="button" onClick={start} className="font-semibold text-accent hover:underline">
          {sarvamAgentId ? "Change" : "Link agent"}
        </button>
      </p>
    );
  }

  return (
    <form onSubmit={save} className="flex flex-wrap items-center justify-end gap-2">
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Sarvam agent ID (blank = shared agent)"
        aria-label={`Sarvam agent ID for ${employeeName}`}
        className="w-72 rounded-lg border border-border bg-background px-3 py-1.5 font-mono text-sm text-ink outline-hidden focus:border-accent"
      />
      <button type="submit" disabled={busy} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
        {busy ? "Saving…" : "Save"}
      </button>
      <button type="button" onClick={() => setEditing(false)} className="px-2 py-1.5 text-sm text-muted hover:text-ink">
        Cancel
      </button>
      {error ? <p className="w-full text-right text-sm text-warn">{error}</p> : null}
    </form>
  );
}
