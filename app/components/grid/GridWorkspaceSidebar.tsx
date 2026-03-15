"use client";
import { useEffect, useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  faBolt, faDownload, faRotateLeft, faTableCells,
  faStop, faArrowsRotate, faChevronDown, faChevronRight, faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { saveAs } from "file-saver";
import toast from "react-hot-toast";
import {
  configAtom, currentMediaIndicesAtom, mediaItemsAtom, uuidAtom,
  mediaAtom, mediaIndicesStackAtom, gridValuesAtom, showPageAtom,
  similarityResultsAtom,
} from "@/app/store/atoms";
import {
  fetchLabelCounts, saveLabel, deleteLabel,
  downloadLabelCsv, saveLabelAsGrid, fetchSimilar,
} from "@/app/lib/api";
import type { LabelCount } from "@/app/types";
import { useLabelUndo } from "@/app/lib/use-label-undo";
import { useActiveLearning } from "@/app/lib/use-active-learning";
import { AL_METHODS } from "@/app/lib/active-learning";
import PreviewMedia from "../shared/PreviewMedia";
import InformationItem from "../shared/InformationItem";
import TextSearchBar from "../shared/TextSearchBar";
import InsightsPanel from "./InsightsPanel";

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
  const media = useAtomValue(mediaAtom);
  const [mediaItems, setMediaItems] = useAtom(mediaItemsAtom);
  const mediaIndices = useAtomValue(currentMediaIndicesAtom);
  const setMediaIndicesStack = useSetAtom(mediaIndicesStackAtom);
  const setGridValues = useSetAtom(gridValuesAtom);
  const setShowPage = useSetAtom(showPageAtom);
  const setSimilarityResults = useSetAtom(similarityResultsAtom);

  const [labelCounts, setLabelCounts] = useState<LabelCount[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [alLoading, setAlLoading] = useState(false);
  const [findSimilarLoading, setFindSimilarLoading] = useState(false);

  const { pushAction, undo, canUndo } = useLabelUndo();
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

  const handleDownload = async (currentSelection: boolean, label?: string) => {
    const ids = currentSelection ? mediaIndices : [];
    const blob = await downloadLabelCsv(uuid, ids, label);
    saveAs(blob, `${uuid}_labels.csv`);
  };

  const handleSaveAsGrid = async (currentSelection: boolean, label?: string) => {
    try {
      const result = await saveLabelAsGrid(uuid, currentSelection ? mediaIndices : [], label);
      const location = result.split("/").pop();
      toast.custom(
        (t) => (
          <div className={`rounded-lg bg-white px-6 py-4 text-gray-900 shadow-lg ${t.visible ? "animate-enter" : "animate-leave"}`}>
            Plot saved. To view the plot, run<br />
            <div className="my-2">
              <code className="rounded-md bg-gray-800 px-3 py-1.5 text-sm text-white">
                <span className="text-pink-400">clusterfun</span> {location}
              </code>
            </div>
            <div className="flex justify-end">
              <button
                className="mt-2 rounded-md bg-gray-800 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gray-700"
                onClick={() => toast.dismiss(t.id)}
              >
                Close
              </button>
            </div>
          </div>
        ),
        { duration: 10000 },
      );
    } catch {
      alert("Could not save labels as new plot");
    }
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
      {/* Search */}
      {config.embeddings_model && (
        <Section title="Search" defaultOpen>
          <TextSearchBar />
        </Section>
      )}

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
          canUndo ? (
            <button
              onClick={(e) => { e.stopPropagation(); undo(); }}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-700"
              title="Undo last label action (Ctrl+Z)"
            >
              <FontAwesomeIcon icon={faRotateLeft} />
              undo
            </button>
          ) : undefined
        }
      >
        {/* Always show all labels from config */}
        <table className="mb-2 w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="border border-gray-200 px-2 py-1 text-left font-medium text-gray-700">Label</th>
              <th className="border border-gray-200 px-2 py-1 text-right font-medium text-gray-700">Selection</th>
              <th className="border border-gray-200 px-2 py-1 text-right font-medium text-gray-700">Total</th>
              <th className="w-8 border border-gray-200 px-1 py-1" />
            </tr>
          </thead>
          <tbody>
            {config.labels.map((label) => {
              const lc = countByLabel.get(label);
              const inSel = lc?.inCurrentSelection ?? 0;
              const inAll = lc?.inEntireDataset ?? 0;
              return (
                <tr key={label}>
                  <td className="border border-gray-200 px-2 py-1.5">
                    <span className="font-medium">{label}</span>
                  </td>
                  <td className="border border-gray-200 px-2 py-1.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <span>{inSel}</span>
                      {inSel > 0 && (
                        <div className="flex gap-0.5">
                          <button className="text-gray-400 hover:text-gray-700" onClick={() => handleDownload(true, label)} title="Download selection">
                            <FontAwesomeIcon icon={faDownload} className="text-[10px]" />
                          </button>
                          <button className="text-gray-400 hover:text-gray-700" onClick={() => handleSaveAsGrid(true, label)} title="Save as grid">
                            <FontAwesomeIcon icon={faTableCells} className="text-[10px]" />
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="border border-gray-200 px-2 py-1.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <span>{inAll}</span>
                      {inAll > 0 && (
                        <div className="flex gap-0.5">
                          <button className="text-gray-400 hover:text-gray-700" onClick={() => handleDownload(false, label)} title="Download all">
                            <FontAwesomeIcon icon={faDownload} className="text-[10px]" />
                          </button>
                          <button className="text-gray-400 hover:text-gray-700" onClick={() => handleSaveAsGrid(false, label)} title="Save as grid">
                            <FontAwesomeIcon icon={faTableCells} className="text-[10px]" />
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="border border-gray-200 px-1 py-1.5 text-center">
                    {inSel === 0 && inAll === 0 && (
                      <button
                        className="text-gray-300 hover:text-red-500"
                        onClick={() => handleRemoveLabel(label)}
                        title="Remove label"
                      >
                        <FontAwesomeIcon icon={faXmark} className="text-[10px]" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {config.labels.length > 1 && (totalSelection > 0 || totalDataset > 0) && (
              <tr className="bg-gray-50">
                <td className="border border-gray-200 px-2 py-1.5 font-medium">Total</td>
                <td className="border border-gray-200 px-2 py-1.5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <span>{totalSelection}</span>
                    {totalSelection > 0 && (
                      <div className="flex gap-0.5">
                        <button className="text-gray-400 hover:text-gray-700" onClick={() => handleDownload(true)} title="Download all labels (selection)">
                          <FontAwesomeIcon icon={faDownload} className="text-[10px]" />
                        </button>
                        <button className="text-gray-400 hover:text-gray-700" onClick={() => handleSaveAsGrid(true)} title="Save as grid">
                          <FontAwesomeIcon icon={faTableCells} className="text-[10px]" />
                        </button>
                      </div>
                    )}
                  </div>
                </td>
                <td className="border border-gray-200 px-2 py-1.5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <span>{totalDataset}</span>
                    {totalDataset > 0 && (
                      <div className="flex gap-0.5">
                        <button className="text-gray-400 hover:text-gray-700" onClick={() => handleDownload(false)} title="Download all labels">
                          <FontAwesomeIcon icon={faDownload} className="text-[10px]" />
                        </button>
                        <button className="text-gray-400 hover:text-gray-700" onClick={() => handleSaveAsGrid(false)} title="Save as grid">
                          <FontAwesomeIcon icon={faTableCells} className="text-[10px]" />
                        </button>
                      </div>
                    )}
                  </div>
                </td>
                <td className="border border-gray-200" />
              </tr>
            )}
          </tbody>
        </table>
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
        <p className="mt-1.5 text-xs text-gray-400">
          Use keys 1-9 to label items. Ctrl+Z to undo.
        </p>
      </Section>

      {/* Insights */}
      {config.embeddings && (
        <Section title="Insights">
          <InsightsPanel />
        </Section>
      )}

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
