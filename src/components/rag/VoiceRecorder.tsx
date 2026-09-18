"use client";

import { useState, useEffect, useRef } from "react";

interface VoiceRecorderProps {
  aiEmployeeId: string;
  employeeName: string;
  initialBusinessName?: string;
  onIngestSuccess: () => void;
  onBusinessUpdated?: (name: string) => void;
}

export function VoiceRecorder({
  aiEmployeeId,
  employeeName,
  initialBusinessName = "",
  onIngestSuccess,
  onBusinessUpdated,
}: VoiceRecorderProps) {
  const [businessName, setBusinessName] = useState(initialBusinessName);
  const [isSavingBizName, setIsSavingBizName] = useState(false);
  const [bizNameSaved, setBizNameSaved] = useState(false);
  const [bizNameError, setBizNameError] = useState(false);

  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimText, setInterimText] = useState("");
  const [title, setTitle] = useState("Spoken Business Overview & Product Details");
  const [speaker, setSpeaker] = useState("Business Owner");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [browserSupported, setBrowserSupported] = useState(true);

  const businessInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  // Sync if initialBusinessName changes
  useEffect(() => {
    if (initialBusinessName && !businessName) {
      setBusinessName(initialBusinessName);
    }
  }, [initialBusinessName]);

  useEffect(() => {
    // Check Web Speech API support
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setBrowserSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-IN"; // Configured for Indian English / Hinglish / Regional accents

    recognition.onresult = (event: any) => {
      let currentInterim = "";
      let finalSpeech = "";

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalSpeech += event.results[i][0].transcript + " ";
        } else {
          currentInterim += event.results[i][0].transcript;
        }
      }

      if (finalSpeech) {
        setTranscript((prev) => (prev ? prev.trim() + " " + finalSpeech.trim() : finalSpeech.trim()));
      }
      setInterimText(currentInterim);
    };

    recognition.onerror = (event: any) => {
      console.warn("Speech recognition error:", event.error);
      if (event.error === "not-allowed") {
        setStatusMessage({ text: "Microphone permission denied. Please allow microphone access in your browser.", isError: true });
        setIsRecording(false);
      }
    };

    recognition.onend = () => {
      if (isRecording) {
        // Auto-restart if still flagged as recording
        try {
          recognition.start();
        } catch {
          setIsRecording(false);
        }
      }
    };

    recognitionRef.current = recognition;

    return () => {
      try {
        recognition.stop();
      } catch {}
    };
  }, [isRecording]);

  async function handleSaveBusinessName() {
    if (!businessName.trim()) {
      setBizNameError(true);
      businessInputRef.current?.focus();
      return;
    }

    setBizNameError(false);
    setIsSavingBizName(true);
    try {
      const res = await fetch("/api/business", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: businessName.trim() }),
      });

      if (res.ok) {
        setBizNameSaved(true);
        onBusinessUpdated?.(businessName.trim());
        setTimeout(() => setBizNameSaved(false), 3000);
      }
    } catch (err) {
      console.warn("Failed to persist business name immediately:", err);
    } finally {
      setIsSavingBizName(false);
    }
  }

  function toggleRecording() {
    // Validate business name BEFORE speaking
    if (!businessName.trim()) {
      setBizNameError(true);
      businessInputRef.current?.focus();
      setStatusMessage({
        text: `Please enter your Business / Company Name at the top first so ${employeeName} knows which business to introduce!`,
        isError: true,
      });
      return;
    }

    setBizNameError(false);

    if (!recognitionRef.current) {
      setStatusMessage({
        text: "Speech recognition is not supported in this browser. You can type or paste your business explanation directly below.",
        isError: true,
      });
      return;
    }

    if (isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
      setInterimText("");
    } else {
      setStatusMessage(null);
      try {
        recognitionRef.current.start();
        setIsRecording(true);
      } catch (err) {
        console.error("Failed to start speech recognition:", err);
      }
    }
  }

  async function handleSaveTranscript() {
    if (!businessName.trim()) {
      setBizNameError(true);
      businessInputRef.current?.focus();
      setStatusMessage({ text: "Please enter your Business / Company Name at the top before saving.", isError: true });
      return;
    }

    if (!transcript.trim()) {
      setStatusMessage({ text: "Please speak into the microphone or type some business details first.", isError: true });
      return;
    }

    setIsSubmitting(true);
    setStatusMessage(null);

    try {
      const res = await fetch("/api/rag/ingest-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aiEmployeeId,
          businessName: businessName.trim(),
          transcriptText: transcript,
          title,
          speaker,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save voice transcript");
      }

      setStatusMessage({
        text: `Success! Business details stored into database for "${businessName.trim()}". ${employeeName} will now speak based on these facts on outbound calls!`,
        isError: false,
      });

      onBusinessUpdated?.(businessName.trim());
      setTranscript("");
      setInterimText("");
      onIngestSuccess();
    } catch (err: any) {
      setStatusMessage({ text: err.message || "Failed to save transcript", isError: true });
    } finally {
      setIsSubmitting(false);
    }
  }

  const activeBizDisplay = businessName.trim() || "Your Business";

  const samplePrompts = [
    `We are ${activeBizDisplay}. We specialize in high quality services and products tailored for our customers with competitive pricing.`,
    `Our business hours at ${activeBizDisplay} are Monday to Saturday from 9:00 AM to 8:00 PM. We offer fast delivery and dedicated support.`,
    `When ${employeeName} speaks to customer leads, introduce ${activeBizDisplay}, answer pricing questions, and offer to schedule an appointment or demo.`,
  ];

  return (
    <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs space-y-6">
      {/* 🏢 1. PROMINENT QUESTION AT THE TOP OF SPEAKING: BUSINESS NAME */}
      <div
        className={`rounded-2xl border p-5 transition-all shadow-xs ${
          bizNameError
            ? "border-red-400 bg-red-50/70 ring-4 ring-red-100"
            : "border-emerald-200 bg-gradient-to-r from-emerald-50/80 to-teal-50/60"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white text-xs font-bold">
              1
            </span>
            <label className="block text-sm font-bold text-emerald-950">
              What is your Business / Company Name? <span className="text-red-500">*</span>
            </label>
          </div>
          <span className="text-[11px] font-medium text-emerald-800">
            {employeeName} will say this name when introducing itself to customers on phone calls
          </span>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-2 mt-2">
          <div className="relative w-full">
            <input
              ref={businessInputRef}
              type="text"
              required
              value={businessName}
              onChange={(e) => {
                setBusinessName(e.target.value);
                if (bizNameError && e.target.value.trim()) {
                  setBizNameError(false);
                }
              }}
              onBlur={() => {
                if (businessName.trim()) {
                  handleSaveBusinessName();
                }
              }}
              placeholder="e.g. Apex Electronics, Horizon Dental Care, Sharma Sweets"
              className={`w-full rounded-xl border bg-white px-4 py-3 text-sm font-bold text-ink outline-hidden shadow-xs transition-colors ${
                bizNameError
                  ? "border-red-500 focus:border-red-600 focus:ring-2 focus:ring-red-200"
                  : "border-emerald-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-200"
              }`}
            />
          </div>

          <button
            type="button"
            onClick={handleSaveBusinessName}
            disabled={isSavingBizName || !businessName.trim()}
            className="w-full sm:w-auto shrink-0 rounded-xl bg-emerald-700 px-5 py-3 text-xs font-bold text-white shadow-xs hover:bg-emerald-800 disabled:opacity-50 transition-all cursor-pointer"
          >
            {isSavingBizName ? "Saving..." : bizNameSaved ? "✓ Saved" : "Set Business Name"}
          </button>
        </div>

        {bizNameError && (
          <p className="mt-2 text-xs font-semibold text-red-600 animate-shake">
            ⚠️ Please enter your Business or Company Name before speaking.
          </p>
        )}
      </div>

      {/* 🎙️ 2. SPEAKING SECTION */}
      <div className="border border-border rounded-2xl p-5 bg-background/50 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-white text-xs font-bold">
                2
              </span>
              <h3 className="font-display text-lg font-bold text-ink">
                Explain Details for {activeBizDisplay} by Speaking
              </h3>
            </div>
            <p className="mt-1 text-xs text-muted max-w-2xl leading-relaxed">
              Speak naturally about your products, pricing, discounts, and customer questions. Your speech is transcribed and stored into the database so <strong className="text-ink">{employeeName}</strong> speaks accurately based on these exact facts.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleRecording}
              className={`flex items-center gap-2 rounded-full px-6 py-3 text-xs font-bold transition-all shadow-md cursor-pointer ${
                isRecording
                  ? "bg-red-600 text-white hover:bg-red-700 ring-4 ring-red-100 animate-pulse"
                  : "bg-accent text-white hover:bg-accent/90 ring-2 ring-accent/20"
              }`}
            >
              {isRecording ? (
                <>
                  <span className="h-2.5 w-2.5 rounded-full bg-white animate-ping" />
                  Stop Recording
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 003-3V5a3 3 0 00-6 0v6a3 3 0 003 3z"
                    />
                  </svg>
                  Start Speaking
                </>
              )}
            </button>
          </div>
        </div>

        {/* Recording active state */}
        {isRecording && (
          <div className="flex items-center justify-between rounded-xl bg-accent-soft/40 px-4 py-3 border border-accent/20">
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
              </span>
              <span className="text-xs font-semibold text-accent">
                Listening to your microphone... Explain products, prices, timings for {activeBizDisplay}
              </span>
            </div>

            {/* Audio wave bars */}
            <div className="flex h-5 items-end gap-1">
              {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                <span
                  key={i}
                  className="w-1 rounded-full bg-accent animate-pulse"
                  style={{ height: `${25 + (i % 4) * 20}%` }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Live Spoken Transcript Box */}
        <div>
          <div className="flex items-center justify-between text-xs text-muted mb-1.5">
            <span className="font-semibold uppercase tracking-wider text-[10px]">
              Spoken Transcript (Live Speech to Text — Editable)
            </span>
            <span className="text-[11px]">{transcript.length} characters</span>
          </div>
          <textarea
            rows={5}
            value={transcript + (interimText ? ` [Listening: ${interimText}...]` : "")}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder={
              browserSupported
                ? `Click 'Start Speaking' and describe what ${activeBizDisplay} offers, pricing, and how ${employeeName} should answer calls...`
                : "Speech recognition is not supported in this browser. You can type or paste your business information directly here."
            }
            className="w-full rounded-xl border border-border bg-background p-4 text-sm text-ink outline-hidden focus:border-accent font-sans leading-relaxed shadow-xs"
          />
        </div>

        {/* Spoken Guide & Suggested Prompts */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5">
            Suggested Talking Points for {activeBizDisplay} (Click to insert):
          </p>
          <div className="flex flex-wrap gap-2">
            {samplePrompts.map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setTranscript((prev) => (prev ? prev.trim() + "\n\n" + p : p))}
                className="text-left text-xs bg-surface hover:bg-accent-soft text-ink px-3 py-1.5 rounded-lg border border-border transition-colors truncate max-w-md shadow-2xs cursor-pointer"
              >
                + {p.slice(0, 60)}...
              </button>
            ))}
          </div>
        </div>

        {/* Details & Speaker info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted">
              Topic / Note Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3.5 py-2 text-xs text-ink outline-hidden focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted">
              Speaker Name / Role
            </label>
            <input
              type="text"
              value={speaker}
              onChange={(e) => setSpeaker(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3.5 py-2 text-xs text-ink outline-hidden focus:border-accent"
            />
          </div>
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

      {/* Save Button */}
      <div className="flex items-center justify-between border-t border-border pt-4">
        <button
          type="button"
          onClick={() => {
            setTranscript("");
            setInterimText("");
            setStatusMessage(null);
          }}
          disabled={!transcript && !interimText}
          className="text-xs text-muted hover:text-ink disabled:opacity-40 cursor-pointer"
        >
          Clear transcript
        </button>

        <button
          type="button"
          onClick={handleSaveTranscript}
          disabled={isSubmitting || !transcript.trim()}
          className="flex items-center gap-2 rounded-xl bg-accent px-6 py-2.5 text-xs font-bold text-white shadow-md hover:bg-accent/90 disabled:opacity-50 transition-all cursor-pointer"
        >
          {isSubmitting ? (
            <>
              <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Storing in Database...
            </>
          ) : (
            <>Save Business Details to Database →</>
          )}
        </button>
      </div>
    </div>
  );
}
