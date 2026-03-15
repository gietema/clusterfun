"use client";
import { useEffect, useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  faDownload, faRotateLeft, faXmark, faArrowRight,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { saveAs } from "file-saver";
import {
  configAtom, currentMediaIndicesAtom, mediaItemsAtom, uuidAtom,
  mediaAtom, labelFilterAtom,
} from "@/app/store/atoms";
import {
  fetchLabelCounts, saveLabel, deleteLabel,
  downloadLabelCsv, fetchAllLabels,
} from "@/app/lib/api";
import { useBreadcrumbNav } from "@/app/lib/use-breadcrumb-nav";
import type { LabelCount } from "@/app/types";
import { getLabelColor } from "@/app/lib/label-colors";
import { useLabelUndo } from "@/app/lib/use-label-undo";
import Section from "../shared/Section";

export default function LabelsSection() {
  const uuid = useAtomValue(uuidAtom);
  const [config, setConfig] = useAtom(configAtom);
  const [media, setSideMedia] = useAtom(mediaAtom);
  const [mediaItems, setMediaItems] = useAtom(mediaItemsAtom);
  const mediaIndices = useAtomValue(currentMediaIndicesAtom);
  const setLabelFilter = useSetAtom(labelFilterAtom);
  const { setBaseAndSelection } = useBreadcrumbNav();

  const [labelCounts, setLabelCounts] = useState<LabelCount[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const { pushAction, undo, redo, canUndo, canRedo } = useLabelUndo();

  useEffect(() => {
    fetchLabelCounts(uuid, mediaIndices).then(setLabelCounts);
  }, [mediaIndices, mediaItems, uuid]);

  if (!config) return null;

  const handleAddLabel = () => {
    if (!newLabel || config.labels.includes(newLabel)) return;
    setConfig({ ...config, labels: [...config.labels, newLabel] });
    setNewLabel("");
  };

  const handleRemoveLabel = (label: string) => {
    setConfig({ ...config, labels: config.labels.filter((l) => l !== label) });
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
    setBaseAndSelection(mediaIndices, ids, `Label: ${label}`);
  };

  const countByLabel = new Map(labelCounts.map((lc) => [lc.label, lc]));
  const totalDataset = labelCounts.reduce((sum, lc) => sum + lc.inEntireDataset, 0);

  return (
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
  );
}
