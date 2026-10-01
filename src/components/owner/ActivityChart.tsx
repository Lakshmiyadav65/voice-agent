"use client";

import { useState } from "react";

import type { DayActivity } from "@/lib/data/leads";

// Two steps of one green, validated for colour-blind separation. The light step
// is under 3:1 against white, so the legend and table view carry identity too.
const PICKED_UP = "#008a5e";
const NOT_PICKED_UP = "#5fbf94";

const DAY_LABEL = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

function dayLabel(day: string): string {
  return DAY_LABEL.format(new Date(`${day}T00:00:00Z`));
}

/** Smallest 1-2-5 step that keeps the axis to four ticks or fewer. */
function niceScale(max: number): { top: number; ticks: number[] } {
  if (max <= 0) return { top: 4, ticks: [0, 2, 4] };
  const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
  const step = steps.find((s) => Math.ceil(max / s) <= 4) ?? Math.ceil(max / 4);
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let t = 0; t <= top; t += step) ticks.push(t);
  return { top, ticks };
}

function Swatch({ color }: { color: string }) {
  return <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />;
}

export function ActivityChart({ days }: { days: DayActivity[] }) {
  const [active, setActive] = useState<number | null>(null);
  const { top, ticks } = niceScale(Math.max(...days.map((d) => d.leads)));
  const focused = active === null ? null : days[active];
  const totals = days.reduce(
    (sum, d) => ({ leads: sum.leads + d.leads, pickedUp: sum.pickedUp + d.pickedUp }),
    { leads: 0, pickedUp: 0 }
  );

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4 text-xs text-foreground">
          <span className="flex items-center gap-1.5">
            <Swatch color={PICKED_UP} /> Picked up
          </span>
          <span className="flex items-center gap-1.5">
            <Swatch color={NOT_PICKED_UP} /> Not picked up / not called
          </span>
        </div>
        {/* Readout stays in a fixed spot so hovering never shifts the layout. */}
        <p className="min-h-5 text-xs text-muted" aria-live="polite">
          {focused ? (
            <>
              <span className="font-semibold text-ink">{dayLabel(focused.day)}</span>
              {` · ${focused.leads} leads · ${focused.pickedUp} picked up · ${focused.interested} interested`}
            </>
          ) : (
            `${totals.leads} leads · ${totals.pickedUp} picked up in ${days.length} days`
          )}
        </p>
      </div>

      <div className="mt-5 flex gap-2">
        <div className="relative w-6 shrink-0 text-right text-[11px] tabular-nums text-muted">
          {ticks.map((tick) => (
            <span
              key={tick}
              className="absolute right-0 translate-y-1/2"
              style={{ bottom: `${(tick / top) * 100}%` }}
            >
              {tick}
            </span>
          ))}
        </div>

        <div className="relative h-44 flex-1">
          {ticks.map((tick) => (
            <div
              key={tick}
              className="absolute inset-x-0 h-px bg-border/70"
              style={{ bottom: `${(tick / top) * 100}%` }}
            />
          ))}

          <div className="absolute inset-0 flex items-end">
            {days.map((d, i) => {
              const missed = d.leads - d.pickedUp;
              return (
                <button
                  key={d.day}
                  type="button"
                  aria-label={`${dayLabel(d.day)}: ${d.leads} leads, ${d.pickedUp} picked up, ${d.interested} interested`}
                  onPointerEnter={() => setActive(i)}
                  onPointerLeave={() => setActive(null)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  className="group flex h-full flex-1 cursor-default items-end justify-center outline-hidden"
                >
                  <span
                    className={`flex w-full max-w-6 flex-col justify-end gap-[2px] transition-opacity mx-[2px] ${
                      active !== null && active !== i ? "opacity-45" : ""
                    } group-focus-visible:ring-2 group-focus-visible:ring-accent`}
                    style={{ height: `${(d.leads / top) * 100}%` }}
                  >
                    {missed > 0 ? (
                      <span
                        className="block w-full rounded-t-[4px]"
                        style={{ flex: `${missed} 1 0`, background: NOT_PICKED_UP }}
                      />
                    ) : null}
                    {d.pickedUp > 0 ? (
                      <span
                        className={`block w-full ${missed > 0 ? "" : "rounded-t-[4px]"}`}
                        style={{ flex: `${d.pickedUp} 1 0`, background: PICKED_UP }}
                      />
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-2 flex gap-2 pl-8 text-[11px] text-muted">
        {days.map((d, i) => {
          // Count back from today so the latest day is always labelled; every
          // other day on desktop, every fourth on phones, so dates never collide.
          const fromEnd = days.length - 1 - i;
          const visibility =
            fromEnd % 4 === 0 ? "" : fromEnd % 2 === 0 ? "hidden sm:inline" : "hidden";
          return (
            <span
              key={d.day}
              className={`flex flex-1 whitespace-nowrap ${fromEnd === 0 ? "justify-end" : "justify-center"}`}
            >
              <span className={visibility}>{dayLabel(d.day)}</span>
            </span>
          );
        })}
      </div>

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-xs font-semibold text-accent">Show as table</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[24rem] text-xs">
            <thead className="text-left text-muted">
              <tr>
                <th className="py-1.5 font-semibold">Day</th>
                <th className="py-1.5 text-right font-semibold">Leads</th>
                <th className="py-1.5 text-right font-semibold">Picked up</th>
                <th className="py-1.5 text-right font-semibold">Interested</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[...days].reverse().map((d) => (
                <tr key={d.day}>
                  <td className="py-1.5 text-foreground">{dayLabel(d.day)}</td>
                  <td className="py-1.5 text-right tabular-nums">{d.leads}</td>
                  <td className="py-1.5 text-right tabular-nums">{d.pickedUp}</td>
                  <td className="py-1.5 text-right tabular-nums">{d.interested}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
