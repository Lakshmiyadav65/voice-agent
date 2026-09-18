"use client";

import { useState } from "react";

interface CreateEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newEmployee: any) => void;
  businessId?: string;
}

export function CreateEmployeeModal({
  isOpen,
  onClose,
  onSuccess,
  businessId,
}: CreateEmployeeModalProps) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("Inbound Sales & Lead Qualification");
  const [language, setLanguage] = useState("English + Hindi (Hinglish)");
  const [tone, setTone] = useState("Warm & Consultative");
  const [greeting, setGreeting] = useState("Namaste! Thanks for reaching out. How can I help you today?");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please provide an employee name");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/ai-employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          role,
          language,
          tone,
          greeting,
          businessId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create employee");
      }

      onSuccess(data.employee);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to create AI employee");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-2xl animate-rise">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div>
            <h3 className="font-display text-xl font-bold text-ink">Create AI Employee</h3>
            <p className="text-xs text-muted">Configure a dedicated voice agent to speak with leads</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-muted hover:bg-background hover:text-ink"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 p-3 text-xs text-red-700 border border-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted">
              Employee Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Priya, Rajesh, Aryan"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-ink outline-hidden focus:border-accent"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted">
                Role / Goal
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-ink outline-hidden focus:border-accent"
              >
                <option>Inbound Sales & Lead Qualification</option>
                <option>Customer Support & Inquiries</option>
                <option>Appointment Booking & Follow-up</option>
                <option>Product & Price Consultant</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted">
                Primary Language
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-ink outline-hidden focus:border-accent"
              >
                <option>English + Hindi (Hinglish)</option>
                <option>English</option>
                <option>Hindi</option>
                <option>Telugu</option>
                <option>Tamil</option>
                <option>Kannada</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted">
                Personality Tone
              </label>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-ink outline-hidden focus:border-accent"
              >
                <option>Warm & Consultative</option>
                <option>Professional & Crisp</option>
                <option>Energetic & Persuasive</option>
                <option>Patient & Reassuring</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted">
                Initial Status
              </label>
              <div className="mt-2 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-1.5 rounded border border-amber-200">
                Draft (Needs business facts)
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted">
              Call Greeting Script
            </label>
            <input
              type="text"
              value={greeting}
              onChange={(e) => setGreeting(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-ink outline-hidden focus:border-accent"
            />
          </div>

          <div className="mt-6 flex justify-end gap-3 border-t border-border pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-xs font-semibold text-muted hover:bg-background"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-accent px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-accent/90 disabled:opacity-50"
            >
              {loading ? "Creating..." : "Create Employee"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
