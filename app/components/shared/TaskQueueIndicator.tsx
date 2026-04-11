"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  backgroundTasksAtom,
  columnsAtom,
  insightsColumnStatsAtom,
  insightsOutliersAtom,
  insightsDuplicatesAtom,
  insightsWeirdestAtom,
  uuidAtom,
} from "@/app/store/atoms";
import type { BackgroundTask } from "@/app/store/atoms";
import { fetchImageStatsStatus, fetchColumns, fetchInsightsStatus, fetchMediaItems } from "@/app/lib/api";

function MiniProgressRing({ progress }: { progress: number }) {
  const r = 6;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (progress / 100) * circumference;
  return (
    <svg width="16" height="16" className="shrink-0">
      <circle cx="8" cy="8" r={r} fill="none" stroke="#e5e7eb" strokeWidth="2" />
      <circle
        cx="8" cy="8" r={r} fill="none" stroke="#1f2937" strokeWidth="2"
        strokeDasharray={circumference} strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 8 8)"
        className="transition-[stroke-dashoffset] duration-300"
      />
    </svg>
  );
}

export default function TaskQueueIndicator() {
  const uuid = useAtomValue(uuidAtom);
  const [tasks, setTasks] = useAtom(backgroundTasksAtom);
  const setColumns = useSetAtom(columnsAtom);
  const setColumnStats = useSetAtom(insightsColumnStatsAtom);
  const setOutlierState = useSetAtom(insightsOutliersAtom);
  const setDuplicateState = useSetAtom(insightsDuplicatesAtom);
  const setWeirdState = useSetAtom(insightsWeirdestAtom);
  const [open, setOpen] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval>>();
  const dropdownRef = useRef<HTMLDivElement>(null);

  const runningTasks = tasks.filter((t) => t.status === "running");
  const recentDone = tasks.filter(
    (t) => t.status === "done" && t.completedAt && Date.now() - t.completedAt < 30000,
  );

  // Poll running tasks
  useEffect(() => {
    if (runningTasks.length === 0) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    const poll = () => {
      for (const task of runningTasks) {
        if (task.type === "image_stats") {
          fetchImageStatsStatus(task.viewUuid)
            .then((s) => {
              setTasks((prev) =>
                prev.map((t) => {
                  if (t.id !== task.id) return t;
                  if (s.status === "done" || s.status === "already_computed") {
                    // Refresh columns so new stats appear everywhere
                    fetchColumns(task.viewUuid).then(setColumns).catch(() => {});
                    setColumnStats({});
                    return { ...t, status: "done" as const, progress: 100, done: s.total, total: s.total, completedAt: Date.now() };
                  }
                  return { ...t, progress: s.progress, done: s.done, total: s.total };
                }),
              );
            })
            .catch(() => {});
        } else if (task.taskId && (task.type === "outliers" || task.type === "duplicates" || task.type === "centroid_distance")) {
          fetchInsightsStatus(task.viewUuid, task.taskId)
            .then((s) => {
              setTasks((prev) =>
                prev.map((t) => {
                  if (t.id !== task.id) return t;
                  if (s.status === "done") {
                    // Store results in the appropriate atom
                    if (task.type === "outliers" && s.results) {
                      const ids = s.results.map((r: any) => r.media_id);
                      // Check if grouped
                      const hasGroups = s.results.some((r: any) => r.group);
                      if (hasGroups) {
                        const groupMap = new Map<string, number[]>();
                        const groupTotals = new Map<string, number>();
                        for (const r of s.results) {
                          const label = r.group ?? "(unknown)";
                          const arr = groupMap.get(label) ?? [];
                          arr.push(r.media_id);
                          groupMap.set(label, arr);
                          if (r.group_total && !groupTotals.has(label)) groupTotals.set(label, r.group_total);
                        }
                        const groups = Array.from(groupMap.entries()).map(([label, gids]) => ({
                          label, ids: gids, media: [], total: groupTotals.get(label) ?? gids.length,
                        }));
                        groups.sort((a, b) => a.label.localeCompare(b.label));
                        fetchMediaItems(task.viewUuid, ids.slice(0, 12), 0)
                          .then((media) => setOutlierState({ ids, media, groups }))
                          .catch(() => setOutlierState({ ids, media: [], groups }));
                      } else {
                        fetchMediaItems(task.viewUuid, ids.slice(0, 12), 0)
                          .then((media) => setOutlierState({ ids, media }))
                          .catch(() => setOutlierState({ ids, media: [] }));
                      }
                    } else if (task.type === "duplicates" && s.results) {
                      const groups = s.results.map((g: any) => g.media_ids);
                      const previewGroups = groups.slice(0, 20);
                      const allPreviewIds = previewGroups.flatMap((g: number[]) => g.slice(0, 6));
                      fetchMediaItems(task.viewUuid, allPreviewIds, 0)
                        .then((media) => {
                          const byId = new Map(media.map((m: any) => [m.index, m]));
                          const groupMedia = previewGroups.map((g: number[]) =>
                            g.slice(0, 6).map((id: number) => byId.get(id)).filter(Boolean),
                          );
                          for (let j = previewGroups.length; j < groups.length; j++) groupMedia.push([]);
                          setDuplicateState({ groups, groupMedia });
                        })
                        .catch(() => setDuplicateState({ groups, groupMedia: groups.map(() => []) }));
                    } else if (task.type === "centroid_distance" && s.results) {
                      const ids = s.results.map((r: any) => r.media_id);
                      fetchMediaItems(task.viewUuid, ids.slice(0, 12), 0)
                        .then((media) => setWeirdState({ ids, media }))
                        .catch(() => setWeirdState({ ids, media: [] }));
                    }
                    return { ...t, status: "done" as const, progress: 100, completedAt: Date.now(), phase: "Done" };
                  }
                  if (s.status === "error") {
                    return { ...t, status: "error" as const, phase: s.error ?? "Failed" };
                  }
                  return { ...t, progress: s.progress, phase: s.phase };
                }),
              );
            })
            .catch(() => {});
        }
      }
    };
    poll();
    pollRef.current = setInterval(poll, 1000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [runningTasks.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Auto-dismiss completed tasks after 30s
  useEffect(() => {
    if (recentDone.length === 0) return;
    const timer = setTimeout(() => {
      setTasks((prev) => prev.filter((t) => t.status === "running" || (t.completedAt && Date.now() - t.completedAt < 30000)));
    }, 30000);
    return () => clearTimeout(timer);
  }, [recentDone.length, setTasks]);

  const dismissTask = useCallback(
    (id: string) => setTasks((prev) => prev.filter((t) => t.id !== id)),
    [setTasks],
  );

  const visibleTasks = tasks.filter(
    (t) => t.status === "running" || (t.completedAt && Date.now() - t.completedAt < 30000),
  );

  if (visibleTasks.length === 0) return null;

  const mainTask = runningTasks[0] ?? recentDone[0];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 transition-colors hover:bg-gray-50"
      >
        {runningTasks.length > 0 ? (
          <MiniProgressRing progress={mainTask?.progress ?? 0} />
        ) : (
          <svg className="h-3.5 w-3.5 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        )}
        <span className="max-w-[120px] truncate">
          {runningTasks.length > 0
            ? `${runningTasks.length} running`
            : "Done"}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="border-b border-gray-100 px-3 py-2">
            <span className="text-xs font-medium text-gray-700">Background tasks</span>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {visibleTasks.length === 0 && (
              <div className="px-3 py-4 text-center text-xs text-gray-400">No active tasks</div>
            )}
            {visibleTasks.map((task) => (
              <div key={task.id} className="border-b border-gray-50 px-3 py-2.5 last:border-b-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-700">{task.label}</span>
                  {task.status === "done" ? (
                    <button
                      onClick={() => dismissTask(task.id)}
                      className="rounded p-0.5 text-gray-400 transition-colors hover:text-gray-600"
                    >
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M18 6 6 18M6 6l12 12" />
                      </svg>
                    </button>
                  ) : (
                    <span className="text-[10px] text-gray-400">
                      {task.done.toLocaleString()} / {task.total.toLocaleString()}
                    </span>
                  )}
                </div>
                {task.status === "running" && (
                  <>
                    {task.phase && (
                      <div className="mt-1 text-[10px] text-gray-400">{task.phase}</div>
                    )}
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-gray-700 transition-all duration-300"
                        style={{ width: `${task.progress}%` }}
                      />
                    </div>
                  </>
                )}
                {task.status === "done" && (
                  <div className="mt-1 flex items-center gap-1 text-[10px] text-emerald-600">
                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    {task.type === "image_stats"
                      ? "Complete \u2014 columns available in plots and filters"
                      : "Complete \u2014 results ready in Insights"}
                  </div>
                )}
                {task.status === "error" && (
                  <div className="mt-1 text-[10px] text-red-500">Failed</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
