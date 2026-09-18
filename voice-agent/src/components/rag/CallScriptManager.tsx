"use client";

import { useState, useEffect } from "react";
import type { BusinessCallScript } from "@/lib/rag/qa-engine";

interface CallScriptManagerProps {
  aiEmployeeId: string;
  employeeName: string;
  businessName: string;
  hasDocuments: boolean;
  onProceedToCall: (openingMessage: string) => void;
}

export function CallScriptManager({
  aiEmployeeId,
  employeeName,
  businessName,
  hasDocuments,
  onProceedToCall,
}: CallScriptManagerProps) {
  const [script, setScript] = useState<BusinessCallScript | null>(null);
  const [loading, setLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError: boolean } | null>(null);

  // Editable fields
  const [openingMessage, setOpeningMessage] = useState("");
  const [closingCta, setClosingCta] = useState("");
  const [fullScript, setFullScript] = useState("");
  const [customInstructions, setCustomInstructions] = useState("");

  useEffect(() => {
    if (!aiEmployeeId) return;
    loadScript();
  }, [aiEmployeeId]);

  async function loadScript() {
    setLoading(true);
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/rag/call-script?aiEmployeeId=${aiEmployeeId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.script) {
          applyScriptData(data.script);
        }
      }
    } catch (err: any) {
      console.error("Failed to load call script:", err);
    } finally {
      setLoading(false);
    }
  }

  function applyScriptData(s: BusinessCallScript) {
    setScript(s);
    setOpeningMessage(s.openingMessage || "");
    setClosingCta(s.closingCta || "");
    setFullScript(s.fullScript || "");
  }

  async function handleGenerateScript() {
    setIsGenerating(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/rag/call-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aiEmployeeId,
          customInstructions: customInstructions.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to generate script");
      }

      applyScriptData(data.script);
      setStatusMessage({
        text: `Success! Tailored calling script prepared and stored in database for "${businessName || "your business"}".`,
        isError: false,
      });
    } catch (err: any) {
      setStatusMessage({ text: err.message || "Failed to generate script", isError: true });
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleSaveScript() {
    if (!script) return;
    setIsSaving(true);
    setStatusMessage(null);

    const updatedScript: BusinessCallScript = {
      ...script,
      businessName: businessName || script.businessName,
      employeeName,
      openingMessage,
      closingCta,
      fullScript,
      generatedAt: new Date().toISOString(),
    };

    try {
      const res = await fetch("/api/rag/call-script", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aiEmployeeId,
          scriptData: updatedScript,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save script");
      }

      setScript(updatedScript);
      setStatusMessage({
        text: "✓ Script updates successfully saved to database!",
        isError: false,
      });
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err: any) {
      setStatusMessage({ text: err.message || "Failed to save script", isError: true });
    } finally {
      setIsSaving(false);
    }
  }

  const activeBiz = businessName || "Your Business";

  return (
    <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs space-y-6">
      {/* Top Header Card */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-white text-xs font-bold">
              3
            </span>
            <h3 className="font-display text-xl font-bold text-ink">
              Tailored Outbound Call Script for {activeBiz}
            </h3>
          </div>
          <p className="mt-1 text-xs text-muted max-w-2xl leading-relaxed">
            Prepared automatically from your uploaded documents and spoken onboarding facts. <strong className="text-ink">{employeeName}</strong> uses this personalized script during live outbound phone calls.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleGenerateScript}
            disabled={isGenerating}
            className="flex items-center gap-2 rounded-xl bg-accent-soft px-4 py-2.5 text-xs font-bold text-accent hover:bg-accent hover:text-white transition-all disabled:opacity-50 cursor-pointer shadow-2xs"
          >
            {isGenerating ? (
              <>
                <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Synthesizing Script...
              </>
            ) : (
              <>
                <span>⚡</span>
                <span>Regenerate from Documents</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleSaveScript}
            disabled={isSaving || !script}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-800 transition-all disabled:opacity-50 cursor-pointer shadow-xs"
          >
            {isSaving ? "Saving..." : "💾 Save Changes"}
          </button>

          <button
            type="button"
            onClick={() => onProceedToCall(openingMessage)}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-accent to-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-md hover:from-accent/90 hover:to-blue-700 transition-all cursor-pointer"
          >
            <span>📞 Use in Outbound Calling →</span>
          </button>
        </div>
      </div>

      {/* Status banner */}
      {statusMessage && (
        <div
          className={`rounded-xl p-3.5 text-xs font-medium border ${
            statusMessage.isError
              ? "bg-red-50 text-red-700 border-red-200"
              : "bg-emerald-50 text-emerald-800 border-emerald-200"
          }`}
        >
          {statusMessage.text}
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-xs text-muted">
          <svg className="mx-auto h-6 w-6 animate-spin text-accent mb-2" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Loading tailored call script for {activeBiz}...
        </div>
      ) : script ? (
        <div className="space-y-6">
          {/* Section 1: Opening Pitch / Hook */}
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="block text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                <span>🎙️</span>
                <span>Opening Hook & Initial Greeting (Spoken when customer answers)</span>
              </label>
              <span className="text-[11px] font-semibold text-emerald-800">
                Applied automatically to Sarvam Voice Agents
              </span>
            </div>
            <textarea
              rows={3}
              value={openingMessage}
              onChange={(e) => setOpeningMessage(e.target.value)}
              placeholder="e.g. Hello! This is Priya from Apex Electronics..."
              className="w-full rounded-xl border border-emerald-300 bg-white p-3.5 text-xs font-semibold text-ink outline-hidden focus:border-emerald-600 focus:ring-2 focus:ring-emerald-200 shadow-xs leading-relaxed"
            />
            <p className="text-[11px] text-emerald-900">
              💡 <em>Keep this to 1-2 friendly sentences. Introduce {employeeName}, mention {activeBiz}, and state the inquiry purpose.</em>
            </p>
          </div>

          {/* Section 2: Value Propositions & Key Offerings Matrix */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Value Propositions */}
            <div className="rounded-2xl border border-border bg-background p-4 space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="text-sm">💎</span>
                <h4 className="font-display text-xs font-bold text-ink">
                  Key Value Propositions (From Documents)
                </h4>
              </div>
              <ul className="space-y-2">
                {script.valueProposition.map((point, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-ink/90 leading-relaxed bg-surface p-2.5 rounded-xl border border-border/70">
                    <span className="text-accent font-bold mt-0.5">✓</span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Key Offerings & Pricing */}
            <div className="rounded-2xl border border-border bg-background p-4 space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="text-sm">🏷️</span>
                <h4 className="font-display text-xs font-bold text-ink">
                  Products, Packages & Pricing
                </h4>
              </div>
              <ul className="space-y-2">
                {script.keyOfferings.map((offering, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-ink/90 leading-relaxed bg-surface p-2.5 rounded-xl border border-border/70">
                    <span className="text-emerald-600 font-bold mt-0.5">★</span>
                    <span>{offering}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Section 3: Discovery Questions & Objection Handling */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Discovery Questions */}
            <div className="rounded-2xl border border-border bg-background p-4 space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="text-sm">❓</span>
                <h4 className="font-display text-xs font-bold text-ink">
                  Customer Discovery & Qualification Questions
                </h4>
              </div>
              <ul className="space-y-2">
                {script.qualificationQuestions.map((q, i) => (
                  <li key={i} className="text-xs text-ink/90 leading-relaxed bg-surface p-2.5 rounded-xl border border-border/70">
                    <span className="font-bold text-muted block mb-0.5">Q{i + 1}:</span>
                    {q}
                  </li>
                ))}
              </ul>
            </div>

            {/* Objection Handling */}
            <div className="rounded-2xl border border-border bg-background p-4 space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="text-sm">🛡️</span>
                <h4 className="font-display text-xs font-bold text-ink">
                  Objection Handling Matrix
                </h4>
              </div>
              <div className="space-y-2">
                {script.objectionHandling.map((item, i) => (
                  <div key={i} className="text-xs bg-surface p-2.5 rounded-xl border border-border/70 space-y-1">
                    <p className="font-bold text-red-600 flex items-center gap-1">
                      <span>• If lead says:</span> "{item.objection}"
                    </p>
                    <p className="text-ink/90 pl-3 border-l-2 border-accent text-[11px] leading-relaxed">
                      <strong>Agent replies:</strong> {item.response || (item as any).answer}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Section 4: Closing CTA */}
          <div className="rounded-2xl border border-border bg-background p-4 space-y-2">
            <label className="block text-xs font-bold text-ink flex items-center gap-1.5">
              <span>🎯</span>
              <span>Closing Call-To-Action (CTA) & Next Steps</span>
            </label>
            <input
              type="text"
              value={closingCta}
              onChange={(e) => setClosingCta(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-xs text-ink outline-hidden focus:border-accent"
              placeholder="e.g. Can I send the catalogue and booking confirmation to your WhatsApp?"
            />
          </div>

          {/* Section 5: Full Conversational Dialogue */}
          <div className="rounded-2xl border border-border bg-background p-5 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-ink flex items-center gap-1.5">
                <span>📖</span>
                <span>Complete 2-Way Conversational Dialogue Flow</span>
              </label>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(fullScript);
                  alert("Full call script copied to clipboard!");
                }}
                className="text-[11px] font-semibold text-accent hover:underline cursor-pointer"
              >
                Copy Full Script
              </button>
            </div>
            <textarea
              rows={8}
              value={fullScript}
              onChange={(e) => setFullScript(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface p-4 text-xs font-mono text-ink leading-relaxed outline-hidden focus:border-accent"
            />
          </div>

          {/* Custom Instruction Prompt (for refining) */}
          <div className="rounded-2xl border border-dashed border-border bg-surface p-4 space-y-2">
            <label className="block text-xs font-semibold text-ink">
              Want to refine this script? Add custom instructions and click regenerate:
            </label>
            <div className="flex flex-col sm:flex-row items-center gap-2">
              <input
                type="text"
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                placeholder="e.g. Emphasize our 20% festive discount, keep tone very energetic and friendly..."
                className="w-full rounded-xl border border-border bg-background px-3.5 py-2 text-xs text-ink outline-hidden focus:border-accent"
              />
              <button
                type="button"
                onClick={handleGenerateScript}
                disabled={isGenerating}
                className="w-full sm:w-auto shrink-0 rounded-xl bg-accent px-4 py-2 text-xs font-bold text-white hover:bg-accent/90 disabled:opacity-50 cursor-pointer shadow-xs"
              >
                {isGenerating ? "Regenerating..." : "Apply & Regenerate"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center space-y-3">
          <span className="text-3xl">📜</span>
          <h4 className="font-display text-base font-bold text-ink">
            No Call Script Prepared Yet for {activeBiz}
          </h4>
          <p className="text-xs text-muted max-w-md mx-auto leading-relaxed">
            Click below to automatically synthesize a high-converting call script based on your uploaded documents and spoken facts stored in the database.
          </p>
          <button
            type="button"
            onClick={handleGenerateScript}
            disabled={isGenerating}
            className="rounded-xl bg-accent px-6 py-3 text-xs font-bold text-white shadow-md hover:bg-accent/90 disabled:opacity-50 cursor-pointer"
          >
            {isGenerating ? "Synthesizing Script..." : "⚡ Prepare Call Script Now"}
          </button>
        </div>
      )}
    </div>
  );
}
