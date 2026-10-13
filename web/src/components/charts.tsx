"use client";

import { useState } from "react";
import { BAR_COLOR } from "@/lib/chart-palette";

type Series = { key: string; label: string; color: string };
type Column = { label: string; values: Record<string, number> };

function niceMax(value: number): number {
  if (value <= 4) return 4;
  const step = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / step) * step;
}

/** Stacked columns over time with a legend, hover tooltip and a table view. */
export function StackedColumns({ data, series, caption }: { data: Column[]; series: Series[]; caption: string }) {
  const [active, setActive] = useState<number | null>(null);
  const totals = data.map((d) => series.reduce((sum, s) => sum + (d.values[s.key] ?? 0), 0));
  const max = niceMax(Math.max(1, ...totals));
  const HEIGHT = 160;

  return (
    <figure>
      <figcaption className="sr-only">{caption}</figcaption>
      <ul className="mb-3 flex flex-wrap gap-4 text-xs text-slate-600" aria-label="Legend">
        {series.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
            {s.label}
          </li>
        ))}
      </ul>
      <div className="relative mt-4" style={{ height: HEIGHT + 24 }} onMouseLeave={() => setActive(null)}>
        {/* recessive grid: baseline, middle, top */}
        {[0, 0.5, 1].map((f) => (
          <div key={f} className="absolute inset-x-0 flex items-center gap-2" style={{ bottom: 24 + f * HEIGHT }}>
            <span className="w-6 text-right text-[10px] tabular-nums text-slate-400">{Math.round(max * f)}</span>
            <span className={f === 0 ? "h-px flex-1 bg-slate-300" : "h-px flex-1 bg-slate-100"} />
          </div>
        ))}
        <div className="absolute bottom-6 left-8 right-0 flex items-end justify-between" style={{ height: HEIGHT }}>
          {data.map((d, i) => (
            <button
              key={d.label}
              type="button"
              aria-label={`${d.label}: ${series.map((s) => `${s.label} ${d.values[s.key] ?? 0}`).join(", ")}`}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              className="group relative flex h-full flex-1 cursor-default flex-col items-center justify-end focus:outline-none"
            >
              <span className="flex w-full max-w-6 flex-col-reverse gap-[2px]" style={{ height: `${(totals[i] / max) * 100}%` }}>
                {series.map((s) => {
                  const value = d.values[s.key] ?? 0;
                  if (value === 0) return null;
                  return <span key={s.key} className="w-full first:rounded-b-none last:rounded-t-[4px]" style={{ flexGrow: value, background: s.color, opacity: active === null || active === i ? 1 : 0.45 }} />;
                })}
              </span>
              {active === i && (
                <span role="tooltip" className="pointer-events-none absolute bottom-full z-10 mb-2 whitespace-nowrap rounded-lg border border-line bg-white px-3 py-2 text-left text-xs shadow-lg">
                  <span className="block font-medium text-ink">{d.label}</span>
                  {series.map((s) => (
                    <span key={s.key} className="flex items-center gap-1.5 text-slate-600">
                      <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} aria-hidden />
                      {s.label}: <span className="tabular-nums text-ink">{d.values[s.key] ?? 0}</span>
                    </span>
                  ))}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="absolute bottom-0 left-8 right-0 flex justify-between text-[10px] text-slate-400">
          <span>{data[0]?.label}</span>
          <span>{data[data.length - 1]?.label}</span>
        </div>
      </div>
      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-slate-500 hover:text-ink">View as table</summary>
        <table className="mt-2 w-full text-left">
          <thead className="text-slate-500">
            <tr>
              <th className="py-1 font-medium">Day</th>
              {series.map((s) => (
                <th key={s.key} className="py-1 text-right font-medium">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="tabular-nums text-ink">
            {data.map((d) => (
              <tr key={d.label} className="border-t border-slate-100">
                <td className="py-1">{d.label}</td>
                {series.map((s) => (
                  <td key={s.key} className="py-1 text-right">
                    {d.values[s.key] ?? 0}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** Single-series horizontal bars with the value at each tip. */
export function HorizontalBars({ data, unit, caption }: { data: { label: string; value: number; hint?: string }[]; unit: string; caption: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <figure>
      <figcaption className="sr-only">{caption}</figcaption>
      <ul className="space-y-2.5">
        {data.map((d) => (
          <li key={d.label} className="grid grid-cols-[7.5rem_1fr] items-center gap-3 text-sm" title={`${d.label}: ${d.value} ${unit}${d.hint ? ` · ${d.hint}` : ""}`}>
            <span className="truncate font-mono text-xs text-slate-600">{d.label}</span>
            <span className="flex items-center gap-2">
              <span className="h-3.5 rounded-r-[4px]" style={{ width: `${(d.value / max) * 85}%`, minWidth: d.value > 0 ? 3 : 0, background: BAR_COLOR }} />
              <span className="text-xs tabular-nums text-ink">{d.value}</span>
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
