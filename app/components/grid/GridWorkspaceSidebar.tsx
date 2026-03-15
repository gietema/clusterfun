"use client";
import { useEffect, useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  faBolt, faDownload, faRotateLeft,
  faStop, faArrowsRotate, faChevronDown, faChevronRight, faXmark,
  faArrowRight,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { saveAs } from "file-saver";
import {
  configAtom, currentMediaIndicesAtom, mediaItemsAtom, uuidAtom,
  mediaAtom, mediaIndicesStackAtom, gridValuesAtom, showPageAtom,
  similarityResultsAtom, labelFilterAtom,
} from "@/app/store/atoms";
import {
  fetchLabelCounts, saveLabel, deleteLabel,
  downloadLabelCsv, fetchSimilar, fetchAllLabels,
} from "@/app/lib/api";
import type { LabelCount } from "@/app/types";
import { getLabelColor } from "@/app/lib/label-colors";
import { useLabelUndo } from "@/app/lib/use-label-undo";
import { useActiveLearning } from "@/app/lib/use-active-learning";
import { AL_METHODS } from "@/app/lib/active-learning";
import PreviewMedia from "../shared/PreviewMedia";
import InformationItem from "../shared/InformationItem";

function Section({ title, defaultOpen = false, children, badge }: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  badge?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-gray-200">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
      >
        <FontAwesomeIcon icon={open ? faChevronDown : faChevronRight} className="w-2.5 text-gray-400" />
        {title}
        {badge && <span className="ml-auto">{badge}</span>}
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

export default function GridWorkspaceSidebar() {
  const uuid = useAtomValue(uuidAtom);
  const [config, setConfig] = useAtom(configAtom);
  const [media, setSideMedia] = useAtom(mediaAtom);
  const [mediaItems, setMediaItems] = useAtom(mediaItemsAtom);
  const mediaIndices = useAtomValue(currentMediaIndicesAtom);
  const setMediaIndicesStack = useSetAtom(mediaIndicesStackAtom);
  const setGridValues = useSetAtom(gridValuesAtom);
  const setShowPage = useSetAtom(showPageAtom);
  const setSimilarityResults = useSetAtom(similarityResultsAtom);
  const setLabelFilter = useSetAtom(labelFilterAtom);

  const [labelCounts, setLabelCounts] = useState<LabelCount[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [alLoading, setAlLoading] = useState(false);
  const [findSimilarLoading, setFindSimilarLoading] = useState(false);

  const { pushAction, undo, redo, canUndo, canRedo } = useLabelUndo();
  const {
    isAvailable, isActive, alState, stop, refit,
    methodId, setMethodId, mlpLayers, setMlpLayers,
    classFilter, setClassFilter, sortBy, setSortBy,
  } = useActiveLearning();

  useEffect(() => {
    fetchLabelCounts(uuid, mediaIndices).then(setLabelCounts);
  }, [mediaIndices, mediaItems, uuid]);

  if (!config) return null;

  // ── Label handlers ──
  const handleAddLabel = () => {
    if (!newLabel || config.labels.includes(newLabel)) return;
    setConfig({ ...config, labels: [...config.labels, newLabel] });
    setNewLabel("");
  };

  const handleRemoveLabel = (label: string) => {
    setConfig({ ...config, labels: config.labels.filter((l) => l !== label) });
  };

  const handlePreviewLabelToggle = (label: string) => {
    if (!media) return;
    const isRemove = media.labels?.includes(label);
    if (isRemove) {
      deleteLabel(uuid, [media.index], label).catch(console.error);
      pushAction({ type: "remove", label, mediaIds: [media.index] });
    } else {
      saveLabel(uuid, [media.index], label).catch(console.error);
      pushAction({ type: "add", label, mediaIds: [media.index] });
    }
    // Update the preview media
    const labels = media.labels ? [...media.labels] : [];
    if (isRemove) {
      setSideMedia({ ...media, labels: labels.filter((l) => l !== label) });
    } else {
      if (!labels.includes(label)) labels.push(label);
      setSideMedia({ ...media, labels });
    }
    // Update grid items
    setMediaItems((items) =>
      items.map((m) => {
        if (m.index !== media.index) return m;
        const mLabels = m.labels ? [...m.labels] : [];
        if (isRemove) return { ...m, labels: mLabels.filter((l) => l !== label) };
        if (!mLabels.includes(label)) mLabels.push(label);
        return { ...m, labels: mLabels };
      }),
    );
  };

  const handleLabelAllOnPage = (label: string) => {
    const allHave = mediaItems.every((m) => m.labels?.includes(label));
    const toProcess: number[] = [];

    setMediaItems((items) =>
      items.map((m) => {
        const labels = m.labels ? [...m.labels] : [];
        if (allHave) {
          if (labels.includes(label)) {
            toProcess.push(m.index);
            return { ...m, labels: labels.filter((l) => l !== label) };
          }
        } else {
          if (!labels.includes(label)) {
            toProcess.push(m.index);
            return { ...m, labels: [...labels, label] };
          }
        }
        return m;
      }),
    );

    if (toProcess.length > 0) {
      if (allHave) {
        deleteLabel(uuid, toProcess, label).catch(console.error);
        pushAction({ type: "remove", label, mediaIds: toProcess });
      } else {
        saveLabel(uuid, toProcess, label).catch(console.error);
        pushAction({ type: "add", label, mediaIds: toProcess });
      }
    }
  };

  const handleDownload = async () => {
    const blob = await downloadLabelCsv(uuid, [], undefined);
    saveAs(blob, `${uuid}_labels.csv`);
  };

  const handleShowLabel = async (label: string) => {
    const allLabels = await fetchAllLabels(uuid);
    const ids: number[] = [];
    for (const [mediaId, labels] of Object.entries(allLabels)) {
      if (labels.includes(label)) ids.push(parseInt(mediaId));
    }
    if (ids.length === 0) return;
    setLabelFilter(label);
    setMediaIndicesStack((prev) => {
      const base = prev.length > 0 ? prev[0] : mediaIndices;
      return [base, ids];
    });
    setGridValues((prev) => ({ ...prev, page: 0 }));
  };

  const handleFit = async () => {
    setAlLoading(true);
    await refit();
    setAlLoading(false);
  };

  const handleFindSimilar = async () => {
    if (!media || !config?.embeddings) return;
    setFindSimilarLoading(true);
    try {
      const results = await fetchSimilar(uuid, media.index);
      const ids = results.map((r) => r.media_id);
      const scores: Record<number, number> = {};
      for (const r of results) scores[r.media_id] = r.similarity;
      setSimilarityResults(scores);
      setMediaIndicesStack((prev) =>
        prev.length > 1 ? [...prev.slice(0, -1), ids] : [...prev, ids],
      );
      setGridValues((prev) => ({ ...prev, page: 0 }));
      setShowPage("grid");
    } finally {
      setFindSimilarLoading(false);
    }
  };

  // Build label count lookup
  const countByLabel = new Map(labelCounts.map((lc) => [lc.label, lc]));
  const totalSelection = labelCounts.reduce((sum, lc) => sum + lc.inCurrentSelection, 0);
  const totalDataset = labelCounts.reduce((sum, lc) => sum + lc.inEntireDataset, 0);

  const info = media?.information;
  const entries = info
    ? Object.entries(info).filter(([key]) => key !== config.bounding_box)
    : [];

  return (
    <div className="flex h-full flex-col overflow-y-auto border-l border-gray-200">
      {/* Preview */}
      <Section title="Preview" defaultOpen>
        {media ? (
          <div className="flex flex-col gap-2">
            <div className="rounded [&_img]:max-h-[200px] [&_img]:w-auto [&_img]:object-contain [&_video]:max-h-[200px] [&_video]:w-auto [&_video]:object-contain">
              <PreviewMedia
                media={media}
                boundingBoxColumn={config.bounding_box}
                displayLabel
              />
            </div>
            {config.embeddings && (
              <button
                onClick={handleFindSimilar}
                disabled={findSimilarLoading}
                className="w-full rounded-md bg-gray-800 px-3 py-1.5 text-center text-xs font-medium text-white transition-colors hover:bg-gray-700 disabled:opacity-50"
              >
                {findSimilarLoading ? "Searching..." : "Find similar"}
              </button>
            )}
            <div>
              {entries.map(([key, value]) => (
                <InformationItem key={key} label={key} value={value} />
              ))}
            </div>
            {/* Quick label toggles for previewed item */}
            {config.labels.length > 0 && (
              <div className="flex flex-wrap gap-1 border-t border-gray-100 pt-2">
                {config.labels.map((label, idx) => {
                  const isActive = media.labels?.includes(label);
                  const color = getLabelColor(idx);
                  return (
                    <button
                      key={label}
                      onClick={() => handlePreviewLabelToggle(label)}
                      className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-all"
                      style={isActive
                        ? { backgroundColor: color, color: "white" }
                        : { backgroundColor: `${color}15`, color, border: `1px solid ${color}40` }
                      }
                      title={`${isActive ? "Remove" : "Add"} "${label}" (key: ${idx + 1})`}
                    >
                      {label}
                      <span className="text-[10px] opacity-60">{idx + 1}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-gray-400">Hover an item to preview</p>
        )}
      </Section>

      {/* Labels */}
      <Section
        title="Labels"
        defaultOpen
        badge={
          (canUndo || canRedo) ? (
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={undo}
                disabled={!canUndo}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-700 disabled:opacity-30 disabled:hover:bg-transparent"
                title="Undo (Ctrl+Z)"
              >
                <FontAwesomeIcon icon={faRotateLeft} />
              </button>
              <button
                onClick={redo}
                disabled={!canRedo}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-700 disabled:opacity-30 disabled:hover:bg-transparent"
                title="Redo (Ctrl+Shift+Z)"
              >
                <FontAwesomeIcon icon={faRotateLeft} className="scale-x-[-1]" />
              </button>
            </div>
          ) : undefined
        }
      >
        {/* Label list */}
        <div className="mb-2 space-y-1">
          {config.labels.map((label, idx) => {
            const lc = countByLabel.get(label);
            const inSel = lc?.inCurrentSelection ?? 0;
            const inAll = lc?.inEntireDataset ?? 0;
            const color = getLabelColor(idx);
            const allOnPageHave = mediaItems.length > 0 && mediaItems.every((m) => m.labels?.includes(label));
            return (
              <div key={label} className="rounded-md border border-gray-100 bg-gray-50 px-2 py-1.5">
                <div className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span className="flex-grow truncate text-xs font-medium text-gray-800">{label}</span>
                  <span className="text-[10px] text-gray-400">{idx + 1}</span>
                  {inSel === 0 && inAll === 0 && (
                    <button
                      className="text-gray-300 hover:text-red-500"
                      onClick={() => handleRemoveLabel(label)}
                      title="Remove label"
                    >
                      <FontAwesomeIcon icon={faXmark} className="text-[10px]" />
                    </button>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-2 text-[10px] text-gray-500">
                  <span>{inSel} in page</span>
                  <span>{inAll} total</span>
                  <div className="ml-auto flex items-center gap-1">
                    <button
                      className="rounded px-1 py-px text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-700"
                      onClick={() => handleLabelAllOnPage(label)}
                      title={allOnPageHave ? "Remove from all on page" : "Apply to all on page"}
                    >
                      {allOnPageHave ? "Remove all" : "Label page"}
                    </button>
                    {inAll > 0 && (
                      <button
                        className="flex items-center gap-0.5 rounded px-1 py-px text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-700"
                        onClick={() => handleShowLabel(label)}
                        title={`Show all ${inAll} items with "${label}"`}
                      >
                        Show <FontAwesomeIcon icon={faArrowRight} className="text-[8px]" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {/* Add label */}
        <div className="flex items-center gap-1">
          <input
            placeholder="New label name"
            type="text"
            className="min-w-0 flex-grow rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 focus:border-gray-400 focus:outline-none"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAddLabel(); }}
          />
          <button
            className="shrink-0 rounded-md bg-gray-800 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-gray-700"
            onClick={handleAddLabel}
          >
            Add
          </button>
        </div>
        <div className="mt-1.5 flex items-center justify-between">
          <p className="text-xs text-gray-400">
            Keys 1-9 to label. Ctrl+Z undo. Ctrl+Shift+Z redo.
          </p>
          {totalDataset > 0 && (
            <button
              className="flex items-center gap-1 text-[10px] text-gray-400 transition-colors hover:text-gray-700"
              onClick={handleDownload}
              title="Download all labels as CSV"
            >
              <FontAwesomeIcon icon={faDownload} className="text-[9px]" />
              CSV
            </button>
          )}
        </div>
      </Section>

      {/* Active Learning */}
      {isAvailable && (
        <Section title="Active learning" defaultOpen>
          {/* Method selection */}
          <div className="space-y-2">
            <div>
              <div className="mb-1 text-xs text-gray-500">Method</div>
              <div className="flex items-center gap-1.5">
                <select
                  value={methodId}
                  onChange={(e) => setMethodId(e.target.value)}
                  className="min-w-0 flex-grow rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 focus:border-gray-400 focus:outline-none"
                >
                  {AL_METHODS.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
                {methodId === "mlp" && (
                  <div className="flex items-center gap-0.5 rounded-md border border-gray-200 p-0.5">
                    {[1, 2, 3].map((n) => (
                      <button
                        key={n}
                        onClick={() => setMlpLayers(n)}
                        className={`rounded px-1.5 py-0.5 text-xs transition-colors ${
                          mlpLayers === n
                            ? "bg-gray-800 text-white"
                            : "text-gray-500 hover:bg-gray-100"
                        }`}
                        title={`${n} hidden layer${n > 1 ? "s" : ""}`}
                      >
                        {n}L
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="mt-1 text-xs text-gray-400">
                {AL_METHODS.find((m) => m.id === methodId)?.description}
              </div>
            </div>

            {/* Action */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleFit}
                disabled={alLoading}
                className="flex items-center gap-1.5 rounded-md bg-gray-800 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gray-700 disabled:opacity-50"
              >
                <FontAwesomeIcon icon={isActive ? faArrowsRotate : faBolt} className={alLoading ? "animate-spin" : ""} />
                {alLoading ? "Fitting..." : isActive ? "Refit" : "Suggest next"}
              </button>
              {isActive && (
                <button
                  onClick={stop}
                  className="rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-100"
                  title="Stop active learning"
                >
                  <FontAwesomeIcon icon={faStop} />
                </button>
              )}
              {alState && (
                <span className="text-xs text-gray-500">
                  {alState.nLabeled} labeled
                </span>
              )}
            </div>

            {/* Results (when active) */}
            {isActive && (
              <div className="space-y-2 border-t border-gray-100 pt-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-500">Sort by</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as "confidence" | "uncertainty")}
                    className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 focus:border-gray-400 focus:outline-none"
                  >
                    <option value="confidence">most similar first</option>
                    <option value="uncertainty">most uncertain first</option>
                  </select>
                </div>

                {/* Class filter pills */}
                {alState && alState.labelClasses.length > 1 && (
                  <div>
                    <div className="mb-1 text-xs text-gray-500">Filter by class</div>
                    <div className="flex flex-wrap gap-1">
                      <button
                        onClick={() => setClassFilter(null)}
                        className={`rounded-full px-2.5 py-0.5 text-xs transition-colors ${
                          classFilter === null
                            ? "bg-gray-800 text-white"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                      >
                        All
                      </button>
                      {alState.labelClasses.map((cls) => {
                        const count = alState.predictions.filter((p) => p.predicted_class === cls).length;
                        return (
                          <button
                            key={cls}
                            onClick={() => setClassFilter(cls)}
                            className={`rounded-full px-2.5 py-0.5 text-xs transition-colors ${
                              classFilter === cls
                                ? "bg-gray-800 text-white"
                                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                            }`}
                          >
                            {cls} <span className="opacity-60">{count}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </Section>
      )}
    </div>
  );
}
