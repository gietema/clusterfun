"use client";
import type { ColumnStats } from "@/app/types";

export interface Highlight {
  id: string;
  kind: "imbalance" | "long-tail" | "high-cardinality" | "uniform";
  title: string;
  detail: string;
  cta?: string;
  onAction?: () => void;
  tone?: "neutral" | "warning";
}

interface HighlightsProps {
  stats: Record<string, ColumnStats>;
  totalItems: number;
  viewByColumnValue: (column: string, value: string) => void;
  viewByNumericRange: (column: string, low: number, high: number) => void;
}

/**
 * Auto-detects up to 3 "things worth looking at" in the dataset:
 *  - Class imbalance (categorical column with max/min >= 10×)
 *  - Long tail in a numeric column (99% of items in < 50% of the range)
 *  - High-cardinality categorical (n_unique > 100)
 *
 * Apple-style: short, opinionated, click-through to the actual items.
 */
function detect(
  stats: Record<string, ColumnStats>,
  totalItems: number,
  viewByColumnValue: (c: string, v: string) => void,
  viewByNumericRange: (c: string, low: number, high: number) => void,
): Highlight[] {
  const out: Highlight[] = [];

  for (const [col, s] of Object.entries(stats)) {
    if (s.type === "categorical" && s.data.length >= 2) {
      const top = s.data[0];
      const bottom = s.data[s.data.length - 1];
      if (top.count >= 50 && bottom.count > 0 && top.count / bottom.count >= 10) {
        out.push({
          id: `imbalance-${col}`,
          kind: "imbalance",
          title: `Class imbalance in ${col}`,
          detail: `${top.label} has ${top.count.toLocaleString()} items, ${bottom.label} only ${bottom.count.toLocaleString()}.`,
          cta: `View ${bottom.label}`,
          onAction: () => viewByColumnValue(col, bottom.label),
          tone: "warning",
        });
        continue;
      }
      if (s.total_unique && s.total_unique > 100) {
        out.push({
          id: `card-${col}`,
          kind: "high-cardinality",
          title: `${col} has ${s.total_unique.toLocaleString()} unique values`,
          detail: `High-cardinality column — consider if it's still useful for filtering.`,
        });
      }
    }
    if (s.type === "numeric" && s.counts.length >= 5) {
      const total = s.counts.reduce((a, b) => a + b, 0);
      if (total === 0) continue;
      const p99 = total * 0.99;
      let cum = 0;
      let p99BinIdx = s.counts.length - 1;
      for (let i = 0; i < s.counts.length; i++) {
        cum += s.counts[i];
        if (cum >= p99) { p99BinIdx = i; break; }
      }
      const tailFraction = p99BinIdx / s.counts.length;
      if (tailFraction < 0.5) {
        const cutoff = s.bins[p99BinIdx] ?? s.max;
        out.push({
          id: `tail-${col}`,
          kind: "long-tail",
          title: `Long tail in ${col}`,
          detail: `99% of values are under ${cutoff.toFixed(2)} — a handful extend to ${s.max.toFixed(2)}.`,
          cta: "View tail",
          onAction: () => viewByNumericRange(col, cutoff, s.max),
          tone: "warning",
        });
      }
    }
  }

  // Stable order: warnings first, then informational. Cap at 3.
  out.sort((a, b) => (a.tone === "warning" ? -1 : 0) - (b.tone === "warning" ? -1 : 0));
  return out.slice(0, 3);
}

export default function Highlights({
  stats, totalItems, viewByColumnValue, viewByNumericRange,
}: HighlightsProps) {
  const items = detect(stats, totalItems, viewByColumnValue, viewByNumericRange);

  if (items.length === 0) return null;

  return (
    <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
          Highlights
        </h2>
        <span className="text-[11px] text-gray-500">auto-detected</span>
      </div>
      <ul className="divide-y divide-gray-100">
        {items.map((h) => (
          <li key={h.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
            <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
              h.tone === "warning" ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-600"
            }`}>
              {h.kind === "imbalance" && (
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="3" x2="12" y2="21" /><line x1="3" y1="12" x2="21" y2="12" />
                  <rect x="3" y="9" width="9" height="6" />
                </svg>
              )}
              {h.kind === "long-tail" && (
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 21h18M5 21V10M9 21V6M13 21v-3M17 21v-8M21 21v-5" />
                </svg>
              )}
              {h.kind === "high-cardinality" && (
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" strokeLinecap="round" />
                </svg>
              )}
              {h.kind === "uniform" && (
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="9" width="18" height="6" />
                </svg>
              )}
            </div>
            <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-medium text-gray-900">{h.title}</div>
                <div className="mt-0.5 truncate text-[11px] text-gray-600">{h.detail}</div>
              </div>
              {h.onAction && h.cta && (
                <button
                  onClick={h.onAction}
                  className="shrink-0 rounded-md px-2 py-1 text-[11px] font-medium text-teal-700 transition-colors hover:bg-teal-50"
                >
                  {h.cta} →
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
