"use client";

import { useState } from "react";

type Result = { ok: boolean; status: number; body: string } | null;

export function LeadTestForm({ businessId }: { businessId: string }) {
  const [form, setForm] = useState({
    businessId,
    name: "",
    phone: "",
    email: "",
    enquiry: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result>(null);

  function update(field: keyof typeof form) {
    return (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [field]: event.target.value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setResult(null);

    try {
      const res = await fetch("/api/leads/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, source: "dev_test_page" }),
      });
      const body = await res.text();
      setResult({ ok: res.ok, status: res.status, body });
    } catch (err: any) {
      setResult({ ok: false, status: 0, body: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  const fields = [
    { key: "businessId" as const, label: "Business ID", placeholder: "uuid" },
    { key: "name" as const, label: "Name", placeholder: "Ravi Kumar" },
    { key: "phone" as const, label: "Phone", placeholder: "+919000000000" },
    { key: "email" as const, label: "Email (optional)", placeholder: "ravi@example.com" },
  ];

  return (
    <form onSubmit={handleSubmit} className="mt-6 max-w-lg space-y-4">
      {fields.map((field) => (
        <label key={field.key} className="block space-y-2">
          <span className="text-sm font-medium text-foreground">{field.label}</span>
          <input
            value={form[field.key]}
            onChange={update(field.key)}
            placeholder={field.placeholder}
            className="w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm outline-none transition focus:border-accent"
          />
        </label>
      ))}

      <label className="block space-y-2">
        <span className="text-sm font-medium text-foreground">Enquiry</span>
        <textarea
          value={form.enquiry}
          onChange={update("enquiry")}
          rows={3}
          placeholder="Looking for a 2BHK near Kondapur"
          className="w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm outline-none transition focus:border-accent"
        />
      </label>

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-ink px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent disabled:opacity-60"
      >
        {submitting ? "Submitting…" : "Submit — this places a real call"}
      </button>

      {result ? (
        <div
          className={`rounded-md border p-3 text-sm ${
            result.ok ? "border-accent bg-accent-soft text-accent" : "border-red-300 bg-red-50 text-red-700"
          }`}
        >
          <p className="font-semibold">HTTP {result.status}</p>
          <pre className="mt-1 whitespace-pre-wrap break-all text-xs">{result.body}</pre>
        </div>
      ) : null}
    </form>
  );
}
