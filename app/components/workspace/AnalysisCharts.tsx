"use client";
import { useState, useCallback, useRef, useEffect } from "react";
import { useAtomValue } from "jotai";
import { configAtom, uuidAtom, columnsAtom } from "@/app/store/atoms";
import {
  fetchOutliers, fetchDuplicates, fetchCentroidDistance, fetchInsightsStatus, fetchMediaItems,
} from "@/app/lib/api";
import type { InsightsTaskResponse, InsightsStatusResponse, CentroidDistanceResult } from "@/app/lib/api";
import { useBreadcrumbNav } from "@/app/lib/use-breadcrumb-nav";
import type { PlotPanelConfig, OutlierResult, DuplicateGroup, Media } from "@/app/types";

interface AnalysisChartProps {
  panel: PlotPanelConfig;
  onChange: (updated: PlotPanelConfig) => void;
}

// ── Helpers ─────────────────────────────────────────────────────────

const isTaskResponse = (data: unknown): data is InsightsTaskResponse =>
  !!data && typeof data === "object" && "task_id" in (data as Record<string, unknown>);

async function fetchThumbnails(uuid: string, ids: number[], limit: number): Promise<Media[]> {
  if (ids.length === 0) return [];
  try {
    return await fetchMediaItems(uuid, ids.slice(0, limit), 0);
  } catch {
    return [];
  }
}

/** Poll a background insights task until done. Returns its results or null on error. */
async function pollUntilDone(
  uuid: string,
  taskId: string,
  abortRef: React.MutableRefObject<boolean>,
  onPhase?: (phase: string) => void,
): Promise<unknown | null> {
  while (!abortRef.current) {
    await new Promise((r) => setTimeout(r, 1500));
    if (abortRef.current) return null;
    try {
      const status: InsightsStatusResponse = await fetchInsightsStatus(uuid, taskId);
      if (onPhase && status.phase) onPhase(status.phase);
      if (status.status === "done") return status.results ?? null;
      if (status.status === "error") return null;
    } catch {
      return null;
    }
  }
  return null;
}

// ── Common chart shell ──────────────────────────────────────────────

