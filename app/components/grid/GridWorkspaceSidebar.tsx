"use client";
import { useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  configAtom, mediaItemsAtom, uuidAtom,
  mediaAtom, showPageAtom, similarityResultsAtom,
} from "@/app/store/atoms";
import { fetchSimilar, updateMetadata, addColumn } from "@/app/lib/api";
import { useBreadcrumbNav } from "@/app/lib/use-breadcrumb-nav";
import type { InformationValue } from "@/app/types";
import { getLabelColor } from "@/app/lib/label-colors";
import { saveLabel, deleteLabel } from "@/app/lib/api";
import { useLabelUndo } from "@/app/lib/use-label-undo";
import PreviewMedia from "../shared/PreviewMedia";
import InformationItem from "../shared/InformationItem";
import Section from "../shared/Section";
import LabelsSection from "./LabelsSection";
import ActiveLearningSection from "./ActiveLearningSection";

interface GridWorkspaceSidebarProps {
  onReview?: () => void;
}

export default function GridWorkspaceSidebar({ onReview }: GridWorkspaceSidebarProps = {}) {
  const uuid = useAtomValue(uuidAtom);
  const [config, setConfig] = useAtom(configAtom);
  const [media, setSideMedia] = useAtom(mediaAtom);
  const [mediaItems, setMediaItems] = useAtom(mediaItemsAtom);
  const setShowPage = useSetAtom(showPageAtom);
  const setSimilarityResults = useSetAtom(similarityResultsAtom);
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
                <InformationItem
                  key={key}
                  label={key}
                  value={value}
                  onEdit={handleMetadataEdit}
                  onEditAll={handleMetadataEditAll}
                />
              ))}
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
                  className="shrink-0 rounded-md bg-gray-800 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-gray-700"
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
          <p className="text-xs text-gray-400">Hover an item to preview</p>
        )}
      </Section>

      <LabelsSection />
      <ActiveLearningSection onReview={onReview} />
    </div>
  );
}
