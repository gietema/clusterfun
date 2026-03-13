"use client";
import { useAtom, useAtomValue } from "jotai";
import { useEffect, useState } from "react";
import { faCaretUp, faDownload, faRotateLeft, faTableCells } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { saveAs } from "file-saver";
import toast from "react-hot-toast";
import {
  configAtom, mediaIndicesAtom, mediaItemsAtom, uuidAtom,
} from "@/app/store/atoms";
import {
  fetchLabelCounts, saveLabel, deleteLabel,
  downloadLabelCsv, saveLabelAsGrid,
} from "@/app/lib/api";
import type { LabelCount } from "@/app/types";
import { useLabelUndo } from "@/app/lib/use-label-undo";

interface LabelPanelProps {
  onHide: () => void;
}

export default function LabelPanel({ onHide }: LabelPanelProps) {
  const uuid = useAtomValue(uuidAtom);
  const [newLabel, setNewLabel] = useState("");
  const [config, setConfig] = useAtom(configAtom);
  const [mediaItems, setMediaItems] = useAtom(mediaItemsAtom);
  const mediaIndicesAll = useAtomValue(mediaIndicesAtom);
  const mediaIndices = mediaIndicesAll.length > 0
    ? mediaIndicesAll[mediaIndicesAll.length - 1]
    : [];
  const [labelCounts, setLabelCounts] = useState<LabelCount[]>([]);
  const { pushAction, undo, canUndo } = useLabelUndo();

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
          <div className={`rounded-md bg-gray-300 px-6 py-4 text-black shadow-md ${t.visible ? "animate-enter" : "animate-leave"}`}>
            Plot saved. To view the plot, run<br />
            <div className="my-2">
              <code className="bg-gray-800 p-2 text-white">
                <span className="text-pink-500">clusterfun</span> {location}
              </code>
            </div>
            <div className="flex justify-end">
              <button
                className="mt-2 rounded-md bg-blue-500 px-2 py-1 text-white transition-all hover:bg-blue-600"
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
    <div className="mt-2 w-full rounded-b-md border border-gray-300 bg-gray-100 px-2">
      {mediaWithLabels.length > 0 && (
        <table className="mt-2 w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="border px-4 py-2" />
              <th className="border px-4 py-2">Label</th>
              <th className="border px-4 py-2">Count in selection</th>
              <th className="border px-4 py-2">Count in all data</th>
            </tr>
          </thead>
          <tbody>
            {labelCounts.map((lc) => (
              <tr key={lc.label}>
                <td className="w-24 border py-2 text-center">
                  <button
                    className="rounded px-2 py-1 text-blue-500 hover:text-blue-600"
                    onClick={() => handleSelectAll(lc.label)}
                  >
                    {allHaveLabel(lc.label) ? "Deselect all" : "Select all"}
                  </button>
                </td>
                <td className="border px-4 py-2">{lc.label}</td>
                <td className="border px-4 py-2 text-center">
                  <div className="flex w-full items-center justify-between">
                    <span>{lc.inCurrentSelection}</span>
                    {lc.inCurrentSelection > 0 && (
                      <div className="flex gap-1">
                        <button className="p-2 text-blue-500 hover:text-blue-700" onClick={() => handleDownload(true, lc.label)}>
                          <FontAwesomeIcon icon={faDownload} /> Download
                        </button>
                        <button className="p-2 text-blue-500 hover:text-blue-700" onClick={() => handleSaveAsGrid(true, lc.label)}>
                          <FontAwesomeIcon icon={faTableCells} /> Save as grid
                        </button>
                      </div>
                    )}
                  </div>
                </td>
                <td className="border px-4 py-2 text-center">
                  <div className="flex w-full items-center justify-between">
                    <span>{lc.inEntireDataset}</span>
                    {lc.inEntireDataset > 0 && (
                      <div className="flex gap-1">
                        <button className="p-2 text-blue-500 hover:text-blue-700" onClick={() => handleDownload(false, lc.label)}>
                          <FontAwesomeIcon icon={faDownload} /> Download
                        </button>
                        <button className="p-2 text-blue-500 hover:text-blue-700" onClick={() => handleSaveAsGrid(false, lc.label)}>
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
                <td />
                <td className="border px-4 py-2"><b>Total</b></td>
                <td className="border px-4 py-2 text-center">
                  <div className="flex items-center justify-between">
                    <span>{totalSelection}</span>
                    <div className="flex gap-1">
                      <button className="p-2 text-blue-500 hover:text-blue-700" onClick={() => handleDownload(true)}>
                        <FontAwesomeIcon icon={faDownload} /> Download
                      </button>
                      <button className="p-2 text-blue-500 hover:text-blue-700" onClick={() => handleSaveAsGrid(true)}>
                        <FontAwesomeIcon icon={faTableCells} /> Save as grid
                      </button>
                    </div>
                  </div>
                </td>
                <td className="border px-4 py-2 text-center">
                  <div className="flex items-center justify-between">
                    <span>{totalDataset}</span>
                    <div className="flex gap-1">
                      <button className="p-2 text-blue-500 hover:text-blue-700" onClick={() => handleDownload(false)}>
                        <FontAwesomeIcon icon={faDownload} /> Download
                      </button>
                      <button className="p-2 text-blue-500 hover:text-blue-700" onClick={() => handleSaveAsGrid(false)}>
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
      {/* Add new label + undo */}
      <div className="mt-2 border-t border-gray-300 py-2">
        <div className="flex items-center gap-1">
          <input
            placeholder="Label name"
            type="text"
            className="flex-grow rounded-l-md border px-2 py-1 text-xs"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAddLabel(); }}
          />
          <button
            className="border bg-blue-500 px-2 py-1 text-xs text-white transition-all hover:bg-blue-600"
            onClick={handleAddLabel}
          >
            Add label
          </button>
          <button
            className="rounded-r-md border px-2 py-1 text-xs transition-all disabled:opacity-30 bg-gray-200 hover:bg-gray-300 disabled:hover:bg-gray-200"
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
        className="-me-2 -ms-2 flex h-4 cursor-pointer items-center justify-center rounded-b-md bg-gray-300 text-center text-xs text-gray-500 caret-container"
        onClick={onHide}
      >
        <FontAwesomeIcon icon={faCaretUp} className="caret-icon" />
      </div>
    </div>
  );
}
