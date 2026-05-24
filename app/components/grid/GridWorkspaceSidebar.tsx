"use client";
import { useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  configAtom, mediaItemsAtom, uuidAtom,
  mediaAtom, showPageAtom, similarityResultsAtom,
  detailMediaIndexAtom, sidebarCollapsedAtom, gridCollapsedAtom,
} from "@/app/store/atoms";
import { fetchSimilar, updateMetadata, addColumn } from "@/app/lib/api";
import { useBreadcrumbNav } from "@/app/lib/use-breadcrumb-nav";
import type { InformationValue } from "@/app/types";
import { getLabelColor } from "@/app/lib/label-colors";
import { saveLabel, deleteLabel } from "@/app/lib/api";
import { useLabelUndo } from "@/app/lib/use-label-undo";
import PreviewMedia from "../shared/PreviewMedia";
import InformationItem from "../shared/InformationItem";
import MediaDetailPanel from "./MediaDetailPanel";
import EmptyState from "../shared/EmptyState";

export default function GridWorkspaceSidebar() {
  const detailIndex = useAtomValue(detailMediaIndexAtom);
  const isDetailMode = detailIndex != null;
  const uuid = useAtomValue(uuidAtom);
  const [config, setConfig] = useAtom(configAtom);
  const [media, setSideMedia] = useAtom(mediaAtom);
  const [mediaItems, setMediaItems] = useAtom(mediaItemsAtom);
  const setShowPage = useSetAtom(showPageAtom);
  const setSimilarityResults = useSetAtom(similarityResultsAtom);
  const setSidebarCollapsed = useSetAtom(sidebarCollapsedAtom);
  const [gridCollapsed, setGridCollapsed] = useAtom(gridCollapsedAtom);
  const { replaceTop } = useBreadcrumbNav();
  const { pushAction } = useLabelUndo();

  const [newColumn, setNewColumn] = useState("");
  const [findSimilarLoading, setFindSimilarLoading] = useState(false);

  if (!config) return null;

  // ── Preview label toggle ──
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
    const labels = media.labels ? [...media.labels] : [];
    if (isRemove) {
      setSideMedia({ ...media, labels: labels.filter((l) => l !== label) });
    } else {
      if (!labels.includes(label)) labels.push(label);
      setSideMedia({ ...media, labels });
    }
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

  // ── Find similar ──
  const handleFindSimilar = async () => {
    if (!media || !config?.embeddings) return;
    setFindSimilarLoading(true);
    try {
      const results = await fetchSimilar(uuid, media.index);
      const ids = results.map((r) => r.media_id);
      const scores: Record<number, number> = {};
      for (const r of results) scores[r.media_id] = r.similarity;
      setSimilarityResults(scores);
      replaceTop(ids, `Similar to #${media.index}`);
      setShowPage("grid");
    } finally {
      setFindSimilarLoading(false);
    }
  };

  // ── Metadata editing ──
  const handleMetadataEdit = (column: string, value: InformationValue) => {
    if (!media) return;
    updateMetadata(uuid, [media.index], column, value).catch(console.error);
    setSideMedia({
      ...media,
      information: { ...media.information, [column]: value },
    });
    setMediaItems((items) =>
      items.map((m) =>
        m.index === media.index
          ? { ...m, information: { ...m.information, [column]: value } }
          : m,
      ),
    );
  };

  const handleMetadataEditAll = (column: string, value: InformationValue) => {
    const ids = mediaItems.map((m) => m.index);
    updateMetadata(uuid, ids, column, value).catch(console.error);
    setMediaItems((items) =>
      items.map((m) => ({
        ...m,
        information: { ...m.information, [column]: value },
      })),
    );
    if (media) {
      setSideMedia({
        ...media,
        information: { ...media.information, [column]: value },
      });
    }
  };

  const handleAddColumn = () => {
    const name = newColumn.trim();
    if (!name || config.columns.includes(name)) return;
    addColumn(uuid, name).catch(console.error);
    setConfig({ ...config, columns: [...config.columns, name] });
    setMediaItems((items) =>
      items.map((m) => ({
        ...m,
        information: { ...m.information, [name]: null },
      })),
    );
    if (media) {
      setSideMedia({
        ...media,
        information: { ...media.information, [name]: null },
      });
    }
    setNewColumn("");
  };

  const info = media?.information;
  const entries = info
    ? Object.entries(info).filter(
        ([key]) => key !== config.bounding_box,
      )
    : [];

  return (
    <div className="flex h-full flex-col overflow-y-auto border-l border-gray-200">
      {/* Pane header — mirrors LabelRail pattern */}
      <div className="flex h-7 shrink-0 items-center justify-between border-b border-gray-100 px-2">
        <button
          onClick={() => {
            // If grid is collapsed, auto-expand it so the user sees something.
            if (gridCollapsed) setGridCollapsed(false);
            setSidebarCollapsed(true);
          }}
          className="flex h-5 w-5 items-center justify-center rounded text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
          title="Hide preview pane"
          aria-label="Hide preview pane"
        >
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
        {/* Pinned indicator removed — click now opens Quick Look instead of pinning */}
      </div>

      {/* Preview / Detail — always-visible content area (no inner collapsible) */}
      <div className="px-3 pb-3 pt-2">
        {isDetailMode ? (
          <MediaDetailPanel />
        ) : null}
        {media ? (
          <div
            key={media.index}
            className={`motion-fade flex flex-col gap-2 ${isDetailMode ? "mt-2 border-t border-gray-100 pt-2" : ""}`}
          >
            {!isDetailMode && (
              <div className="rounded [&_img]:max-h-[200px] [&_img]:w-auto [&_img]:object-contain [&_video]:max-h-[200px] [&_video]:w-auto [&_video]:object-contain">
                <PreviewMedia
                  media={media}
                  boundingBoxColumn={config.bounding_box}
                  displayLabel
                />
              </div>
            )}
            {config.embeddings && (
              <button
                onClick={handleFindSimilar}
                disabled={findSimilarLoading}
                className="w-full rounded-md bg-teal-700 px-3 py-1.5 text-center text-xs font-medium text-white transition-colors hover:bg-teal-800 disabled:opacity-50"
              >
                {findSimilarLoading ? "Searching..." : "Find similar"}
              </button>
            )}
            <div>
              {/* Group columns by source/type for readability */}
              {(() => {
                const isPrediction = (k: string) =>
                  /^(pred(iction)?|score|confidence|prob)/i.test(k) || /_(pred|score|confidence)$/i.test(k);
                const isLabel = (k: string) =>
                  /^(label|class|category|gt|target|y_true|y_pred)$/i.test(k);
                const isImageStat = (k: string) => k.startsWith("img_");
                const groups: Array<{ title: string; items: typeof entries }> = [
                  { title: "Predictions", items: [] },
                  { title: "Labels & ground truth", items: [] },
                  { title: "Image stats", items: [] },
                  { title: "Metadata", items: [] },
                ];
                for (const e of entries) {
                  const k = e[0];
                  if (isPrediction(k)) groups[0].items.push(e);
                  else if (isLabel(k)) groups[1].items.push(e);
                  else if (isImageStat(k)) groups[2].items.push(e);
                  else groups[3].items.push(e);
                }
                return groups
                  .filter((g) => g.items.length > 0)
                  .map((g, gi) => (
                    <div key={g.title} className={gi > 0 ? "mt-2 border-t border-gray-100 pt-2" : ""}>
                      {/* Only show header if more than one group present */}
                      {groups.filter((x) => x.items.length > 0).length > 1 && (
                        <div className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-gray-500">
                          {g.title}
                        </div>
                      )}
                      {g.items.map(([key, value]) => (
                        <InformationItem
                          key={key}
                          label={key}
                          value={value}
                          onEdit={handleMetadataEdit}
                          onEditAll={handleMetadataEditAll}
                        />
                      ))}
                    </div>
                  ));
              })()}
              <div className="mt-2 flex items-center gap-1">
                <input
                  placeholder="New column"
                  type="text"
                  className="min-w-0 flex-grow rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 focus:border-gray-400 focus:outline-none"
                  value={newColumn}
                  onChange={(e) => setNewColumn(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAddColumn(); }}
                />
                <button
                  className="shrink-0 rounded-md bg-teal-700 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-teal-800"
                  onClick={handleAddColumn}
                >
                  Add
                </button>
              </div>
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
          <EmptyState
            illustration="preview"
            title="Nothing selected"
            hint="Hover an item in the grid to preview it here, or click to pin."
          />
        )}
      </div>

    </div>
  );
}
