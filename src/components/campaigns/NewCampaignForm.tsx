"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { checkContacts, contactsFromCsv, MAX_CONTACTS } from "@/lib/campaigns/contacts";

const SAMPLE = "name,phone,notes\nRavi Kumar,9876543210,Asked about iPhone 16\nAnjali,+91 98123 45678,";

export function NewCampaignForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [maxConcurrent, setMaxConcurrent] = useState(3);
  const [windowStart, setWindowStart] = useState("10:00");
  const [windowEnd, setWindowEnd] = useState("19:00");
  const [maxAttempts, setMaxAttempts] = useState(2);
  const [retryAfterMinutes, setRetryAfterMinutes] = useState(120);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const checked = useMemo(() => checkContacts(contactsFromCsv(csv)), [csv]);
  const tooMany = checked.valid.length > MAX_CONTACTS;

  async function readFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    setCsv(await file.text());
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return setError("Give the campaign a name.");
    if (!checked.valid.length) return setError("Add at least one valid phone number.");
    if (tooMany) return setError(`Upload up to ${MAX_CONTACTS} contacts per campaign.`);

    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          contacts: checked.valid,
          maxConcurrent,
          windowStart,
          windowEnd,
          maxAttempts,
          retryAfterMinutes,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not create the campaign.");
      router.push(`/dashboard/campaigns/${data.id}`);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent/90"
      >
        + New campaign
      </button>
    );
  }

  const input =
    "mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-ink outline-hidden focus:border-accent";
  const label = "text-xs font-semibold text-ink";

  return (
    <form onSubmit={create} className="space-y-6 rounded-xl border border-border bg-surface p-6">
      <div className="flex items-start justify-between gap-4">
        <h2 className="font-display text-xl font-semibold text-ink">New campaign</h2>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted hover:text-ink">
          Cancel
        </button>
      </div>

      <label className="block">
        <span className={label}>Campaign name</span>
        <input value={name} maxLength={100} onChange={(e) => setName(e.target.value)} placeholder="e.g. Diwali offer — old customers" className={input} />
      </label>

      <div>
        <span className={label}>Contacts</span>
        <p className="mt-1 text-xs text-muted">
          A CSV with columns <code>name, phone, notes</code> (notes optional), exported from Excel or Google Sheets — or paste the list below.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <label className="cursor-pointer rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:border-accent">
            Choose CSV file
            <input type="file" accept=".csv,text/csv,text/plain" className="sr-only" onChange={(e) => readFile(e.target.files?.[0])} />
          </label>
          {fileName ? <span className="text-xs text-muted">{fileName}</span> : null}
          <button type="button" onClick={() => setCsv(SAMPLE)} className="text-xs font-semibold text-accent hover:underline">
            Use an example
          </button>
        </div>
        <textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          rows={5}
          placeholder={SAMPLE}
          className={`${input} font-mono text-xs`}
        />
        {csv.trim() ? (
          <p className="mt-2 text-sm">
            <span className="font-semibold text-accent">{checked.valid.length} to call</span>
            {checked.invalid.length ? <span className="text-warn"> · {checked.invalid.length} invalid numbers skipped</span> : null}
            {checked.duplicates ? <span className="text-muted"> · {checked.duplicates} duplicates removed</span> : null}
            {tooMany ? <span className="text-warn"> · over the {MAX_CONTACTS} limit</span> : null}
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className={label}>Calls at the same time</span>
          <input type="number" min={1} max={20} value={maxConcurrent} onChange={(e) => setMaxConcurrent(Number(e.target.value))} className={input} />
        </label>
        <div>
          <span className={label}>Calling hours (IST)</span>
          <div className="flex items-center gap-2">
            <input type="time" min="09:00" max="21:00" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} className={input} />
            <span className="mt-1.5 text-muted">–</span>
            <input type="time" min="09:00" max="21:00" value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} className={input} />
          </div>
        </div>
        <label className="block">
          <span className={label}>Tries per number</span>
          <input type="number" min={1} max={5} value={maxAttempts} onChange={(e) => setMaxAttempts(Number(e.target.value))} className={input} />
        </label>
        <label className="block">
          <span className={label}>Wait before retrying</span>
          <select value={retryAfterMinutes} onChange={(e) => setRetryAfterMinutes(Number(e.target.value))} className={input}>
            <option value={30}>30 minutes</option>
            <option value={60}>1 hour</option>
            <option value={120}>2 hours</option>
            <option value={240}>4 hours</option>
            <option value={1440}>Next day</option>
          </select>
        </label>
      </div>
      <p className="-mt-3 text-xs text-muted">
        Calls only go out between 09:00 and 21:00, as Indian telemarketing rules require. Numbers on your do-not-call list are skipped automatically.
      </p>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:opacity-50"
        >
          {saving ? "Creating…" : "Create campaign"}
        </button>
        <span className="text-xs text-muted">Nothing is called until you press Start on the next screen.</span>
        {error ? <span className="text-sm text-warn">{error}</span> : null}
      </div>
    </form>
  );
}
