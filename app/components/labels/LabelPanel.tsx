"use client";
import { useAtom, useAtomValue } from "jotai";
import { useEffect, useState } from "react";
import { faBolt, faCaretUp, faDownload, faRotateLeft, faTableCells, faStop, faArrowsRotate } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { saveAs } from "file-saver";
import toast from "react-hot-toast";
import {
  configAtom, currentMediaIndicesAtom, mediaItemsAtom, uuidAtom,
} from "@/app/store/atoms";
import {
  fetchLabelCounts, saveLabel, deleteLabel,
  downloadLabelCsv, saveLabelAsGrid,
} from "@/app/lib/api";
import type { LabelCount } from "@/app/types";
import { useLabelUndo } from "@/app/lib/use-label-undo";
import { useActiveLearning } from "@/app/lib/use-active-learning";
import { AL_METHODS } from "@/app/lib/active-learning";

interface LabelPanelProps {
  onHide: () => void;
}

export default function LabelPanel({ onHide }: LabelPanelProps) {
  const uuid = useAtomValue(uuidAtom);
  const [newLabel, setNewLabel] = useState("");
  const [config, setConfig] = useAtom(configAtom);
  const [mediaItems, setMediaItems] = useAtom(mediaItemsAtom);
  const mediaIndices = useAtomValue(currentMediaIndicesAtom);
  const [labelCounts, setLabelCounts] = useState<LabelCount[]>([]);
  const { pushAction, undo, canUndo } = useLabelUndo();
  const { isAvailable, isActive, alState, stop, refit, methodId, setMethodId, mlpLayers, setMlpLayers, classFilter, setClassFilter, sortBy, setSortBy } = useActiveLearning();
  const [alLoading, setAlLoading] = useState(false);

  useEffect(() => {
    fetchLabelCounts(uuid, mediaIndices).then(setLabelCounts);
  }, [mediaIndices, mediaItems, uuid]);

  if (!config) return null;

  const handleAddLabel = () => {
    if (!newLabel || config.labels.includes(newLabel)) return;
    setConfig({ ...config, labels: [...config.labels, newLabel] });
    setNewLabel("");
  };

  const handleSelectAll = (label: string) => {
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
        deleteLabel(uuid, toProcess, label);
        pushAction({ type: "remove", label, mediaIds: toProcess });
      } else {
        saveLabel(uuid, toProcess, label);
        pushAction({ type: "add", label, mediaIds: toProcess });
      }
    }
  };

  const handleFit = async () => {
    setAlLoading(true);
    await refit();
    setAlLoading(false);
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

  const allHaveLabel = (label: string) =>
    mediaItems.every((m) => m.labels?.includes(label));

  const mediaWithLabels = mediaItems.filter((m) => m.labels?.length);
  const totalSelection = labelCounts.reduce((sum, lc) => sum + lc.inCurrentSelection, 0);
  const totalDataset = labelCounts.reduce((sum, lc) => sum + lc.inEntireDataset, 0);

  return (
    <div className="mt-2 w-full rounded-lg border border-gray-200 bg-white p-3">
      {mediaWithLabels.length > 0 && (
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="border border-gray-200 px-3 py-2" />
              <th className="border border-gray-200 px-3 py-2 text-left font-medium text-gray-700">Label</th>
              <th className="border border-gray-200 px-3 py-2 text-left font-medium text-gray-700">In selection</th>
              <th className="border border-gray-200 px-3 py-2 text-left font-medium text-gray-700">In all data</th>
            </tr>
          </thead>
          <tbody>
            {labelCounts.map((lc) => (
              <tr key={lc.label}>
                <td className="w-24 border border-gray-200 py-2 text-center">
                  <button
                    className="rounded-md px-2 py-1 text-xs text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
                    onClick={() => handleSelectAll(lc.label)}
                  >
                    {allHaveLabel(lc.label) ? "Deselect all" : "Select all"}
                  </button>
                </td>
                <td className="border border-gray-200 px-3 py-2">{lc.label}</td>
                <td className="border border-gray-200 px-3 py-2">
                  <div className="flex w-full items-center justify-between">
                    <span>{lc.inCurrentSelection}</span>
                    {lc.inCurrentSelection > 0 && (
                      <div className="flex gap-1">
                        <button className="rounded-md px-2 py-1 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900" onClick={() => handleDownload(true, lc.label)}>
                          <FontAwesomeIcon icon={faDownload} /> Download
                        </button>
                        <button className="rounded-md px-2 py-1 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900" onClick={() => handleSaveAsGrid(true, lc.label)}>
                          <FontAwesomeIcon icon={faTableCells} /> Save as grid
                        </button>
                      </div>
                    )}
                  </div>
                </td>
                <td className="border border-gray-200 px-3 py-2">
                  <div className="flex w-full items-center justify-between">
                    <span>{lc.inEntireDataset}</span>
                    {lc.inEntireDataset > 0 && (
                      <div className="flex gap-1">
                        <button className="rounded-md px-2 py-1 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900" onClick={() => handleDownload(false, lc.label)}>
                          <FontAwesomeIcon icon={faDownload} /> Download
                        </button>
                        <button className="rounded-md px-2 py-1 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900" onClick={() => handleSaveAsGrid(false, lc.label)}>
                          <FontAwesomeIcon icon={faTableCells} /> Save as grid
                        </button>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {labelCounts.length > 1 && (
              <tr>
                <td className="border border-gray-200" />
                <td className="border border-gray-200 px-3 py-2 font-medium">Total</td>
                <td className="border border-gray-200 px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span>{totalSelection}</span>
                    <div className="flex gap-1">
                      <button className="rounded-md px-2 py-1 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900" onClick={() => handleDownload(true)}>
                        <FontAwesomeIcon icon={faDownload} /> Download
                      </button>
                      <button className="rounded-md px-2 py-1 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900" onClick={() => handleSaveAsGrid(true)}>
                        <FontAwesomeIcon icon={faTableCells} /> Save as grid
                      </button>
                    </div>
                  </div>
                </td>
                <td className="border border-gray-200 px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span>{totalDataset}</span>
                    <div className="flex gap-1">
                      <button className="rounded-md px-2 py-1 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900" onClick={() => handleDownload(false)}>
                        <FontAwesomeIcon icon={faDownload} /> Download
                      </button>
                      <button className="rounded-md px-2 py-1 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900" onClick={() => handleSaveAsGrid(false)}>
                        <FontAwesomeIcon icon={faTableCells} /> Save as grid
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
      {/* Active learning */}
      {isAvailable && (
        <div className="mt-3 border-t border-gray-200 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={methodId}
              onChange={(e) => setMethodId(e.target.value)}
              className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 focus:border-gray-400 focus:outline-none"
              title="Active learning method"
            >
              {AL_METHODS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
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
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500">Show</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as ProbeSortBy)}
                className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 focus:border-gray-400 focus:outline-none"
              >
                <option value="confidence">most similar first</option>
                <option value="uncertainty">most uncertain first</option>
              </select>
            </div>
            <button
              onClick={() => handleFit()}
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
          {/* Method description */}
          <div className="mt-1 text-xs text-gray-400">
            {AL_METHODS.find((m) => m.id === methodId)?.description}
          </div>
          {/* Class filter pills */}
          {isActive && alState && alState.labelClasses.length > 1 && (
            <div className="mt-2 flex flex-wrap gap-1">
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
          )}
        </div>
      )}
      {/* Add new label + undo */}
      <div className="mt-3 border-t border-gray-200 pt-3">
        <div className="flex items-center gap-1.5">
          <input
            placeholder="Label name"
            type="text"
            className="flex-grow rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-700 focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAddLabel(); }}
          />
          <button
            className="rounded-md bg-gray-800 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gray-700"
            onClick={handleAddLabel}
          >
            Add label
          </button>
          <button
            className="rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent"
            onClick={undo}
            disabled={!canUndo}
            title="Undo last label action (Ctrl+Z)"
          >
            <FontAwesomeIcon icon={faRotateLeft} />
          </button>
        </div>
      </div>
      {/* Collapse button */}
      <div
        className="-mx-3 -mb-3 mt-3 flex h-6 cursor-pointer items-center justify-center rounded-b-lg bg-gray-100 text-xs text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600"
        onClick={onHide}
      >
        <FontAwesomeIcon icon={faCaretUp} />
      </div>
    </div>
  );
}
