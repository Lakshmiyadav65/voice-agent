"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  businessId: string;
  name: string;
  balanceLabel: string;
  ratePaise: number;
  low: boolean;
};

export function BusinessCreditsRow({ businessId, name, balanceLabel, ratePaise, low }: Props) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [rate, setRate] = useState(String(ratePaise / 100));
  const [message, setMessage] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(method: "POST" | "PUT", body: Record<string, unknown>, done: string) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/billing/credits", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setMessage({ tone: "good", text: done });
      router.refresh();
    } catch (err) {
      setMessage({ tone: "bad", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  function addCredit(event: React.FormEvent) {
    event.preventDefault();
    const value = Number(amount);
    if (!value) return;
    if (!window.confirm(`${value > 0 ? "Add" : "Remove"} ₹${Math.abs(value)} ${value > 0 ? "to" : "from"} ${name}?`)) return;
    send("POST", { amountRupees: value, kind: value > 0 ? "topup" : "adjustment", note }, "Credit updated.").then(() => {
      setAmount("");
      setNote("");
    });
  }

  const input = "rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-ink outline-hidden focus:border-accent";

  return (
    <li className="space-y-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium text-ink">{name}</p>
        <p className={`text-sm tabular-nums ${low ? "font-semibold text-warn" : "text-foreground"}`}>
          Balance {balanceLabel}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <form onSubmit={addCredit} className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            step="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="₹ amount (negative removes)"
            aria-label="Amount in rupees"
            className={`${input} w-52`}
          />
          <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="Note, e.g. UPI ref" aria-label="Note" className={`${input} w-44`} />
          <button type="submit" disabled={busy || !Number(amount)} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
            Apply
          </button>
        </form>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <label className="flex items-center gap-2 text-sm text-muted">
          Rate ₹
          <input type="number" min={0} step="0.5" value={rate} onChange={(e) => setRate(e.target.value)} aria-label="Rate per minute in rupees" className={`${input} w-20`} />
          /min
        </label>
        <button
          type="button"
          disabled={busy || Number(rate) * 100 === ratePaise}
          onClick={() => send("PUT", { ratePerMinuteRupees: Number(rate) }, "Rate saved.")}
          className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-foreground disabled:opacity-50"
        >
          Save rate
        </button>
      </div>
      {message ? <p className={`text-xs ${message.tone === "good" ? "text-accent" : "text-warn"}`}>{message.text}</p> : null}
    </li>
  );
}
