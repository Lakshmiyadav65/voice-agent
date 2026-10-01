"use client";

import { LIMITS, keyFromName, type AgentSettings, type AgentTool } from "@/lib/voice/agent-settings";
import { input } from "./SettingsSection";

type Props = {
  settings: AgentSettings;
  onChange: (settings: AgentSettings) => void;
};

const EMPTY_TOOL: AgentTool = { name: "", whenToUse: "", method: "POST", url: "", params: [] };

export function ToolsSection({ settings, onChange }: Props) {
  const { tools } = settings;

  function update(index: number, patch: Partial<AgentTool>) {
    onChange({ ...settings, tools: tools.map((t, i) => (i === index ? { ...t, ...patch } : t)) });
  }

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium text-ink">Built in</p>
          <p className="text-xs text-muted">Every agent has these.</p>
        </div>
        <ul className="divide-y divide-border rounded-xl border border-border">
          <li className="flex items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-ink">End call</p>
              <p className="text-xs text-muted">Hangs up politely when the conversation is over.</p>
            </div>
            <span className="text-xs font-semibold text-accent">Always on</span>
          </li>
        </ul>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-ink">API tools</p>
            <p className="text-xs text-muted">
              Let the agent look things up or send data mid-call, e.g. check a booking or create one in your
              system. Saved now; they run once a voice platform that supports tools is connected.
            </p>
          </div>
          <button
            type="button"
            disabled={tools.length >= LIMITS.tools}
            onClick={() => onChange({ ...settings, tools: [...tools, { ...EMPTY_TOOL }] })}
            className="rounded-full border border-dashed border-accent px-3 py-1.5 text-xs font-semibold text-accent disabled:opacity-40"
          >
            + Add API tool
          </button>
        </div>

        {tools.length ? (
          <ul className="space-y-3">
            {tools.map((tool, index) => {
              const badUrl = tool.url !== "" && !/^https:\/\/[^\s/]+\.[^\s]+$/i.test(tool.url);
              return (
                <li key={index} className="space-y-3 rounded-xl border border-border p-4">
                  <div className="grid gap-2 sm:grid-cols-[1fr_6rem_2fr]">
                    <input
                      value={tool.name}
                      maxLength={40}
                      placeholder="name, e.g. check_slot"
                      aria-label="Tool name"
                      onChange={(e) => update(index, { name: e.target.value })}
                      onBlur={(e) => update(index, { name: keyFromName(e.target.value) })}
                      className={`${input} font-mono text-[13px]`}
                    />
                    <select
                      value={tool.method}
                      aria-label="Method"
                      onChange={(e) => update(index, { method: e.target.value as AgentTool["method"] })}
                      className={input}
                    >
                      <option>POST</option>
                      <option>GET</option>
                    </select>
                    <div>
                      <input
                        value={tool.url}
                        maxLength={500}
                        placeholder="https://your-system.com/api/slots"
                        aria-label="URL"
                        onChange={(e) => update(index, { url: e.target.value.trim() })}
                        className={input}
                      />
                      {badUrl ? <p className="mt-1 text-[11px] text-warn">Use a public https:// address.</p> : null}
                    </div>
                  </div>
                  <textarea
                    value={tool.whenToUse}
                    maxLength={LIMITS.text}
                    rows={2}
                    placeholder="When should the agent use this? e.g. When the caller wants to book a site visit, check which slots are free."
                    aria-label="When to use"
                    onChange={(e) => update(index, { whenToUse: e.target.value })}
                    className={input}
                  />
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-ink">Information the agent collects first</p>
                    {tool.params.map((param, p) => (
                      <div key={p} className="grid gap-2 sm:grid-cols-[10rem_1fr_auto_auto] sm:items-center">
                        <input
                          value={param.name}
                          maxLength={40}
                          placeholder="name, e.g. date"
                          aria-label="Parameter name"
                          onChange={(e) =>
                            update(index, {
                              params: tool.params.map((x, i) => (i === p ? { ...x, name: e.target.value } : x)),
                            })
                          }
                          onBlur={(e) =>
                            update(index, {
                              params: tool.params.map((x, i) => (i === p ? { ...x, name: keyFromName(e.target.value) } : x)),
                            })
                          }
                          className={`${input} font-mono text-[13px]`}
                        />
                        <input
                          value={param.description}
                          maxLength={160}
                          placeholder="What it is, e.g. the day they want to visit"
                          aria-label="Parameter description"
                          onChange={(e) =>
                            update(index, {
                              params: tool.params.map((x, i) => (i === p ? { ...x, description: e.target.value } : x)),
                            })
                          }
                          className={input}
                        />
                        <label className="flex items-center gap-1.5 text-xs text-muted">
                          <input
                            type="checkbox"
                            checked={param.required}
                            onChange={(e) =>
                              update(index, {
                                params: tool.params.map((x, i) => (i === p ? { ...x, required: e.target.checked } : x)),
                              })
                            }
                          />
                          Required
                        </label>
                        <button
                          type="button"
                          onClick={() => update(index, { params: tool.params.filter((_, i) => i !== p) })}
                          className="justify-self-start text-xs font-semibold text-muted hover:text-warn"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      disabled={tool.params.length >= LIMITS.toolParams}
                      onClick={() =>
                        update(index, { params: [...tool.params, { name: "", description: "", required: true }] })
                      }
                      className="text-xs font-semibold text-accent disabled:opacity-40"
                    >
                      + Add information
                    </button>
                  </div>
                  <div className="border-t border-border pt-3">
                    <button
                      type="button"
                      onClick={() => onChange({ ...settings, tools: tools.filter((_, i) => i !== index) })}
                      className="text-xs font-semibold text-muted hover:text-warn"
                    >
                      Delete tool
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted">No API tools yet.</p>
        )}
      </div>
    </div>
  );
}
