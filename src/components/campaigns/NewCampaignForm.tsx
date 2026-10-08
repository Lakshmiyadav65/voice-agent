"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { contactsFromCsv, MAX_CONTACTS, reviewContacts, type ContactRow } from "@/lib/campaigns/contacts";

const SAMPLE = "name,phone,notes\nRavi Kumar,9876543210,Asked about iPhone 16\nAnjali,+91 98123 45678,";
const SAMPLE_HREF = `data:text/csv;charset=utf-8,${encodeURIComponent(SAMPLE)}`;
const ACCEPT = ".csv,text/csv,text/plain";
// Enough to check a list by eye; the counts above the table cover every row.
const PREVIEW_ROWS = 300;

const ROW_STATUS: Record<ContactRow["status"], { label: string; className: string }> = {
  ready: { label: "Ready", className: "bg-accent-soft text-accent" },
  invalid: { label: "Invalid number", className: "bg-warn/10 text-warn" },
  duplicate: { label: "Duplicate", className: "border border-border bg-background text-muted" },
};

type Counts = Record<ContactRow["status"], number>;

/** +91 86394 26564 for Indian mobiles, otherwise as stored. */
function displayPhone(phone: string): string {
  const match = /^\+91(\d{5})(\d{5})$/.exec(phone);
  return match ? `+91 ${match[1]} ${match[2]}` : phone;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export function NewCampaignForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [pasting, setPasting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState("");
  const [maxConcurrent, setMaxConcurrent] = useState(3);
  const [windowStart, setWindowStart] = useState("10:00");
  const [windowEnd, setWindowEnd] = useState("19:00");
  const [maxAttempts, setMaxAttempts] = useState(2);
  const [retryAfterMinutes, setRetryAfterMinutes] = useState(120);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const rows = useMemo(() => reviewContacts(contactsFromCsv(csv)), [csv]);
  const ready = useMemo(() => rows.filter((row) => row.status === "ready").map((row) => row.contact), [rows]);
  const counts: Counts = {
    ready: ready.length,
    invalid: rows.filter((row) => row.status === "invalid").length,
    duplicate: rows.filter((row) => row.status === "duplicate").length,
  };
  const tooMany = ready.length > MAX_CONTACTS;

  async function readFile(file: File | undefined) {
    if (!file) return;
    // Excel workbooks are the usual mistake; Windows reports a .csv as an Excel type, so go by extension too.
    if (!/\.(csv|txt)$/i.test(file.name) && !file.type.startsWith("text/")) {
      setFileError("That isn't a CSV file. Save the sheet as CSV first: File → Download → CSV in Google Sheets, or Save As → CSV in Excel.");
      return;
    }
    setFileError("");
    setFileName(file.name);
    setPasting(false);
    setCsv(await file.text());
  }

  function onFileInput(event: React.ChangeEvent<HTMLInputElement>) {
    readFile(event.target.files?.[0]);
    // Lets the same file be chosen again after it is removed.
    event.target.value = "";
  }

  function clearContacts() {
    setCsv("");
    setFileName("");
    setPasting(false);
    setFileError("");
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return setError("Give the campaign a name.");
    if (!ready.length) return setError("Add at least one valid phone number.");
    if (tooMany) return setError(`Upload up to ${MAX_CONTACTS} contacts per campaign.`);

    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          contacts: ready,
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
  const hint = "mt-1 block text-[11px] text-muted";

  return (
    <form onSubmit={create} className="space-y-8 rounded-xl border border-border bg-surface p-6">
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

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div>
            <span className={label}>Contacts</span>
            <p className="mt-1 max-w-2xl text-xs text-muted">
              A CSV from Excel or Google Sheets with <code>name</code>, <code>phone</code> and <code>notes</code> columns. Notes are
              optional and tell your AI employee what the person is interested in.
            </p>
          </div>
          <a href={SAMPLE_HREF} download="campaign-contacts-sample.csv" className="text-xs font-semibold text-accent hover:underline">
            Download sample CSV
          </a>
        </div>

        {fileName ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-background px-4 py-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <FileIcon />
            </span>
            <div className="min-w-0 flex-1 basis-40">
              <p className="truncate text-sm font-semibold text-ink">{fileName}</p>
              <p className="text-xs text-muted">{plural(rows.length, "row")} read</p>
            </div>
            <div className="flex items-center gap-3">
              <label className="cursor-pointer rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-accent focus-within:border-accent">
                Replace file
                <input type="file" accept={ACCEPT} className="sr-only" onChange={onFileInput} />
              </label>
              <button type="button" onClick={clearContacts} className="px-1 py-1.5 text-xs font-semibold text-muted transition hover:text-warn">
                Remove
              </button>
            </div>
          </div>
        ) : pasting ? (
          <div>
            <textarea
              autoFocus
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              rows={6}
              placeholder={SAMPLE}
              className={`${input} mt-0 font-mono text-xs`}
            />
            <button type="button" onClick={clearContacts} className="mt-1.5 text-xs font-semibold text-muted hover:text-ink">
              Upload a file instead
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                readFile(e.dataTransfer.files[0]);
              }}
              className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition focus-within:border-accent ${
                dragging ? "border-accent bg-accent-soft/60" : "border-border bg-background hover:border-accent/60"
              }`}
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
                <UploadIcon />
              </span>
              <span className="text-sm text-ink">
                <span className="font-semibold text-accent">Choose a CSV file</span> or drag it here
              </span>
              <span className="text-xs text-muted">
                Up to {MAX_CONTACTS.toLocaleString("en-IN")} contacts · numbers without a country code are treated as Indian
              </span>
              <input type="file" accept={ACCEPT} className="sr-only" onChange={onFileInput} />
            </label>
            <button type="button" onClick={() => setPasting(true)} className="text-xs font-semibold text-muted hover:text-ink">
              Or paste a list instead
            </button>
          </div>
        )}

        {fileError ? <p className="text-sm text-warn">{fileError}</p> : null}
        {rows.length ? <ContactPreview rows={rows} counts={counts} tooMany={tooMany} /> : null}
      </section>

      <section className="space-y-4 border-t border-border pt-6">
        <div>
          <h3 className="text-sm font-semibold text-ink">Calling settings</h3>
          <p className="mt-1 text-xs text-muted">
            Calls only go out between 09:00 and 21:00, as Indian telemarketing rules require. Numbers on your do-not-call list are skipped automatically.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className={label}>Calls at the same time</span>
            <input type="number" min={1} max={20} value={maxConcurrent} onChange={(e) => setMaxConcurrent(Number(e.target.value))} className={input} />
            <span className={hint}>1 to 20 lines</span>
          </label>
          <div>
            <span className={label}>Calling hours (IST)</span>
            <div className="flex items-center gap-2">
              <input type="time" min="09:00" max="21:00" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} className={input} />
              <span className="mt-1.5 text-muted">–</span>
              <input type="time" min="09:00" max="21:00" value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} className={input} />
            </div>
            <span className={hint}>Between 09:00 and 21:00</span>
          </div>
          <label className="block">
            <span className={label}>Tries per number</span>
            <input type="number" min={1} max={5} value={maxAttempts} onChange={(e) => setMaxAttempts(Number(e.target.value))} className={input} />
            <span className={hint}>1 to 5 · unanswered numbers are retried</span>
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
            <span className={hint}>Time between tries</span>
          </label>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:opacity-50"
        >
          {saving ? "Creating…" : ready.length ? `Create campaign · ${plural(ready.length, "contact")}` : "Create campaign"}
        </button>
        <span className="text-xs text-muted">Nothing is called until you press Start calling on the next screen.</span>
        {error ? <span className="text-sm text-warn">{error}</span> : null}
      </div>
    </form>
  );
}

function ContactPreview({ rows, counts, tooMany }: { rows: ContactRow[]; counts: Counts; tooMany: boolean }) {
  const chip = "rounded-full px-3 py-1 text-xs font-semibold";
  const th = "sticky top-0 bg-background px-4 py-2.5 font-semibold shadow-[inset_0_-1px_0_var(--border)]";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <span className={`${chip} bg-accent-soft text-accent`}>{counts.ready} ready to call</span>
        {counts.invalid ? <span className={`${chip} bg-warn/10 text-warn`}>{plural(counts.invalid, "invalid number")} · skipped</span> : null}
        {counts.duplicate ? (
          <span className={`${chip} border border-border bg-background text-muted`}>{plural(counts.duplicate, "duplicate")} · removed</span>
        ) : null}
        {tooMany ? <span className={`${chip} bg-warn/10 text-warn`}>Over the {MAX_CONTACTS.toLocaleString("en-IN")} limit</span> : null}
      </div>

      <div className="max-h-80 overflow-auto rounded-xl border border-border">
        <table className="w-full min-w-[36rem] text-sm">
          <thead className="text-left text-xs uppercase tracking-[0.1em] text-muted">
            <tr>
              <th className={`${th} hidden w-12 sm:table-cell`}>#</th>
              <th className={th}>Name</th>
              <th className={th}>Phone</th>
              <th className={th}>Notes</th>
              <th className={th}>Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-surface">
            {rows.slice(0, PREVIEW_ROWS).map((row, i) => {
              const status = ROW_STATUS[row.status];
              const dropped = row.status !== "ready";
              return (
                <tr key={i} className={dropped ? "bg-background/50" : undefined}>
                  <td className="hidden px-4 py-2.5 tabular-nums text-muted sm:table-cell">{i + 1}</td>
                  <td className={`px-4 py-2.5 ${dropped ? "text-muted" : "font-medium text-ink"}`}>{row.contact.name || "—"}</td>
                  <td
                    className={`whitespace-nowrap px-4 py-2.5 tabular-nums ${
                      row.status === "invalid" ? "text-warn" : dropped ? "text-muted" : "text-foreground"
                    }`}
                  >
                    {row.status === "invalid" ? row.contact.phone || "(empty)" : displayPhone(row.contact.phone)}
                  </td>
                  <td className="px-4 py-2.5 text-muted">{row.contact.notes || "—"}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${status.className}`}>
                      {status.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {rows.length > PREVIEW_ROWS ? (
        <p className="text-xs text-muted">
          Showing the first {PREVIEW_ROWS} of {rows.length.toLocaleString("en-IN")} rows. The counts above include every row.
        </p>
      ) : null}
      {counts.invalid || counts.duplicate ? (
        <p className="text-xs text-muted">
          Rows marked Invalid number or Duplicate won&apos;t be called. To include them, fix them in your sheet and upload it again.
        </p>
      ) : null}
    </div>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 15V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h6" />
    </svg>
  );
}
