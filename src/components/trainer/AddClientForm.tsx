"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Created = { loginUrl: string; email: string; password: string };

// No 0/O or 1/l/I, so a password read out over the phone survives.
const PASSWORD_ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generatePassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const chars = Array.from(bytes, (b) => PASSWORD_ALPHABET[b % PASSWORD_ALPHABET.length]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8)}`;
}

function shareText({ loginUrl, email, password }: Created, businessName: string): string {
  return [
    `Your ${businessName} dashboard is ready.`,
    `Login: ${loginUrl}`,
    `Email: ${email}`,
    `Password: ${password}`,
  ].join("\n");
}

/**
 * Staff create a client's login, business and AI employee in one go, linked to
 * the agent they trained in Sarvam, then copy the login details to send to the
 * client (WhatsApp, email...).
 */
export function AddClientForm({ startOpen = false }: { startOpen?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(startOpen);
  const [businessName, setBusinessName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agentName, setAgentName] = useState("");
  const [sarvamAgentId, setSarvamAgentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<Created | null>(null);
  const [copied, setCopied] = useState(false);

  function start() {
    setBusinessName("");
    setOwnerName("");
    setEmail("");
    setPassword(generatePassword());
    setAgentName("");
    setSarvamAgentId("");
    setError("");
    setCreated(null);
    setCopied(false);
    setOpen(true);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      // A form that opens with the page has no password yet; one is made here rather than
      // during render, where server and browser would each pick a different one.
      const finalPassword = password || generatePassword();
      const res = await fetch("/api/trainer/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName,
          ownerName,
          email,
          password: finalPassword,
          agentName,
          sarvamAgentId: sarvamAgentId.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not add the client.");
      setCreated({ loginUrl: data.loginUrl, email: data.email, password: data.password });
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(shareText(created, businessName));
      setCopied(true);
    } catch {
      setError("Copy did not work here. Select the text and copy it by hand.");
    }
  }

  const input = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-ink outline-hidden focus:border-accent";
  const label = "block text-sm font-medium text-ink";

  if (!open) {
    return (
      <button type="button" onClick={start} className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-surface">
        Add client
      </button>
    );
  }

  if (created) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="text-sm font-semibold text-accent">Client created. Send them these login details:</p>
        <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-background p-3 text-sm text-foreground">
          {shareText(created, businessName)}
        </pre>
        <p className="mt-2 text-xs text-muted">
          The password is not shown again. If it gets lost, the login has to be reset in Supabase.
        </p>
        {error ? <p className="mt-2 text-sm text-warn">{error}</p> : null}
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={copy} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white">
            {copied ? "Copied" : "Copy"}
          </button>
          <button type="button" onClick={start} className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-ink">
            Add another client
          </button>
          <button type="button" onClick={() => setOpen(false)} className="px-3 py-1.5 text-sm text-muted hover:text-ink">
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Business name
          <input required value={businessName} onChange={(e) => setBusinessName(e.target.value)} className={`${input} mt-1`} />
        </label>
        <label className={label}>
          Owner name
          <input required value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className={`${input} mt-1`} />
        </label>
        <label className={label}>
          Owner email
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={`${input} mt-1`} />
        </label>
        <label className={label}>
          Password
          <span className="mt-1 flex gap-2">
            <input
              minLength={8}
              value={password}
              placeholder="Leave blank to create one"
              onChange={(e) => setPassword(e.target.value)}
              className={`${input} font-mono`}
            />
            <button
              type="button"
              onClick={() => setPassword(generatePassword())}
              className="shrink-0 rounded-lg border border-border px-3 text-xs font-semibold text-ink"
            >
              New
            </button>
          </span>
        </label>
        <label className={label}>
          Agent name
          <input
            value={agentName}
            placeholder="e.g. Priya"
            onChange={(e) => setAgentName(e.target.value)}
            className={`${input} mt-1`}
          />
        </label>
        <label className={label}>
          Sarvam agent ID
          <input
            value={sarvamAgentId}
            placeholder="Leave blank for the shared agent"
            onChange={(e) => setSarvamAgentId(e.target.value)}
            className={`${input} mt-1 font-mono`}
          />
          <span className="mt-1 block text-xs text-muted">From the agent you trained for this client in Sarvam&apos;s console.</span>
        </label>
      </div>
      {error ? <p className="text-sm text-warn">{error}</p> : null}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? "Creating…" : "Create client"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="px-3 py-2 text-sm text-muted hover:text-ink">
          Cancel
        </button>
      </div>
    </form>
  );
}
