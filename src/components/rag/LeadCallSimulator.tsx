"use client";

import { useState, useRef, useEffect } from "react";

interface LeadCallSimulatorProps {
  aiEmployeeId: string;
  employeeName: string;
  businessName?: string;
  hasKnowledge: boolean;
}

interface OutboundCallRecord {
  id: string;
  attemptId: string;
  targetPhone: string;
  customerName: string;
  reason: string;
  status: "dialing" | "dispatched" | "connected" | "failed";
  timestamp: string;
}

export function LeadCallSimulator({
  aiEmployeeId,
  employeeName,
  businessName = "",
  hasKnowledge,
}: LeadCallSimulatorProps) {
  // Mode selection: 'phone' for real telephony calls, 'browser' for live microphone voice call
  const [activeMode, setActiveMode] = useState<"phone" | "browser">("phone");

  // Phone Call State
  const [targetPhone, setTargetPhone] = useState("");
  const [customerName, setCustomerName] = useState("Amit Sharma");
  const [callReason, setCallReason] = useState("Store inquiry & product pricing follow-up");
  const [initialOpeningMessage, setInitialOpeningMessage] = useState(
    `Hello! I am calling from ${businessName || "our business"} regarding your recent inquiry. Am I speaking with Amit Sharma?`
  );
  const [isCallingPhone, setIsCallingPhone] = useState(false);
  const [phoneCallFeedback, setPhoneCallFeedback] = useState<{
    type: "success" | "error" | "info";
    title: string;
    message: string;
    attemptId?: string;
  } | null>(null);

  // Call history
  const [callHistory, setCallHistory] = useState<OutboundCallRecord[]>([]);

  // Stored business knowledge for this employee
  const [storedKnowledge, setStoredKnowledge] = useState<any[]>([]);
  const [loadingKnowledge, setLoadingKnowledge] = useState(false);

  // Fetch business details whenever employee changes
  useEffect(() => {
    if (!aiEmployeeId) return;
    setLoadingKnowledge(true);
    fetch(`/api/rag/documents?aiEmployeeId=${aiEmployeeId}`)
      .then((r) => r.json())
      .then((data) => {
        const docs = data.documents || [];
        setStoredKnowledge(docs);
        const bizSuffix = businessName ? ` from ${businessName}` : "";
        // Default to a natural, professional greeting
        setInitialOpeningMessage(
          `Hello! This is ${employeeName}${bizSuffix}. How can I assist you with our products, specifications, and pricing today?`
        );

      })
      .catch(() => {})
      .finally(() => setLoadingKnowledge(false));
  }, [aiEmployeeId, employeeName, businessName]);

  // Telephony Config State
  const [config, setConfig] = useState<{
    agentId: string;
    connectionId: string;
    agentPhoneNumber: string;
  }>({
    agentId: "Voice-Agent-579684fb-b052",
    connectionId: "845031b1-23-4e34a7bb-b68a",
    agentPhoneNumber: "+918064266290",
  });
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [editAgentId, setEditAgentId] = useState("");
  const [editConnectionId, setEditConnectionId] = useState("");
  const [editPhoneNumber, setEditPhoneNumber] = useState("");
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  // Browser Direct Voice Call State
  const [isBrowserCallActive, setIsBrowserCallActive] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [browserCallDuration, setBrowserCallDuration] = useState(0);
  const [lastAgentReply, setLastAgentReply] = useState<string>(
    `Hello! I'm ${employeeName}. I'm live on the line. You can speak to me naturally using your microphone.`
  );
  const [lastLeadSpoken, setLastLeadSpoken] = useState<string>("");
  const [testQuery, setTestQuery] = useState("");
  const [isQuerying, setIsQuerying] = useState(false);

  const recognitionRef = useRef<any>(null);
  const timerRef = useRef<any>(null);

  // Load Sarvam config on mount
  useEffect(() => {
    fetch("/api/voice/config")
      .then((r) => r.json())
      .then((data) => {
        if (data) {
          setConfig({
            agentId: data.agentId || "579684fb-b052",
            connectionId: data.connectionId || "845031b1-23-4e34a7bb-b68a",
            agentPhoneNumber: data.agentPhoneNumber || "+918064266290",
          });
          setEditAgentId(data.agentId || "");
          setEditConnectionId(data.connectionId || "");
          setEditPhoneNumber(data.agentPhoneNumber || "+918064266290");
        }
      })
      .catch(() => {});
  }, []);

  // Timer for browser voice call
  useEffect(() => {
    if (isBrowserCallActive) {
      setBrowserCallDuration(0);
      timerRef.current = setInterval(() => {
        setBrowserCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isBrowserCallActive]);

  // Web Speech recognition setup for browser direct voice call
  useEffect(() => {
    if (typeof window === "undefined") return;
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = "en-IN";

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = async (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setLastLeadSpoken(transcript);
          await handleBrowserLeadSpoken(transcript);
        }
        setIsListening(false);
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, [aiEmployeeId, employeeName]);

  function cleanMarkdownForSpeech(raw: string): string {
    return raw
      .replace(/#{1,6}\s+/g, "") // remove markdown headers
      .replace(/\*\*(.*?)\*\*/g, "$1") // remove bold
      .replace(/\*(.*?)\*/g, "$1") // remove italic
      .replace(/\[(.*?)\]\(.*?\)/g, "$1") // remove links
      .replace(/^\s*[-*+]\s+/gm, "") // remove bullet markers
      .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "") // remove emojis
      .replace(/\|/g, " ") // remove table pipes
      .replace(/\n{2,}/g, ". ") // replace double newlines with periods
      .replace(/\n/g, ", ") // replace single newlines with commas
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  function speakAgentVoice(text: string, onComplete?: () => void) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      if (onComplete) onComplete();
      return;
    }

    try {
      window.speechSynthesis.cancel();
      const cleanSpokenText = cleanMarkdownForSpeech(text);
      if (!cleanSpokenText) {
        if (onComplete) onComplete();
        return;
      }

      // Split into short sentences to avoid Chrome WebSpeech long utterance stall bug
      const sentences = cleanSpokenText.match(/[^.!?]+[.!?]+|\s*[^.!?]+$/g) || [cleanSpokenText];
      let currentIdx = 0;

      function speakNext() {
        if (currentIdx >= sentences.length) {
          setIsSpeaking(false);
          if (onComplete) onComplete();
          return;
        }

        const sentence = sentences[currentIdx].trim();
        currentIdx++;
        if (!sentence) {
          speakNext();
          return;
        }

        const utterance = new SpeechSynthesisUtterance(sentence);
        utterance.rate = 1.0;
        utterance.pitch = 1.05;
        utterance.lang = "en-IN";

        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => speakNext();
        utterance.onerror = () => speakNext();

        window.speechSynthesis.speak(utterance);
      }

      speakNext();
    } catch (e) {
      setIsSpeaking(false);
      if (onComplete) onComplete();
    }
  }

  async function handleBrowserLeadSpoken(spokenText: string) {
    if (!spokenText.trim() || isQuerying) return;
    setIsQuerying(true);
    setLastLeadSpoken(spokenText);
    try {
      const res = await fetch("/api/rag/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aiEmployeeId,
          query: spokenText,
          topK: 6,
        }),
      });

      const data = await res.json();
      const reply = data.answer || "I understand. Could you tell me more about what you need?";
      setLastAgentReply(reply);

      speakAgentVoice(reply, () => {
        // Automatically start listening again after agent finishes speaking if call active
        if (recognitionRef.current && isBrowserCallActive) {
          try {
            recognitionRef.current.start();
          } catch (e) {}
        }
      });
    } catch (err: any) {
      const errorReply = "Sorry, I had trouble checking our business knowledge. Please ask again.";
      setLastAgentReply(errorReply);
      speakAgentVoice(errorReply);
    } finally {
      setIsQuerying(false);
    }
  }

  function startBrowserCall() {
    setIsBrowserCallActive(true);
    speakAgentVoice(
      `Hello! I'm ${employeeName}. I'm on the call with you. What would you like to know about our products or offers?`,
      () => {
        if (recognitionRef.current) {
          try {
            recognitionRef.current.start();
          } catch (e) {}
        }
      }
    );
  }

  function endBrowserCall() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
    }
    setIsSpeaking(false);
    setIsListening(false);
    setIsBrowserCallActive(false);
  }

  // Trigger Real Phone Call via Sarvam Instant Outbound
  async function handleTriggerPhoneCall(e: React.FormEvent) {
    e.preventDefault();
    if (!targetPhone.trim() || isCallingPhone) return;

    setIsCallingPhone(true);
    setPhoneCallFeedback({
      type: "info",
      title: "Dialing Outbound Call...",
      message: `Connecting ${employeeName} via Sarvam Voice to ${targetPhone}...`,
    });

    try {
      const res = await fetch("/api/voice/lead-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aiEmployeeId,
          customerName,
          phoneNumber: targetPhone,
          reason: callReason,
          initialBotMessage: initialOpeningMessage,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        // Check if error is due to truncated ID
        const errMsg = data.error || "Failed to trigger outbound call";
        const isTruncatedError =
          errMsg.includes("not found") ||
          errMsg.includes("App '579684fb-b052'") ||
          errMsg.includes("SARVAM_AGENT_ID");

        setPhoneCallFeedback({
          type: "error",
          title: isTruncatedError ? "Agent UUID Incomplete in Sarvam" : "Call Failed",
          message: isTruncatedError
            ? `Sarvam returned: ${errMsg}. Please click "Update Sarvam IDs" to paste the full 36-character Agent UUID from your Sarvam console.`
            : errMsg,
        });

        if (isTruncatedError) {
          setIsConfigModalOpen(true);
        }
        return;
      }

      // Success
      const attemptId = data.attemptId;
      setPhoneCallFeedback({
        type: "success",
        title: "Call Dispatched Successfully! 🎉",
        message: `Sarvam Voice AI is now dialing ${targetPhone}. The call will ring on the phone shortly.`,
        attemptId,
      });

      const newRecord: OutboundCallRecord = {
        id: "call-" + Date.now(),
        attemptId: attemptId || "attempt-" + Date.now(),
        targetPhone,
        customerName,
        reason: callReason,
        status: "dispatched",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setCallHistory((prev) => [newRecord, ...prev]);
    } catch (err: any) {
      setPhoneCallFeedback({
        type: "error",
        title: "Connection Error",
        message: err.message || "Failed to contact voice server.",
      });
    } finally {
      setIsCallingPhone(false);
    }
  }

  // Save updated config
  async function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault();
    setIsSavingConfig(true);

    try {
      const res = await fetch("/api/voice/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: editAgentId,
          connectionId: editConnectionId,
          agentPhoneNumber: editPhoneNumber,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setConfig({
          agentId: editAgentId,
          connectionId: editConnectionId,
          agentPhoneNumber: editPhoneNumber,
        });
        setIsConfigModalOpen(false);
        setPhoneCallFeedback({
          type: "info",
          title: "Configuration Updated",
          message: "Sarvam Agent and Connection IDs have been updated. You can now place the call.",
        });
      } else {
        alert(data.error || "Failed to update configuration");
      }
    } catch (err: any) {
      alert("Error saving configuration: " + err.message);
    } finally {
      setIsSavingConfig(false);
    }
  }

  function formatTime(seconds: number) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  const isAgentIdTruncated = !config.agentId || config.agentId === "579684fb-b052";

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white font-display text-xl font-bold shadow-md">
            {employeeName.charAt(0)}
            <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-white">
              <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
            </span>
          </div>

          <div>
            <div className="flex items-center gap-2.5">
              <h3 className="font-display text-lg font-bold text-ink">{employeeName}</h3>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-ping" />
                Live Voice Agent
              </span>
            </div>
            <p className="text-xs text-muted mt-0.5 flex items-center gap-2">
              <span>Outbound Telephony: <strong>{config.agentPhoneNumber}</strong></span>
              <span>•</span>
              <span>Provider: <strong>Sarvam Voice AI</strong></span>
            </p>
          </div>
        </div>

        {/* Action / Mode switch */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveMode("phone")}
            className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
              activeMode === "phone"
                ? "bg-emerald-600 text-white shadow-sm"
                : "border border-border bg-background text-muted hover:text-ink"
            }`}
          >
            <span>📱 Real Phone Call</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveMode("browser")}
            className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
              activeMode === "browser"
                ? "bg-accent text-white shadow-sm"
                : "border border-border bg-background text-muted hover:text-ink"
            }`}
          >
            <span>🎙️ Live Mic Voice Call</span>
          </button>

          <button
            type="button"
            onClick={() => setIsConfigModalOpen(true)}
            title="Configure Sarvam Telephony Connection"
            className="flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-muted hover:text-ink hover:border-accent"
          >
            <span>⚙️ Sarvam Telephony</span>
            {isAgentIdTruncated && (
              <span className="h-2 w-2 rounded-full bg-amber-500" title="Full UUID needed" />
            )}
          </button>
        </div>
      </div>

      {/* Warning if UUID truncated */}
      {isAgentIdTruncated && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="text-base">⚠️</span>
            <div>
              <p className="font-semibold text-amber-900">
                Agent ID is truncated: <code className="bg-amber-100 px-1.5 py-0.5 rounded text-[11px]">{config.agentId}</code>
              </p>
              <p className="text-amber-700 mt-0.5">
                Sarvam requires the full 36-character UUID to connect telephony.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsConfigModalOpen(true)}
            className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-amber-700"
          >
            Paste Full UUID
          </button>
        </div>
      )}

      {/* Learned Business Knowledge Preview */}
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-base">🧠</span>
            <div>
              <h4 className="font-display text-sm font-bold text-ink">
                Business Details Stored in Database {businessName ? `for ${businessName}` : ""}
              </h4>
              <p className="text-[11px] text-muted">
                {employeeName} speaks during calls based on these stored business facts
              </p>
            </div>
          </div>
          <span
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
              storedKnowledge.length > 0
                ? "bg-emerald-100 text-emerald-800"
                : "bg-amber-100 text-amber-800"
            }`}
          >
            {storedKnowledge.length > 0
              ? `✅ ${storedKnowledge.length} Business Knowledge Items Stored`
              : "⚠️ No Business Details Stored Yet"}
          </span>
        </div>

        {storedKnowledge.length === 0 ? (
          <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-900">
            <p className="font-semibold">⚠️ {employeeName} does not have any business details stored in the database yet!</p>
            <p className="mt-1 text-amber-800 leading-relaxed">
              Use <strong>Tab 1: Explain by Speaking</strong> to talk into your microphone, or <strong>Tab 2: Upload Documents</strong>.
              All spoken notes and uploaded files are saved into the database, and the calling agent will speak using those exact facts!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            {storedKnowledge.map((item) => (
              <div
                key={item.id}
                className="p-3 rounded-xl border border-border/80 bg-background text-xs space-y-1"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-semibold text-ink truncate flex items-center gap-1.5">
                    <span>{item.source_type === "voice_transcript" ? "🎙️" : "📄"}</span>
                    <span className="truncate">{item.name}</span>
                  </span>
                  <span className="shrink-0 rounded-md bg-accent-soft px-1.5 py-0.2 text-[10px] font-semibold text-accent">
                    {item.source_type === "voice_transcript" ? "Spoken" : "Document"}
                  </span>
                </div>
                <div className="flex items-center gap-2 pt-0.5 text-[11px] text-muted">
                  <span className="font-semibold text-accent">
                    {item.chunk_count || 1} vector chunks
                  </span>
                  <span>•</span>
                  <span className="text-emerald-700 font-medium">✓ Indexed in pgvector</span>
                </div>
                <p className="text-[11px] text-muted line-clamp-2 leading-relaxed font-mono bg-background/50 p-1.5 rounded-lg border border-border/40">
                  {item.raw_text?.slice(0, 140) || item.name}...
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Main Mode 1: REAL PHONE OUTBOUND CALL */}
      {activeMode === "phone" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Dialer form (7 cols) */}
          <div className="lg:col-span-7 rounded-2xl border border-border bg-surface p-6 shadow-xs space-y-5">
            <div className="border-b border-border pb-4">
              <h4 className="font-display text-base font-bold text-ink flex items-center gap-2">
                <span>📞</span> Place Outbound Lead Call
              </h4>
              <p className="text-xs text-muted mt-1">
                {employeeName} will dial the lead's mobile number immediately using Sarvam Voice Agents and converse in real-time.
              </p>
            </div>

            <form onSubmit={handleTriggerPhoneCall} className="space-y-4">
              {/* Target Phone */}
              <div>
                <label className="block text-xs font-semibold text-ink mb-1.5">
                  Lead Phone Number <span className="text-red-500">*</span>
                </label>
                <div className="relative flex rounded-xl border border-border bg-background focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20">
                  <span className="flex items-center px-3.5 text-xs font-semibold text-muted border-r border-border bg-background/60">
                    🇮🇳 +91
                  </span>
                  <input
                    type="tel"
                    required
                    value={targetPhone}
                    onChange={(e) => setTargetPhone(e.target.value)}
                    placeholder="98765 43210 (or enter your test number)"
                    className="flex-1 bg-transparent px-3.5 py-2.5 text-xs text-ink outline-hidden"
                  />
                </div>
                <p className="text-[11px] text-muted mt-1">
                  Enter 10-digit mobile number or full international format (+91XXXXXXXXXX).
                </p>
              </div>

              {/* Lead Name & Purpose */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1.5">
                    Lead / Customer Name
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="e.g. Amit Sharma"
                    className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-xs text-ink outline-hidden focus:border-accent"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink mb-1.5">
                    Call Purpose / Intent
                  </label>
                  <input
                    type="text"
                    value={callReason}
                    onChange={(e) => setCallReason(e.target.value)}
                    placeholder="e.g. Price inquiry follow-up"
                    className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-xs text-ink outline-hidden focus:border-accent"
                  />
                </div>
              </div>

              {/* Initial Bot Opening Line */}
              <div>
                <label className="block text-xs font-semibold text-ink mb-1.5">
                  Opening Line When Lead Answers
                </label>
                <textarea
                  rows={2}
                  value={initialOpeningMessage}
                  onChange={(e) => setInitialOpeningMessage(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background p-3 text-xs text-ink outline-hidden focus:border-accent resize-none"
                />
              </div>

              {/* Call Feedback Banner */}
              {phoneCallFeedback && (
                <div
                  className={`rounded-xl p-4 text-xs space-y-1 ${
                    phoneCallFeedback.type === "success"
                      ? "bg-emerald-50 border border-emerald-200 text-emerald-900"
                      : phoneCallFeedback.type === "error"
                      ? "bg-red-50 border border-red-200 text-red-900"
                      : "bg-blue-50 border border-blue-200 text-blue-900"
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold">
                    <span>
                      {phoneCallFeedback.type === "success"
                        ? "✅"
                        : phoneCallFeedback.type === "error"
                        ? "❌"
                        : "ℹ️"}
                    </span>
                    <span>{phoneCallFeedback.title}</span>
                  </div>
                  <p className="leading-relaxed">{phoneCallFeedback.message}</p>
                  {phoneCallFeedback.attemptId && (
                    <p className="text-[11px] font-mono text-emerald-700 pt-1">
                      Attempt ID: {phoneCallFeedback.attemptId}
                    </p>
                  )}
                </div>
              )}

              {/* Call Action Button */}
              <button
                type="submit"
                disabled={isCallingPhone || !targetPhone.trim()}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 py-3 text-xs font-bold text-white shadow-md hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 transition-all cursor-pointer"
              >
                {isCallingPhone ? (
                  <>
                    <span className="h-3.5 w-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    <span>Dialing Lead via Sarvam Voice AI...</span>
                  </>
                ) : (
                  <>
                    <span>📞</span>
                    <span>Call Lead Now ({targetPhone.trim() || "+91 XXXXXXXXXX"})</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Right Column: Live Telephony Status & Recent Calls (5 cols) */}
          <div className="lg:col-span-5 space-y-5">
            {/* Live Telephony Route Card */}
            <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs space-y-4">
              <h4 className="font-display text-sm font-bold text-ink flex items-center justify-between">
                <span>📡 Active Telephony Route</span>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                  Ready
                </span>
              </h4>

              <div className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-background border border-border/70">
                  <span className="text-muted">Caller ID (From):</span>
                  <span className="font-mono font-bold text-ink">{config.agentPhoneNumber}</span>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-xl bg-background border border-border/70">
                  <span className="text-muted">Voice Engine:</span>
                  <span className="font-semibold text-ink">Sarvam Samvaad AI</span>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-xl bg-background border border-border/70">
                  <span className="text-muted">Agent ID:</span>
                  <span className="font-mono text-[11px] text-accent truncate max-w-[150px]">
                    {config.agentId}
                  </span>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-xl bg-background border border-border/70">
                  <span className="text-muted">Telephony Conn:</span>
                  <span className="font-mono text-[11px] text-ink truncate max-w-[150px]">
                    {config.connectionId}
                  </span>
                </div>
              </div>
            </div>

            {/* Outbound Calls History */}
            <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs space-y-3">
              <h4 className="font-display text-sm font-bold text-ink flex items-center justify-between">
                <span>📋 Recent Lead Calls</span>
                <span className="text-xs text-muted">{callHistory.length} calls</span>
              </h4>

              {callHistory.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted">
                  No outbound calls placed in this session yet. Enter a lead phone number to test your voice agent!
                </div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {callHistory.map((call) => (
                    <div
                      key={call.id}
                      className="p-3 rounded-xl border border-border bg-background text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-ink">{call.customerName}</span>
                        <span className="text-[10px] text-muted">{call.timestamp}</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-muted">
                        <span className="font-mono">{call.targetPhone}</span>
                        <span className="rounded-md bg-emerald-100 px-1.5 py-0.2 text-[10px] font-semibold text-emerald-800">
                          {call.status}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted/80 font-mono truncate">
                        ID: {call.attemptId}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Mode 2: IN-BROWSER LIVE VOICE CALL (Microphone & Speaker) */}
      {activeMode === "browser" && (
        <div className="rounded-2xl border border-border bg-surface p-8 shadow-xs text-center max-w-2xl mx-auto space-y-6">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent mb-2">
              🎙️ Direct In-Browser Voice Call
            </span>
            <h3 className="font-display text-xl font-bold text-ink">
              Speak with {employeeName} Hands-Free
            </h3>
            <p className="text-xs text-muted max-w-md mx-auto mt-1">
              Talk directly through your microphone. {employeeName} listens and answers back with speech in real-time. No typing required!
            </p>
          </div>

          {/* Call Screen Visualizer Orb */}
          <div className="py-6 flex flex-col items-center justify-center">
            <div className="relative">
              {/* Pulsing rings when call is active */}
              {isBrowserCallActive && (
                <>
                  <div
                    className={`absolute -inset-4 rounded-full transition-all duration-500 opacity-40 ${
                      isSpeaking
                        ? "bg-emerald-400 animate-ping"
                        : isListening
                        ? "bg-red-400 animate-ping"
                        : "bg-accent animate-pulse"
                    }`}
                  />
                  <div
                    className={`absolute -inset-8 rounded-full transition-all duration-700 opacity-20 ${
                      isSpeaking
                        ? "bg-emerald-500 animate-pulse"
                        : isListening
                        ? "bg-red-500 animate-pulse"
                        : "bg-accent/40"
                    }`}
                  />
                </>
              )}

              {/* Central Avatar Orb */}
              <div
                className={`relative flex h-28 w-28 items-center justify-center rounded-full text-white font-display text-3xl font-bold shadow-xl transition-all duration-300 ${
                  isBrowserCallActive
                    ? isSpeaking
                      ? "bg-gradient-to-tr from-emerald-500 to-teal-400 scale-105"
                      : isListening
                      ? "bg-gradient-to-tr from-red-500 to-amber-500 scale-105"
                      : "bg-gradient-to-tr from-accent to-blue-500"
                    : "bg-muted/40 text-muted"
                }`}
              >
                {employeeName.charAt(0)}
              </div>
            </div>

            {/* Status indicator */}
            <div className="mt-4">
              {isBrowserCallActive ? (
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-2 rounded-full bg-background border border-border px-3 py-1 text-xs font-semibold">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        isSpeaking
                          ? "bg-emerald-500 animate-pulse"
                          : isListening
                          ? "bg-red-500 animate-pulse"
                          : "bg-accent"
                      }`}
                    />
                    <span className="text-ink">
                      {isSpeaking
                        ? `${employeeName} is speaking...`
                        : isListening
                        ? "Listening to you... (speak now)"
                        : "Call Connected"}
                    </span>
                    <span className="text-muted font-mono">{formatTime(browserCallDuration)}</span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted font-medium">Call is not active. Click Start Call below.</p>
              )}
            </div>
          </div>

          {/* Spoken Turn Transcript Card */}
          {isBrowserCallActive && (
            <div className="rounded-xl border border-border bg-background p-4 text-left space-y-3">
              {lastLeadSpoken && (
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
                    You Said:
                  </span>
                  <p className="text-xs font-medium text-ink mt-0.5">"{lastLeadSpoken}"</p>
                </div>
              )}
              {lastAgentReply && (
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                    {employeeName} Answered:
                  </span>
                  <p className="text-xs text-ink/90 mt-0.5 leading-relaxed">"{lastAgentReply}"</p>
                </div>
              )}
            </div>
          )}

          {/* Test Question / Chat Query Input */}
          <div className="pt-2 border-t border-border/60">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (testQuery.trim()) {
                  handleBrowserLeadSpoken(testQuery.trim());
                  setTestQuery("");
                }
              }}
              className="flex gap-2 max-w-xl mx-auto"
            >
              <input
                type="text"
                value={testQuery}
                onChange={(e) => setTestQuery(e.target.value)}
                placeholder="Ask about products or prices (e.g., 'What is the price of iPhone 16?' or 'Tell me all prices')"
                disabled={isQuerying}
                className="flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-xs text-ink outline-hidden focus:border-accent"
              />
              <button
                type="submit"
                disabled={isQuerying || !testQuery.trim()}
                className="rounded-xl bg-accent px-4 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-accent/90 disabled:opacity-50 transition-all cursor-pointer"
              >
                {isQuerying ? "Checking..." : "Ask Agent →"}
              </button>
            </form>

            {/* Quick Sample Queries */}
            <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5 text-[11px]">
              <span className="text-muted">Quick test:</span>
              {[
                "What is the price of iPhone 16?",
                "What are your prices in detail?",
                "What is the price of refrigerator and AC?",
                "What audio products do you sell and their prices?",
              ].map((sample) => (
                <button
                  key={sample}
                  type="button"
                  onClick={() => handleBrowserLeadSpoken(sample)}
                  disabled={isQuerying}
                  className="rounded-lg border border-border bg-background/80 px-2.5 py-1 text-ink/80 hover:border-accent hover:text-accent transition-all cursor-pointer disabled:opacity-50"
                >
                  {sample}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted mt-2">
              Speak into your microphone during the live voice call or click any question above to test the agent's RAG knowledge.
            </p>
          </div>

          {/* Start / Hangup Control */}
          <div className="pt-2 flex justify-center gap-4">
            {!isBrowserCallActive ? (
              <button
                type="button"
                onClick={startBrowserCall}
                className="flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-xs font-bold text-white shadow-md hover:bg-emerald-700 transition-all cursor-pointer"
              >
                <span>📞 Start Live Voice Call</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={endBrowserCall}
                className="flex items-center gap-2 rounded-xl bg-red-600 px-6 py-3 text-xs font-bold text-white shadow-md hover:bg-red-700 transition-all cursor-pointer animate-pulse"
              >
                <span>🔴 End Voice Call</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Configuration Modal for Sarvam Telephony IDs */}
      {isConfigModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-2xl space-y-5 animate-rise">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="font-display text-base font-bold text-ink">
                  Sarvam Telephony Configuration
                </h3>
                <p className="text-xs text-muted">
                  Update your Sarvam Voice Agent UUID & Telephony IDs
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsConfigModalOpen(false)}
                className="rounded-lg p-1 text-muted hover:bg-background hover:text-ink"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveConfig} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-ink mb-1">
                  Sarvam Agent ID (`app_id`)
                </label>
                <input
                  type="text"
                  required
                  value={editAgentId}
                  onChange={(e) => setEditAgentId(e.target.value)}
                  placeholder="e.g. 579684fb-b052-XXXX-XXXX-XXXXXXXXXXXX"
                  className="w-full rounded-xl border border-border bg-background px-3.5 py-2 text-xs font-mono text-ink outline-hidden focus:border-accent"
                />
                <p className="text-[11px] text-muted mt-1">
                  Copy the full 36-character UUID from your browser address bar on{" "}
                  <a
                    href="https://indus.sarvam.ai/samvaad/build"
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent underline"
                  >
                    Build → Agents
                  </a>.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1">
                  Telephony Connection ID (`connection_id`)
                </label>
                <input
                  type="text"
                  required
                  value={editConnectionId}
                  onChange={(e) => setEditConnectionId(e.target.value)}
                  placeholder="e.g. 845031b1-23-4e34a7bb-b68a"
                  className="w-full rounded-xl border border-border bg-background px-3.5 py-2 text-xs font-mono text-ink outline-hidden focus:border-accent"
                />
                <p className="text-[11px] text-muted mt-1">
                  From{" "}
                  <a
                    href="https://indus.sarvam.ai/samvaad/deploy/telephony"
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent underline"
                  >
                    Deploy → Phone Numbers
                  </a>.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1">
                  From Phone Number (`agent_phone_number`)
                </label>
                <input
                  type="text"
                  required
                  value={editPhoneNumber}
                  onChange={(e) => setEditPhoneNumber(e.target.value)}
                  placeholder="+918064266290"
                  className="w-full rounded-xl border border-border bg-background px-3.5 py-2 text-xs font-mono text-ink outline-hidden focus:border-accent"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsConfigModalOpen(false)}
                  className="rounded-xl border border-border px-4 py-2 text-xs font-medium text-muted hover:text-ink"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingConfig}
                  className="rounded-xl bg-accent px-5 py-2 text-xs font-bold text-white hover:bg-accent/90 disabled:opacity-50"
                >
                  {isSavingConfig ? "Saving..." : "Save Configuration"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
