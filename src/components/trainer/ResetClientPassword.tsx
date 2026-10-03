"use client";

import { useState } from "react";

type Props = { userId: string; email: string; businessName: string };
type Reset = { email: string; password: string; loginUrl: string };

/**
 * One owner login with a "Reset password" action. The new password is shown once,
 * ready to copy into WhatsApp or email, the same way Add client hands over a login.
 */
export function ResetClientPassword({ userId, email, businessName }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reset, setReset] = useState<Reset | null>(null);
  const [copied, setCopied] = useState(false);

  async function run() {
    if (!confirm(`Give ${email} a new password? Their old password stops working at once.`)) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/trainer/clients/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not reset the password.");
      setReset(data);
      setCopied(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const text = reset
    ? [`Your new ${businessName} login:`, `Login: ${reset.loginUrl}`, `Email: ${reset.email}`, `Password: ${reset.password}`].join("\n")
    : "";

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setError("Copy did not work here. Select the text and copy it by hand.");
    }
  }

  return (
    <div className="text-sm">
      <p className="text-muted">
        {email}{" "}
        <button type="button" onClick={run} disabled={busy} className="font-semibold text-accent hover:underline disabled:opacity-50">
          {busy ? "Resetting…" : "Reset password"}
        </button>
      </p>
      {error ? <p className="text-warn">{error}</p> : null}
      {reset ? (
        <div className="mt-2 rounded-lg border border-border bg-background p-3">
          <pre className="whitespace-pre-wrap text-foreground">{text}</pre>
          <p className="mt-1 text-xs text-muted">This password is not shown again.</p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={copy} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white">
              {copied ? "Copied" : "Copy"}
            </button>
            <button type="button" onClick={() => setReset(null)} className="px-2 py-1.5 text-xs text-muted hover:text-ink">
              Done
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
