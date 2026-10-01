"use client";

import { useState, useEffect } from "react";
import type { AiEmployee, Business, KnowledgeDocument } from "@/lib/database.types";
import { AgentSettingsEditor } from "./AgentSettingsEditor";
import { CaptureFieldsEditor } from "./CaptureFieldsEditor";
import { CreateEmployeeModal } from "./CreateEmployeeModal";
import { VoiceRecorder } from "../rag/VoiceRecorder";
import { DocumentUploader } from "../rag/DocumentUploader";
import { LeadCallSimulator } from "../rag/LeadCallSimulator";

interface AiEmployeeManagerProps {
  initialEmployees: AiEmployee[];
  business: Business | null;
}

export function AiEmployeeManager({
  initialEmployees,
  business,
}: AiEmployeeManagerProps) {
  const [employees, setEmployees] = useState<AiEmployee[]>(initialEmployees);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(
    initialEmployees[0]?.id || ""
  );
  const [activeTab, setActiveTab] = useState<"speak" | "upload" | "capture" | "voice" | "simulate">("speak");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Business Name state synced with VoiceRecorder and database
  const [businessName, setBusinessName] = useState<string>(business?.name || "");

  // Quick inline creation state for empty view
  const [newEmployeeName, setNewEmployeeName] = useState("");
  const [newBusinessName, setNewBusinessName] = useState(business?.name || "");
  const [newEmployeeRole, setNewEmployeeRole] = useState("Sales & Lead Calling Voice Agent");
  const [newEmployeeLanguage, setNewEmployeeLanguage] = useState("English + Hindi");
  const [isSubmittingNew, setIsSubmittingNew] = useState(false);

  // Knowledge documents for the selected employee
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [totalChunks, setTotalChunks] = useState(0);
  const [loadingKnowledge, setLoadingKnowledge] = useState(false);

  const selectedEmployee = employees.find((e) => e.id === selectedEmployeeId) || employees[0];

  // Fetch documents whenever selected employee changes
  useEffect(() => {
    if (!selectedEmployee?.id) return;
    loadKnowledge(selectedEmployee.id);
  }, [selectedEmployee?.id]);

  async function loadKnowledge(empId: string) {
    setLoadingKnowledge(true);
    try {
      const res = await fetch(`/api/rag/documents?aiEmployeeId=${empId}`);
      if (res.ok) {
        const data = await res.json();
        const docs = data.documents || [];
        setDocuments(docs);
        setTotalChunks(data.totalChunks || 0);

        // If documents exist and we just ingested, suggest moving to calling
        if (docs.length > 0 && activeTab === "speak") {
          // Keep on tab, user can navigate
        }
      }
    } catch (err) {
      console.error("Failed to load knowledge:", err);
    } finally {
      setLoadingKnowledge(false);
    }
  }

  async function handleDeleteDocument(docId: string) {
    if (!confirm("Are you sure you want to delete this document and its database chunks?")) return;
    try {
      const res = await fetch(`/api/rag/documents?id=${docId}`, { method: "DELETE" });
      if (res.ok && selectedEmployee) {
        await loadKnowledge(selectedEmployee.id);
      }
    } catch (err) {
      console.error("Failed to delete document:", err);
    }
  }

  function handleEmployeeCreated(newEmp: AiEmployee) {
    setEmployees((prev) => [newEmp, ...prev]);
    setSelectedEmployeeId(newEmp.id);
    setActiveTab("speak");
  }

  async function handleInlineCreateEmployee(e: React.FormEvent) {
    e.preventDefault();
    if (!newEmployeeName.trim() || isSubmittingNew) return;

    setIsSubmittingNew(true);
    try {
      const res = await fetch("/api/ai-employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newEmployeeName.trim(),
          role: newEmployeeRole,
          language: newEmployeeLanguage,
          businessId: business?.id,
          businessName: newBusinessName.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create employee");
      }

      if (newBusinessName.trim()) {
        setBusinessName(newBusinessName.trim());
      }

      handleEmployeeCreated(data.employee);
      setNewEmployeeName("");
    } catch (err: any) {
      alert("Error creating employee: " + err.message);
    } finally {
      setIsSubmittingNew(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Header & Selector */}
      {selectedEmployee ? (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-6 shadow-xs">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white font-display text-2xl font-bold shadow-md">
              {selectedEmployee.name.charAt(0)}
            </div>

            <div>
              <div className="flex items-center gap-3">
                <h2 className="font-display text-xl font-bold text-ink">
                  {selectedEmployee.name}
                </h2>
                <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                  ● Active Employee
                </span>
                {businessName ? (
                  <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold text-emerald-900">
                    🏢 {businessName}
                  </span>
                ) : null}
                {documents.length > 0 ? (
                  <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800">
                    📚 {documents.length} Business Facts Stored
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                    ⚠️ Needs Spoken Business Details
                  </span>
                )}
              </div>
              <p className="text-xs text-muted mt-1">
                {selectedEmployee.description || "Voice Calling AI Employee"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {employees.length > 1 && (
              <select
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                className="rounded-xl border border-border bg-background px-3.5 py-2 text-xs font-semibold text-ink shadow-xs outline-hidden focus:border-accent"
              >
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} ({emp.status})
                  </option>
                ))}
              </select>
            )}

            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-accent/90 transition-colors cursor-pointer"
            >
              <span>+</span>
              <span>New Employee</span>
            </button>
          </div>
        </div>
      ) : null}

      {/* Main Flow */}
      {selectedEmployee ? (
        <div className="space-y-6">
          {/* Workflow Tabs: Speak, Documents, What to Find Out, Voice & Behaviour, Call */}
          <div className="flex flex-wrap items-center gap-2 border-b border-border pb-1">
            <button
              type="button"
              onClick={() => setActiveTab("speak")}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-all cursor-pointer ${
                activeTab === "speak"
                  ? "bg-accent text-white shadow-xs"
                  : "bg-surface text-muted hover:bg-background hover:text-ink border border-border"
              }`}
            >
              <span>🎙️</span>
              <span>1. Explain by Speaking</span>
              {documents.some((d) => d.source_type === "voice_transcript") && (
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("upload")}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-all cursor-pointer ${
                activeTab === "upload"
                  ? "bg-accent text-white shadow-xs"
                  : "bg-surface text-muted hover:bg-background hover:text-ink border border-border"
              }`}
            >
              <span>📄</span>
              <span>2. Upload Documents</span>
              {documents.some((d) => d.source_type === "document_upload") && (
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("capture")}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-all cursor-pointer ${
                activeTab === "capture"
                  ? "bg-accent text-white shadow-xs"
                  : "bg-surface text-muted hover:bg-background hover:text-ink border border-border"
              }`}
            >
              <span>📝</span>
              <span>3. What to Find Out</span>
              {selectedEmployee.capture_fields?.length ? (
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              ) : null}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("voice")}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-all cursor-pointer ${
                activeTab === "voice"
                  ? "bg-accent text-white shadow-xs"
                  : "bg-surface text-muted hover:bg-background hover:text-ink border border-border"
              }`}
            >
              <span>🔊</span>
              <span>4. Voice & Behaviour</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("simulate")}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-all cursor-pointer ${
                activeTab === "simulate"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "bg-surface text-muted hover:bg-background hover:text-ink border border-border"
              }`}
            >
              <span>📞</span>
              <span>5. Outbound Voice Calling</span>
            </button>
          </div>

          {/* Tab 1: Explain by Speaking */}
          {activeTab === "speak" && (
            <VoiceRecorder
              aiEmployeeId={selectedEmployee.id}
              employeeName={selectedEmployee.name}
              initialBusinessName={businessName}
              onIngestSuccess={() => loadKnowledge(selectedEmployee.id)}
              onBusinessUpdated={(updatedName) => setBusinessName(updatedName)}
            />
          )}

          {/* Tab 2: Upload Documents */}
          {activeTab === "upload" && (
            <DocumentUploader
              aiEmployeeId={selectedEmployee.id}
              employeeName={selectedEmployee.name}
              onUploadSuccess={() => loadKnowledge(selectedEmployee.id)}
              onProceedToCall={() => setActiveTab("simulate")}
              documents={documents}
              totalChunks={totalChunks}
              onDeleteDocument={handleDeleteDocument}
            />
          )}

          {/* Tab 3: What to Find Out */}
          {activeTab === "capture" && (
            <CaptureFieldsEditor
              key={selectedEmployee.id}
              aiEmployeeId={selectedEmployee.id}
              employeeName={selectedEmployee.name}
              initialFields={selectedEmployee.capture_fields ?? []}
              onSaved={(fields) =>
                setEmployees((list) =>
                  list.map((e) => (e.id === selectedEmployee.id ? { ...e, capture_fields: fields } : e))
                )
              }
            />
          )}

          {/* Tab 4: Voice & Behaviour */}
          {activeTab === "voice" && (
            <AgentSettingsEditor
              key={selectedEmployee.id}
              aiEmployeeId={selectedEmployee.id}
              employeeName={selectedEmployee.name}
              initialSettings={selectedEmployee.agent_settings}
              onSaved={(settings) =>
                setEmployees((list) =>
                  list.map((e) => (e.id === selectedEmployee.id ? { ...e, agent_settings: settings } : e))
                )
              }
            />
          )}

          {/* Tab 5: Outbound Voice Calling */}
          {activeTab === "simulate" && (
            <LeadCallSimulator
              aiEmployeeId={selectedEmployee.id}
              employeeName={selectedEmployee.name}
              businessName={businessName}
              hasKnowledge={documents.length > 0}
            />
          )}
        </div>
      ) : (
        /* STEP 1: CREATE YOUR FIRST AI EMPLOYEE */
        <div className="max-w-xl mx-auto rounded-3xl border border-border bg-surface p-8 shadow-sm space-y-6">
          <div className="text-center space-y-2">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-blue-600 text-white text-3xl font-bold shadow-lg">
              ✨
            </div>
            <h3 className="font-display text-2xl font-bold text-ink">
              Step 1: Create Your AI Employee
            </h3>
            <p className="text-xs text-muted max-w-sm mx-auto leading-relaxed">
              Create your voice agent first. Next, you will speak or upload your business details so the agent can learn and make calls!
            </p>
          </div>

          <form onSubmit={handleInlineCreateEmployee} className="space-y-4 pt-2">
            <div>
              <label className="block text-xs font-semibold text-ink mb-1.5">
                AI Employee Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Priya, Rahul, Ananya, Kabir"
                value={newEmployeeName}
                onChange={(e) => setNewEmployeeName(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-xs text-ink outline-hidden focus:border-accent shadow-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink mb-1.5">
                🏢 Business / Company Name
              </label>
              <input
                type="text"
                placeholder="e.g. Apex Electronics, Horizon Dental, Sharma Sweets"
                value={newBusinessName}
                onChange={(e) => setNewBusinessName(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-xs text-ink outline-hidden focus:border-accent shadow-xs"
              />
              <p className="mt-1 text-[11px] text-muted">
                You can also enter or update this at the top of the speaking tab.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink mb-1.5">
                Role & Objective
              </label>
              <input
                type="text"
                value={newEmployeeRole}
                onChange={(e) => setNewEmployeeRole(e.target.value)}
                placeholder="e.g. Inbound Sales & Lead Calling Agent"
                className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-xs text-ink outline-hidden focus:border-accent"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink mb-1.5">
                Primary Language
              </label>
              <select
                value={newEmployeeLanguage}
                onChange={(e) => setNewEmployeeLanguage(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-xs text-ink outline-hidden focus:border-accent"
              >
                <option value="English">English</option>
                <option value="Hindi">Hindi</option>
                <option value="English + Hindi (Hinglish)">English + Hindi (Hinglish)</option>
                <option value="Kannada">Kannada</option>
                <option value="Tamil">Tamil</option>
                <option value="Telugu">Telugu</option>
                <option value="Marathi">Marathi</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={isSubmittingNew || !newEmployeeName.trim()}
              className="w-full mt-2 rounded-xl bg-gradient-to-r from-accent to-blue-600 py-3.5 text-xs font-bold text-white shadow-md hover:from-accent/90 hover:to-blue-700 disabled:opacity-50 transition-all cursor-pointer"
            >
              {isSubmittingNew ? "Creating AI Employee..." : "Create Employee & Continue to Business Details →"}
            </button>
          </form>
        </div>
      )}

      {/* Modal for additional employees */}
      <CreateEmployeeModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={handleEmployeeCreated}
        businessId={business?.id}
      />
    </div>
  );
}
