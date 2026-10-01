"use client";

import { useRef, useState, type ReactNode } from "react";

import { SARVAM_PER_CALL_SETTINGS } from "@/lib/sarvam/agent-settings";
import {
  AGENT_LANGUAGES,
  AGENT_VOICES,
  BACKGROUND_SOUND_LABELS,
  LIMITS,
  sanitizeAgentSettings,
  type AgentLanguage,
  type AgentSettings,
  type BackgroundSound,
  type Eagerness,
  type SoundSensitivity,
  type SwitchAfter,
} from "@/lib/voice/agent-settings";

type Props = {
  aiEmployeeId: string;
  employeeName: string;
  initialSettings: unknown;
  onSaved: (settings: AgentSettings) => void;
};

const input =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-ink outline-hidden focus:border-accent";

function voiceLabel(id: string) {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

function LiveBadge({ setting }: { setting: keyof AgentSettings }) {
  if (!SARVAM_PER_CALL_SETTINGS.includes(setting)) return null;
  return (
    <span className="ml-2 inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
      Live on calls
    </span>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1 border-t border-border pt-5 first:border-t-0 first:pt-0">
      <h4 className="font-display text-base font-semibold text-ink">{title}</h4>
      <div className="divide-y divide-border">{children}</div>
    </section>
  );
}

function Row({
  label,
  hint,
  badge,
  children,
}: {
  label: string;
  hint: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-3 py-4 sm:grid-cols-[1fr_minmax(0,18rem)] sm:items-center">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">
          {label}
          {badge}
        </p>
        <p className="text-xs text-muted">{hint}</p>
      </div>
      <div className="min-w-0 sm:justify-self-end sm:w-full">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative ml-auto block h-6 w-11 rounded-full transition ${checked ? "bg-accent" : "bg-border"}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
          checked ? "left-[22px]" : "left-0.5"
        }`}
      />
    </button>
  );
}

function Slider({
  value,
  range,
  onChange,
  display,
  label,
}: {
  value: number;
  range: { min: number; max: number; step: number };
  onChange: (v: number) => void;
  display: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={range.min}
        max={range.max}
        step={range.step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className="min-w-0 flex-1 accent-accent"
      />
      <span className="w-20 shrink-0 text-right text-sm tabular-nums text-ink">{display}</span>
    </div>
  );
}

function Choice<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-lg border border-border p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition ${
            value === option.value ? "bg-accent text-white" : "text-muted hover:text-ink"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function VoiceSelect({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className={input}>
      {AGENT_VOICES.map((voice) => (
        <option key={voice} value={voice}>
          {voiceLabel(voice)}
        </option>
      ))}
    </select>
  );
}

/** Reads the provider's dictionary format: { pronunciations: { Hindi: { word: "say as" } } }. */
function parseDictionary(json: unknown): AgentSettings["pronunciations"] {
  const root = (json as { pronunciations?: Record<string, Record<string, string>> })?.pronunciations;
  if (!root || typeof root !== "object") throw new Error("The file needs a top-level \"pronunciations\" key.");
  const rows: AgentSettings["pronunciations"] = [];
  for (const [language, words] of Object.entries(root)) {
    if (!(AGENT_LANGUAGES as readonly string[]).includes(language) || !words || typeof words !== "object") continue;
    for (const [word, sayAs] of Object.entries(words)) {
      if (typeof sayAs === "string") rows.push({ language: language as AgentLanguage, word, sayAs });
    }
  }
  return rows;
}

export function AgentSettingsEditor({ aiEmployeeId, employeeName, initialSettings, onSaved }: Props) {
  const [settings, setSettings] = useState<AgentSettings>(() => sanitizeAgentSettings(initialSettings));
  const [saved, setSaved] = useState<AgentSettings>(settings);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const dirty = JSON.stringify(settings) !== JSON.stringify(saved);

  function set<K extends keyof AgentSettings>(key: K, value: AgentSettings[K]) {
    setSettings((s) => ({ ...s, [key]: value }));
    setStatus("idle");
  }

  function toggleLanguage(language: AgentLanguage) {
    const has = settings.allowedLanguages.includes(language);
    if (has && language === settings.startingLanguage) return;
    set(
      "allowedLanguages",
      has ? settings.allowedLanguages.filter((l) => l !== language) : [...settings.allowedLanguages, language]
    );
  }

  async function importDictionary(file: File) {
    setError("");
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("The dictionary must be 5 MB or smaller.");
      const rows = parseDictionary(JSON.parse(await file.text()));
      const merged = sanitizeAgentSettings({ ...settings, pronunciations: [...settings.pronunciations, ...rows] });
      set("pronunciations", merged.pronunciations);
    } catch (err) {
      setError(err instanceof SyntaxError ? "That file is not valid JSON." : (err as Error).message);
    }
  }

  async function save() {
    if (settings.callForwarding.enabled && settings.callForwarding.number.replace(/\D/g, "").length < 10) {
      setError("Add the number to forward calls to, or turn call forwarding off.");
      return;
    }
    setStatus("saving");
    setError("");
    try {
      const res = await fetch(`/api/ai-employees/${aiEmployeeId}/agent-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not save.");
      setSettings(data.settings);
      setSaved(data.settings);
      onSaved(data.settings);
      setStatus("saved");
    } catch (err) {
      setError((err as Error).message);
      setStatus("error");
    }
  }

  const { nudges, voicemail, callForwarding, perLanguageVoices } = settings;

  return (
    <div className="space-y-5 rounded-2xl border border-border bg-surface p-4 sm:p-6">
      <div>
        <h3 className="font-display text-xl font-semibold text-ink">How {employeeName} sounds and behaves</h3>
        <p className="mt-1 text-sm text-muted">
          These settings belong to your account and stay the same if the voice platform changes. Ones marked{" "}
          <span className="font-semibold text-emerald-800">Live on calls</span> reach every call now; the rest are
          saved and applied when the voice platform is connected.
        </p>
      </div>

      <Section title="Greeting">
        <div className="space-y-2 py-4">
          <p className="text-sm font-medium text-ink">
            Opening line
            <LiveBadge setting="greeting" />
          </p>
          <textarea
            value={settings.greeting}
            maxLength={LIMITS.text}
            rows={2}
            onChange={(e) => set("greeting", e.target.value)}
            className={input}
          />
          <p className="text-xs text-muted">
            Use {"{{business_name}}"} and {"{{lead_name}}"}; they are filled in for each call.
          </p>
        </div>
      </Section>

      <Section title="Speaking">
        <Row label="Voice" hint="Who your agent sounds like">
          <VoiceSelect value={settings.voice} onChange={(v) => set("voice", v)} label="Voice" />
        </Row>
        <Row label="Per-language voices" hint="Use a different voice for each starting language">
          <Toggle
            label="Per-language voices"
            checked={perLanguageVoices.enabled}
            onChange={(enabled) => set("perLanguageVoices", { ...perLanguageVoices, enabled })}
          />
        </Row>
        {perLanguageVoices.enabled ? (
          <div className="grid gap-2 py-4 sm:grid-cols-2">
            {settings.allowedLanguages.map((language) => (
              <label key={language} className="flex items-center gap-2 text-sm text-ink">
                <span className="w-24 shrink-0">{language}</span>
                <VoiceSelect
                  label={`${language} voice`}
                  value={perLanguageVoices.voices[language] ?? settings.voice}
                  onChange={(voice) =>
                    set("perLanguageVoices", {
                      ...perLanguageVoices,
                      voices: { ...perLanguageVoices.voices, [language]: voice },
                    })
                  }
                />
              </label>
            ))}
          </div>
        ) : null}
        <Row label="Speaking speed" hint="How fast the agent talks">
          <Slider
            label="Speaking speed"
            value={settings.speakingSpeed}
            range={LIMITS.speakingSpeed}
            onChange={(v) => set("speakingSpeed", v)}
            display={`${settings.speakingSpeed.toFixed(2)}x`}
          />
        </Row>
        <Row label="Pitch" hint="Higher or lower tone of voice">
          <Slider
            label="Pitch"
            value={settings.pitch}
            range={LIMITS.pitch}
            onChange={(v) => set("pitch", v)}
            display={settings.pitch.toFixed(2)}
          />
        </Row>
        <div className="space-y-3 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-ink">Pronunciation dictionary</p>
              <p className="text-xs text-muted">
                How names, brands and short forms should be said, per language. Writing the word in the
                language&apos;s own script works best, and spell out short forms (B2B → &quot;B to B&quot;).
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:border-accent hover:text-accent"
              >
                Upload JSON
              </button>
              <button
                type="button"
                disabled={settings.pronunciations.length >= LIMITS.pronunciations}
                onClick={() =>
                  set("pronunciations", [
                    ...settings.pronunciations,
                    { language: settings.startingLanguage, word: "", sayAs: "" },
                  ])
                }
                className="rounded-full border border-dashed border-accent px-3 py-1.5 text-xs font-semibold text-accent disabled:opacity-40"
              >
                + Add word
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) importDictionary(file);
                  e.target.value = "";
                }}
              />
            </div>
          </div>
          {settings.pronunciations.length > 0 ? (
            <ul className="space-y-2">
              {settings.pronunciations.map((p, index) => (
                <li key={index} className="grid gap-2 sm:grid-cols-[8rem_1fr_1fr_auto] sm:items-center">
                  <select
                    value={p.language}
                    aria-label="Language"
                    onChange={(e) =>
                      set(
                        "pronunciations",
                        settings.pronunciations.map((row, i) =>
                          i === index ? { ...row, language: e.target.value as AgentLanguage } : row
                        )
                      )
                    }
                    className={input}
                  >
                    {AGENT_LANGUAGES.map((l) => (
                      <option key={l}>{l}</option>
                    ))}
                  </select>
                  <input
                    value={p.word}
                    maxLength={100}
                    placeholder="Word, e.g. B2B"
                    aria-label="Word"
                    onChange={(e) =>
                      set(
                        "pronunciations",
                        settings.pronunciations.map((row, i) => (i === index ? { ...row, word: e.target.value } : row))
                      )
                    }
                    className={input}
                  />
                  <input
                    value={p.sayAs}
                    maxLength={200}
                    placeholder="Say it as, e.g. B to B"
                    aria-label="Say it as"
                    onChange={(e) =>
                      set(
                        "pronunciations",
                        settings.pronunciations.map((row, i) => (i === index ? { ...row, sayAs: e.target.value } : row))
                      )
                    }
                    className={input}
                  />
                  <button
                    type="button"
                    onClick={() => set("pronunciations", settings.pronunciations.filter((_, i) => i !== index))}
                    className="justify-self-start rounded-lg px-2 py-1 text-xs font-semibold text-muted hover:text-warn"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </Section>

      <Section title="Thinking">
        <Row label="Model temperature" hint="Lower stays compliant and consistent; higher is more creative">
          <Slider
            label="Model temperature"
            value={settings.temperature}
            range={LIMITS.temperature}
            onChange={(v) => set("temperature", v)}
            display={settings.temperature <= 0.3 ? "Compliant" : settings.temperature >= 0.7 ? "Creative" : "Balanced"}
          />
        </Row>
      </Section>

      <Section title="Listening">
        <Row label="Let callers interrupt" hint="The caller can talk over the agent while it's speaking">
          <Toggle
            label="Let callers interrupt"
            checked={settings.allowInterruptions}
            onChange={(v) => set("allowInterruptions", v)}
          />
        </Row>
        <Row label="Eagerness to respond" hint="How quickly the agent replies after a pause">
          <Choice<Eagerness>
            label="Eagerness to respond"
            value={settings.eagerness}
            onChange={(v) => set("eagerness", v)}
            options={[
              { value: "patient", label: "Patient" },
              { value: "balanced", label: "Balanced" },
              { value: "eager", label: "Eager" },
            ]}
          />
        </Row>
        <Row label="Sound sensitivity" hint="How loud a sound must be to count as speech. Lower it on noisy lines.">
          <Choice<SoundSensitivity>
            label="Sound sensitivity"
            value={settings.soundSensitivity}
            onChange={(v) => set("soundSensitivity", v)}
            options={[
              { value: "low", label: "Low" },
              { value: "medium", label: "Medium" },
              { value: "high", label: "High" },
            ]}
          />
        </Row>
      </Section>

      <Section title="Environment">
        <Row label="Background sound" hint="Ambient noise behind the agent">
          <select
            value={settings.backgroundSound}
            aria-label="Background sound"
            onChange={(e) => set("backgroundSound", e.target.value as BackgroundSound)}
            className={input}
          >
            {(Object.keys(BACKGROUND_SOUND_LABELS) as BackgroundSound[]).map((sound) => (
              <option key={sound} value={sound}>
                {BACKGROUND_SOUND_LABELS[sound]}
              </option>
            ))}
          </select>
        </Row>
        {settings.backgroundSound !== "none" ? (
          <Row label="Background volume" hint="How loud the ambient noise plays">
            <Slider
              label="Background volume"
              value={settings.backgroundVolume}
              range={LIMITS.backgroundVolume}
              onChange={(v) => set("backgroundVolume", v)}
              display={`${Math.round(settings.backgroundVolume * 100)}%`}
            />
          </Row>
        ) : null}
      </Section>

      <Section title="Language">
        <Row
          label="Starting language"
          hint="The language the agent opens the call in"
          badge={<LiveBadge setting="startingLanguage" />}
        >
          <select
            value={settings.startingLanguage}
            aria-label="Starting language"
            onChange={(e) => {
              const language = e.target.value as AgentLanguage;
              setSettings((s) => ({
                ...s,
                startingLanguage: language,
                allowedLanguages: s.allowedLanguages.includes(language)
                  ? s.allowedLanguages
                  : [language, ...s.allowedLanguages],
              }));
              setStatus("idle");
            }}
            className={input}
          >
            {AGENT_LANGUAGES.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </Row>
        <div className="space-y-2 py-4">
          <p className="text-sm font-medium text-ink">Languages allowed</p>
          <p className="text-xs text-muted">Languages the agent can understand and reply in.</p>
          <div className="flex flex-wrap gap-2 pt-1">
            {AGENT_LANGUAGES.map((language) => {
              const on = settings.allowedLanguages.includes(language);
              const locked = language === settings.startingLanguage;
              return (
                <button
                  key={language}
                  type="button"
                  aria-pressed={on}
                  disabled={locked}
                  title={locked ? "The starting language is always allowed" : undefined}
                  onClick={() => toggleLanguage(language)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    on ? "border-accent bg-accent text-white" : "border-border text-muted hover:text-ink"
                  } ${locked ? "cursor-default" : ""}`}
                >
                  {language}
                </button>
              );
            })}
          </div>
        </div>
        <Row label="Switch language during call" hint="Follow along when the caller switches languages">
          <Toggle
            label="Switch language during call"
            checked={settings.switchLanguageDuringCall}
            onChange={(v) => set("switchLanguageDuringCall", v)}
          />
        </Row>
        <Row label="Auto-detected language switch" hint="Match the caller's language from the allowed set">
          <Toggle
            label="Auto-detected language switch"
            checked={settings.autoDetectLanguage}
            onChange={(v) => set("autoDetectLanguage", v)}
          />
        </Row>
        {settings.autoDetectLanguage ? (
          <Row label="Switch after" hint="How long to listen before switching language">
            <Choice<SwitchAfter>
              label="Switch after"
              value={settings.switchAfter}
              onChange={(v) => set("switchAfter", v)}
              options={[
                { value: "quick", label: "Quick" },
                { value: "balanced", label: "Balanced" },
                { value: "patient", label: "Patient" },
              ]}
            />
          </Row>
        ) : null}
        <Row label="Say numbers in the local language" hint={`For example, "500" is read as "paanch sau"`}>
          <Toggle label="Say numbers in the local language" checked={settings.indicNumbers} onChange={(v) => set("indicNumbers", v)} />
        </Row>
      </Section>

      <Section title="During the call">
        <Row label="Nudge quiet callers" hint="Speak up if the caller goes silent for a while">
          <Toggle
            label="Nudge quiet callers"
            checked={nudges.enabled}
            onChange={(enabled) => set("nudges", { ...nudges, enabled })}
          />
        </Row>
        {nudges.enabled ? (
          <div className="space-y-2 py-4">
            {nudges.messages.map((nudge, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                <input
                  value={nudge.text}
                  maxLength={LIMITS.text}
                  aria-label={`Nudge ${index + 1}`}
                  placeholder="e.g. Hey, are you still on the call?"
                  onChange={(e) =>
                    set("nudges", {
                      ...nudges,
                      messages: nudges.messages.map((m, i) => (i === index ? { ...m, text: e.target.value } : m)),
                    })
                  }
                  className={input}
                />
                <label className="flex items-center gap-2 text-xs text-muted">
                  after
                  <input
                    type="number"
                    min={LIMITS.nudgeSeconds.min}
                    max={LIMITS.nudgeSeconds.max}
                    value={nudge.afterSeconds}
                    aria-label={`Nudge ${index + 1} delay in seconds`}
                    onChange={(e) =>
                      set("nudges", {
                        ...nudges,
                        messages: nudges.messages.map((m, i) =>
                          i === index ? { ...m, afterSeconds: Number(e.target.value) } : m
                        ),
                      })
                    }
                    className={`${input} w-20`}
                  />
                  seconds
                </label>
                <button
                  type="button"
                  onClick={() => set("nudges", { ...nudges, messages: nudges.messages.filter((_, i) => i !== index) })}
                  className="justify-self-start rounded-lg px-2 py-1 text-xs font-semibold text-muted hover:text-warn"
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              disabled={nudges.messages.length >= LIMITS.nudges}
              onClick={() =>
                set("nudges", { ...nudges, messages: [...nudges.messages, { text: "", afterSeconds: 5 }] })
              }
              className="rounded-full border border-dashed border-accent px-3 py-1.5 text-xs font-semibold text-accent disabled:opacity-40"
            >
              + Add nudge
            </button>
          </div>
        ) : null}
        <Row label="Hang up after unanswered nudges" hint="End the call if the caller still doesn't respond">
          <Toggle
            label="Hang up after unanswered nudges"
            checked={nudges.hangUpAfter}
            onChange={(hangUpAfter) => set("nudges", { ...nudges, hangUpAfter })}
          />
        </Row>
        <Row label="Voicemail" hint="Leave a message when voicemail is detected">
          <Toggle
            label="Voicemail"
            checked={voicemail.enabled}
            onChange={(enabled) => set("voicemail", { ...voicemail, enabled })}
          />
        </Row>
        {voicemail.enabled ? (
          <div className="py-4">
            <textarea
              value={voicemail.message}
              maxLength={LIMITS.text}
              rows={2}
              aria-label="Voicemail message"
              onChange={(e) => set("voicemail", { ...voicemail, message: e.target.value })}
              className={input}
            />
          </div>
        ) : null}
        <Row label="Call forwarding" hint="Transfer the caller to a person when they ask for one">
          <Toggle
            label="Call forwarding"
            checked={callForwarding.enabled}
            onChange={(enabled) => set("callForwarding", { ...callForwarding, enabled })}
          />
        </Row>
        {callForwarding.enabled ? (
          <Row label="Forward to" hint="Phone number with country code, e.g. +919876543210">
            <input
              type="tel"
              value={callForwarding.number}
              aria-label="Forward to"
              placeholder="+91…"
              onChange={(e) => set("callForwarding", { ...callForwarding, number: e.target.value })}
              className={input}
            />
          </Row>
        ) : null}
        <Row label="Max call length" hint="Ends the call after this many minutes (up to 60)">
          <input
            type="number"
            min={LIMITS.maxCallMinutes.min}
            max={LIMITS.maxCallMinutes.max}
            value={settings.maxCallMinutes}
            aria-label="Max call length in minutes"
            onChange={(e) => set("maxCallMinutes", Number(e.target.value))}
            className={input}
          />
        </Row>
      </Section>

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-border bg-surface px-4 py-4 sm:-mx-6 sm:px-6">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || status === "saving"}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:opacity-50"
        >
          {status === "saving" ? "Saving…" : "Save"}
        </button>
        {dirty && status !== "saving" ? <span className="text-sm text-muted">Unsaved changes</span> : null}
        {status === "saved" && !dirty ? (
          <span className="text-sm text-accent">Saved. Applies from the next call.</span>
        ) : null}
        {error ? <span className="text-sm text-warn">{error}</span> : null}
      </div>
    </div>
  );
}