function ChartShell({
  loading, phase, results, paramsBar, children, emptyHint,
}: {
  loading: boolean;
  phase?: string;
  results: boolean;
  paramsBar: React.ReactNode;
  children: React.ReactNode;
  emptyHint: string;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-gray-100 px-3 py-1.5">
        {paramsBar}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {loading ? (
          <div className="flex h-full items-center justify-center text-[11px] text-gray-500">
            <span className="mr-2 h-3 w-3 animate-spin rounded-full border-2 border-gray-200 border-t-teal-700" />
            {phase || "Analysing…"}
          </div>
        ) : !results ? (
          <div className="flex h-full items-center justify-center text-center text-[11px] text-gray-500">
            {emptyHint}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

// ── Outliers ────────────────────────────────────────────────────────

interface OutlierGroup {
  label: string;
  ids: number[];
  media: Media[];
  groupTotal: number;
}
interface OutlierState {
  results: OutlierResult[];
  media: Media[];
  groups: OutlierGroup[];
}

// Cap on thumbnails fetched for the ungrouped view. Hard to imagine wanting >500
// preview thumbnails at once; full list always reachable via "View in grid".
const OUTLIER_THUMB_CAP = 500;

export function OutliersChart({ panel, onChange }: AnalysisChartProps) {
  const uuid = useAtomValue(uuidAtom);
  const allColumns = useAtomValue(columnsAtom);
  const { pushSelection, pushFilter } = useBreadcrumbNav();
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<string>("");
  const [state, setState] = useState<OutlierState>({ results: [], media: [], groups: [] });
  const abortRef = useRef(false);

  useEffect(() => () => { abortRef.current = true; }, []);

  const k = panel.outlierK ?? 15;
  const threshold = panel.outlierThreshold ?? 1.5;
  const groupBy = panel.outlierGroupBy ?? null;

  // Only categorical-ish columns make sense for grouping (≤ ~50 unique values).
  const groupableColumns = allColumns.filter(
    (c) => c.name !== "id" && !c.name.startsWith("_") && c.n_unique > 0 && c.n_unique <= 50,
  );

  const run = useCallback(async () => {
    if (!uuid) return;
    abortRef.current = false;
    setLoading(true);
    setPhase("Starting");
    try {
      const resp = await fetchOutliers(uuid, [], k, threshold, groupBy ?? undefined);
      let results: OutlierResult[];
      if (isTaskResponse(resp)) {
        const polled = await pollUntilDone(uuid, resp.task_id, abortRef, setPhase);
        if (!polled) { setState({ results: [], media: [], groups: [] }); return; }
        results = polled as OutlierResult[];
      } else {
        results = resp as OutlierResult[];
      }

      const allIds = results.map((r) => r.media_id);

      if (groupBy) {
        // Bucket results by their `group` field
        const buckets = new Map<string, number[]>();
        const groupTotals = new Map<string, number>();
        for (const r of results) {
          const label = r.group ?? "(unknown)";
          const arr = buckets.get(label) ?? [];
          arr.push(r.media_id);
          buckets.set(label, arr);
          if (r.group_total && !groupTotals.has(label)) groupTotals.set(label, r.group_total);
        }
        const labels = Array.from(buckets.keys()).sort();
        // Up to 12 thumbnails per group; full list reachable via per-group view
        const groups: OutlierGroup[] = await Promise.all(
          labels.map(async (label) => {
            const ids = buckets.get(label)!;
            const media = await fetchThumbnails(uuid, ids, 12);
            return { label, ids, media, groupTotal: groupTotals.get(label) ?? ids.length };
          }),
        );
        setState({ results, media: [], groups });
      } else {
        const media = await fetchThumbnails(uuid, allIds, OUTLIER_THUMB_CAP);
        setState({ results, media, groups: [] });
      }
    } finally {
      setLoading(false);
      setPhase("");
    }
  }, [uuid, k, threshold, groupBy]);

  const allIds = state.results.map((r) => r.media_id);

  return (
    <ChartShell
      loading={loading}
      phase={phase}
      results={state.results.length > 0}
      emptyHint='Pick k & min score, optionally group by a class, then click "Find outliers".'
      paramsBar={
        <>
          <label className="flex items-center gap-1 text-[11px] text-gray-500">
            k
            <input
              type="number" min={3} max={50} value={k}
              onChange={(e) => onChange({ ...panel, outlierK: Math.max(3, parseInt(e.target.value) || 15) })}
              className="w-12 rounded border border-gray-200 px-1.5 py-0.5 text-[11px] focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500/20"
            />
          </label>
          <label className="flex items-center gap-1 text-[11px] text-gray-500">
            min score
            <input
              type="number" min={1} max={10} step={0.1} value={threshold}
              onChange={(e) => onChange({ ...panel, outlierThreshold: Math.max(1, parseFloat(e.target.value) || 1.5) })}
              className="w-14 rounded border border-gray-200 px-1.5 py-0.5 text-[11px] focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500/20"
            />
          </label>
          <label className="flex items-center gap-1 text-[11px] text-gray-500">
            group by
            <select
              value={groupBy ?? ""}
              onChange={(e) => onChange({ ...panel, outlierGroupBy: e.target.value || null })}
              className="max-w-[120px] rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[11px] focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500/20"
            >
              <option value="">none</option>
              {groupableColumns.map((c) => (
                <option key={c.name} value={c.name}>{c.name}</option>
              ))}
            </select>
          </label>
          <button
            onClick={run}
            disabled={loading}
            className="ml-auto rounded-md bg-teal-700 px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-teal-800 disabled:opacity-50"
          >
            {state.results.length > 0 ? "Re-run" : "Find outliers"}
          </button>
          {state.results.length > 0 && (
            <button
              onClick={() => pushSelection(allIds, groupBy ? `Outliers · grouped by ${groupBy}` : "Outliers")}
              className="rounded-md border border-gray-200 px-2.5 py-1 text-[11px] text-gray-700 transition-colors hover:bg-gray-50"
            >
              View in grid →
            </button>
          )}
        </>
      }
    >
      <div className="space-y-3">
        <div className="text-[11px] text-gray-600">
          <span className="font-medium text-gray-900">{state.results.length}</span> outliers
          {" · "}
          cosine LOF, k={k}, min score {threshold}
          {groupBy && (
            <> {" · "} across <span className="font-medium text-gray-900">{state.groups.length}</span> {groupBy} {state.groups.length === 1 ? "group" : "groups"}</>
          )}
        </div>

        {/* Grouped view: per-class card with thumbnails + drill-in */}
        {groupBy && state.groups.length > 0 ? (
          <div className="space-y-2">
            {state.groups.map((g) => (
              <div key={g.label} className="rounded-md border border-gray-200 p-2">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <div className="min-w-0 text-[11px] text-gray-700">
                    <span className="font-medium text-gray-900">{g.label}</span>
                    {" · "}
                    {g.ids.length} outlier{g.ids.length === 1 ? "" : "s"} of {g.groupTotal}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      onClick={() => pushFilter([{ column: groupBy, comparison: "=", values: [g.label] }], `${groupBy} = ${g.label}`, g.groupTotal)}
                      className="rounded border border-gray-200 px-2 py-0.5 text-[10px] text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700"
                    >
                      View entire group
                    </button>
                    <button
                      onClick={() => pushSelection(g.ids, `Outliers: ${g.label}`)}
                      className="rounded-md bg-teal-700 px-2 py-0.5 text-[10px] font-medium text-white transition-colors hover:bg-teal-800"
                    >
                      View outliers
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {g.media.map((m) => (
                    <button
                      key={m.index}
                      onClick={() => pushSelection([m.index], `Outlier #${m.index}`)}
                      className="overflow-hidden rounded ring-1 ring-gray-200 transition-all hover:ring-teal-500"
                      title={`Item ${m.index}`}
                    >
                      <img src={m.src} alt="" loading="lazy" className="block h-12 w-12 object-cover" />
                    </button>
                  ))}
                  {g.ids.length > g.media.length && (
                    <button
                      onClick={() => pushSelection(g.ids, `Outliers: ${g.label}`)}
                      className="flex h-12 w-12 items-center justify-center rounded bg-gray-100 text-[10px] font-medium text-gray-600 transition-colors hover:bg-gray-200"
                    >
                      +{g.ids.length - g.media.length}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Ungrouped: flat thumbnail grid */
          <>
            <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8 lg:grid-cols-10">
              {state.media.map((m) => (
                <button
                  key={m.index}
                  onClick={() => pushSelection([m.index], `Outlier #${m.index}`)}
                  className="overflow-hidden rounded ring-1 ring-gray-200 transition-all hover:ring-teal-500"
                  title={`Item ${m.index}`}
                >
                  <img src={m.src} alt={`Item ${m.index}`} loading="lazy" className="block aspect-square w-full object-cover" />
                </button>
              ))}
            </div>
            {state.results.length > state.media.length && (
              <button
                onClick={() => pushSelection(allIds, "Outliers")}
                className="block rounded-md border border-gray-200 px-2.5 py-1 text-[11px] text-gray-700 transition-colors hover:bg-gray-50"
              >
                +{state.results.length - state.media.length} more — view in grid
              </button>
            )}
          </>
        )}
      </div>
    </ChartShell>
  );
}

// ── Duplicates ──────────────────────────────────────────────────────

interface DuplicateState {
  groups: number[][];
  groupMedia: Media[][];
}

export function DuplicatesChart({ panel, onChange }: AnalysisChartProps) {
  const uuid = useAtomValue(uuidAtom);
  const { pushSelection } = useBreadcrumbNav();
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<string>("");
  const [state, setState] = useState<DuplicateState>({ groups: [], groupMedia: [] });
  const abortRef = useRef(false);

  useEffect(() => () => { abortRef.current = true; }, []);

  const threshold = panel.dupThreshold ?? 0.95;

  const run = useCallback(async () => {
    if (!uuid) return;
    abortRef.current = false;
    setLoading(true);
    setPhase("Starting");
    try {
      const resp = await fetchDuplicates(uuid, [], threshold);
      let groups: number[][];
      if (isTaskResponse(resp)) {
        const polled = await pollUntilDone(uuid, resp.task_id, abortRef, setPhase);
        if (!polled) { setState({ groups: [], groupMedia: [] }); return; }
        groups = polled as number[][];
      } else {
        // DuplicateGroup[] → number[][]: extract media_ids per group.
        const raw = resp as DuplicateGroup[] | number[][];
        groups = Array.isArray(raw) && raw.length > 0 && typeof (raw[0] as DuplicateGroup).media_ids !== "undefined"
          ? (raw as DuplicateGroup[]).map((g) => g.media_ids)
          : (raw as number[][]);
      }
      // Fetch 4 thumbnails per group for every group. Batched in parallel; per-group
      // failures are silent. For pathological cases (thousands of groups) this stays
      // bounded because each `fetchThumbnails` is capped at 4.
      const groupMedia: Media[][] = await Promise.all(
        groups.map((g) => fetchThumbnails(uuid, g.slice(0, 4), 4)),
      );
      setState({ groups, groupMedia });
    } finally {
      setLoading(false);
      setPhase("");
    }
  }, [uuid, threshold]);

  const totalDupItems = state.groups.reduce((s, g) => s + g.length, 0);

  return (
    <ChartShell
      loading={loading}
      phase={phase}
      results={state.groups.length > 0}
      emptyHint='Set a similarity threshold and click "Find duplicates".'
      paramsBar={
        <>
          <label className="flex items-center gap-1 text-[11px] text-gray-500">
            threshold
            <input
              type="number" min={0.5} max={1} step={0.01} value={threshold}
              onChange={(e) => onChange({ ...panel, dupThreshold: Math.min(1, Math.max(0.5, parseFloat(e.target.value) || 0.95)) })}
              className="w-16 rounded border border-gray-200 px-1.5 py-0.5 text-[11px] focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500/20"
            />
          </label>
          <button
            onClick={run}
            disabled={loading}
            className="ml-auto rounded-md bg-teal-700 px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-teal-800 disabled:opacity-50"
          >
            {state.groups.length > 0 ? "Re-run" : "Find duplicates"}
          </button>
          {state.groups.length > 0 && (
            <button
              onClick={() => pushSelection(state.groups.flat(), "Duplicates")}
              className="rounded-md border border-gray-200 px-2.5 py-1 text-[11px] text-gray-700 transition-colors hover:bg-gray-50"
            >
              View in grid →
            </button>
          )}
        </>
      }
    >
      <div className="space-y-2">
        <div className="text-[11px] text-gray-600">
          <span className="font-medium text-gray-900">{state.groups.length}</span> group{state.groups.length === 1 ? "" : "s"}
          {" · "}
          <span className="font-medium text-gray-900">{totalDupItems}</span> items
        </div>
        <div className="space-y-1.5">
          {state.groups.map((group, i) => (
            <button
              key={i}
              onClick={() => pushSelection(group, `Duplicate group ${i + 1}`)}
              className="flex w-full items-center gap-2 rounded-md border border-gray-200 p-1.5 transition-colors hover:border-teal-300 hover:bg-gray-50"
            >
              <div className="flex shrink-0 gap-1">
                {(state.groupMedia[i] ?? []).slice(0, 4).map((m) => (
                  <img key={m.index} src={m.src} alt="" loading="lazy" className="h-10 w-10 rounded object-cover" />
                ))}
              </div>
              <div className="text-[11px] text-gray-700">Group {i + 1} · {group.length} items</div>
              <svg className="ml-auto h-3 w-3 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6" /></svg>
            </button>
          ))}
        </div>
      </div>
    </ChartShell>
  );
}

// ── Farthest from centroid ──────────────────────────────────────────

interface FarthestState {
  results: CentroidDistanceResult[];
  media: Media[];
}

export function FarthestChart({ panel, onChange }: AnalysisChartProps) {
  const uuid = useAtomValue(uuidAtom);
  const allColumns = useAtomValue(columnsAtom);
  const { pushSelection } = useBreadcrumbNav();
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<string>("");
  const [state, setState] = useState<FarthestState>({ results: [], media: [] });
  const abortRef = useRef(false);

  useEffect(() => () => { abortRef.current = true; }, []);

  const groupBy = panel.outlierGroupBy ?? null;
  const groupableColumns = allColumns.filter(
    (c) => c.name !== "id" && !c.name.startsWith("_") && c.n_unique > 0 && c.n_unique <= 50,
  );

  const run = useCallback(async () => {
    if (!uuid) return;
    abortRef.current = false;
    setLoading(true);
    setPhase("Starting");
    try {
      const resp = await fetchCentroidDistance(uuid, [], 100, groupBy ?? undefined);
      let results: CentroidDistanceResult[];
      if (isTaskResponse(resp)) {
        const polled = await pollUntilDone(uuid, resp.task_id, abortRef, setPhase);
        if (!polled) { setState({ results: [], media: [] }); return; }
        results = polled as CentroidDistanceResult[];
      } else {
        results = resp as CentroidDistanceResult[];
      }
      const ids = results.map((r) => r.media_id);
      const media = await fetchThumbnails(uuid, ids, 100);
      setState({ results, media });
    } finally {
      setLoading(false);
      setPhase("");
    }
  }, [uuid, groupBy]);

  const ids = state.results.map((r) => r.media_id);

  // For grouped mode, render a small label badge above each thumbnail
  const groupLabelById = new Map<number, string | null>(state.results.map((r) => [r.media_id, r.group ?? null]));

  return (
    <ChartShell
      loading={loading}
      phase={phase}
      results={state.results.length > 0}
      emptyHint='Click "Find farthest" to rank items by distance from the centroid.'
      paramsBar={
        <>
          <span className="text-[11px] text-gray-500">
            {groupBy
              ? `One centroid per ${groupBy}; items ranked by distance from their own group`
              : "Top 100 by cosine distance from the dataset centroid"}
          </span>
          <label className="ml-3 flex items-center gap-1 text-[11px] text-gray-500">
            group by
            <select
              value={groupBy ?? ""}
              onChange={(e) => onChange({ ...panel, outlierGroupBy: e.target.value || null })}
              className="max-w-[120px] rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[11px] focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500/20"
            >
              <option value="">none</option>
              {groupableColumns.map((c) => (
                <option key={c.name} value={c.name}>{c.name}</option>
              ))}
            </select>
          </label>
          <button
            onClick={run}
            disabled={loading}
            className="ml-auto rounded-md bg-teal-700 px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-teal-800 disabled:opacity-50"
          >
            {state.results.length > 0 ? "Re-run" : "Find farthest"}
          </button>
          {state.results.length > 0 && (
            <button
              onClick={() => pushSelection(ids, groupBy ? `Farthest · grouped by ${groupBy}` : "Farthest from centroid")}
              className="rounded-md border border-gray-200 px-2.5 py-1 text-[11px] text-gray-700 transition-colors hover:bg-gray-50"
            >
              View in grid →
            </button>
          )}
        </>
      }
    >
      <div className="space-y-2">
        <div className="text-[11px] text-gray-600">
          Top <span className="font-medium text-gray-900">{state.results.length}</span> items by distance from
          {groupBy ? <> their own <span className="font-medium text-gray-900">{groupBy}</span> centroid</> : " the dataset centroid"}
        </div>
        <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8 lg:grid-cols-10">
          {state.media.map((m) => {
            const label = groupLabelById.get(m.index);
            return (
              <button
                key={m.index}
                onClick={() => pushSelection([m.index], `Item #${m.index}`)}
                className="relative overflow-hidden rounded ring-1 ring-gray-200 transition-all hover:ring-teal-500"
                title={`Item ${m.index}${label ? ` · ${label}` : ""}`}
              >
                <img src={m.src} alt={`Item ${m.index}`} loading="lazy" className="block aspect-square w-full object-cover" />
                {label && (
                  <span className="absolute left-1 top-1 max-w-[80%] truncate rounded bg-black/55 px-1 py-px text-[9px] font-medium text-white">
                    {label}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </ChartShell>
  );
}

// ── Dispatch ────────────────────────────────────────────────────────

export function isAnalysisType(type: string): boolean {
  return type === "outliers" || type === "duplicates" || type === "farthest";
}

export default function AnalysisChart(props: AnalysisChartProps) {
  if (props.panel.type === "outliers") return <OutliersChart {...props} />;
  if (props.panel.type === "duplicates") return <DuplicatesChart {...props} />;
  if (props.panel.type === "farthest") return <FarthestChart {...props} />;
  return null;
}
