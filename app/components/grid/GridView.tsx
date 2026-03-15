"use client";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect } from "react";
import { faSquare } from "@fortawesome/free-regular-svg-icons";
import { faBarChart, faTableCells } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  configAtom, gridValuesAtom, mediaAtom,
  currentMediaIndicesAtom, mediaItemsAtom, uuidAtom,
  mediaIndicesStackAtom,
} from "@/app/store/atoms";
import { fetchMediaItems, saveLabel, deleteLabel } from "@/app/lib/api";
import type { Media } from "@/app/types";
// BackButton removed – tabs handle navigation, "← N selected" link handles stack pop
import ResizableLayout from "../shared/ResizableLayout";
import FilterBar from "../filters/FilterBar";
import MediaGridItem, { EXCLUDE_LABEL } from "./MediaGridItem";
import Pagination from "./Pagination";
import SortDropdown from "./SortDropdown";
import ShowValueDropdown from "./ShowValueDropdown";
import BoundingBoxCheckbox from "./BoundingBoxCheckbox";
import MediaVisualization from "./MediaVisualization";
import GridWorkspaceSidebar from "./GridWorkspaceSidebar";
import { useLabelUndo } from "@/app/lib/use-label-undo";
import { useMediaPreview } from "@/app/lib/use-media-preview";
import { useActiveLearning } from "@/app/lib/use-active-learning";
import { useState } from "react";

interface GridViewProps {
  onBack?: () => void;
}

export default function GridView({ onBack }: GridViewProps) {
  const mediaIndices = useAtomValue(currentMediaIndicesAtom);
  const mediaIndicesStack = useAtomValue(mediaIndicesStackAtom);
  const uuid = useAtomValue(uuidAtom);
  const config = useAtomValue(configAtom);
  const setSideMedia = useSetAtom(mediaAtom);
  const [mediaItems, setMediaItems] = useAtom(mediaItemsAtom);
  const [gridValues, setGridValues] = useAtom(gridValuesAtom);
  const [showStats, setShowStats] = useState(false);
  const { pushAction, undo } = useLabelUndo();
  const { openMedia } = useMediaPreview();
  const { isActive } = useActiveLearning();

  const canGoBack = onBack && mediaIndicesStack.length > 1;

  const loadMedia = (sortCol?: string, asc?: boolean) => {
    if (!uuid) return;
    fetchMediaItems(
      uuid,
      mediaIndices,
      gridValues.page,
      sortCol ?? (gridValues.sortBy || undefined),
      asc ?? gridValues.asc,
    ).then(setMediaItems);
  };

  useEffect(() => { loadMedia(); }, [mediaIndices]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        undo();
      } else if (e.key === "Escape" && canGoBack) {
        onBack!();
      }
    },
    [undo, canGoBack, onBack],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const handleClick = (index: number) => {
    openMedia(index);
  };

  const handleHover = (index: number) => {
    const item = mediaItems.find((m) => m.index === index);
    if (item) setSideMedia(item);
  };

  const handleSort = (column: string, ascending: boolean) => {
    if (!config?.columns.includes(column)) return;
    setGridValues((prev) => ({ ...prev, sortBy: column, asc: ascending }));
    loadMedia(column, ascending);
  };

  const handlePageChange = (newPage: number) => {
    setGridValues((prev) => ({ ...prev, page: newPage }));
    fetchMediaItems(uuid, mediaIndices, newPage, gridValues.sortBy || undefined, gridValues.asc)
      .then(setMediaItems);
  };

  const handleLabelToggle = (media: Media, label: string) => {
    const isRemove = media.labels?.includes(label);
    if (isRemove) {
      deleteLabel(uuid, [media.index], label).catch(console.error);
      pushAction({ type: "remove", label, mediaIds: [media.index] });
    } else {
      saveLabel(uuid, [media.index], label).catch(console.error);
      pushAction({ type: "add", label, mediaIds: [media.index] });
    }
    setMediaItems((items) =>
      items.map((m) => {
        if (m.index !== media.index) return m;
        const labels = m.labels ? [...m.labels] : [];
        if (isRemove) {
          return { ...m, labels: labels.filter((l) => l !== label) };
        }
        if (!labels.includes(label)) labels.push(label);
        return { ...m, labels };
      }),
    );
  };

  const handleExclude = (media: Media) => {
    const isAlreadyExcluded = media.labels?.includes(EXCLUDE_LABEL);
    if (isAlreadyExcluded) {
      deleteLabel(uuid, [media.index], EXCLUDE_LABEL).catch(console.error);
      pushAction({ type: "remove", label: EXCLUDE_LABEL, mediaIds: [media.index] });
    } else {
      saveLabel(uuid, [media.index], EXCLUDE_LABEL).catch(console.error);
      pushAction({ type: "add", label: EXCLUDE_LABEL, mediaIds: [media.index] });
    }
    setMediaItems((items) =>
      items.map((m) => {
        if (m.index !== media.index) return m;
        const labels = m.labels ? [...m.labels] : [];
        if (isAlreadyExcluded) {
          return { ...m, labels: labels.filter((l) => l !== EXCLUDE_LABEL) };
        }
        if (!labels.includes(EXCLUDE_LABEL)) labels.push(EXCLUDE_LABEL);
        return { ...m, labels };
      }),
    );
  };

  if (!config) return null;

  return (
    <ResizableLayout sidebar={<GridWorkspaceSidebar />}>
      <div className="flex h-full flex-col">
      {config.title && <div className="mb-2 shrink-0 px-3 pt-2 text-sm font-medium text-gray-900">{config.title}</div>}
      {/* Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-gray-200 px-3 py-2">
        {canGoBack ? (
          <button onClick={onBack!} className="text-xs text-gray-500 hover:text-gray-700">
            ← {mediaIndices.length} selected
          </button>
        ) : (
          <span className="text-xs text-gray-500">{mediaIndices.length} items</span>
        )}
        <SortDropdown
          columns={config.columns}
          gridValues={gridValues}
          onSort={handleSort}
        />
        {config.bounding_box && (
          <BoundingBoxCheckbox
            checked={gridValues.showBboxLabel}
            onChange={(checked) => setGridValues((prev) => ({ ...prev, showBboxLabel: checked }))}
          />
        )}
        <ShowValueDropdown
          columns={config.columns}
          values={gridValues.showColumnValues}
          onChange={(vals) => setGridValues((prev) => ({ ...prev, showColumnValues: vals }))}
        />
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <FontAwesomeIcon icon={faSquare} />
          <input
            type="range"
            className="w-20"
            min={1}
            max={10}
            value={gridValues.numberOfColumns}
            onChange={(e) => setGridValues((prev) => ({ ...prev, numberOfColumns: parseInt(e.target.value) }))}
          />
          <FontAwesomeIcon icon={faTableCells} />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Pagination
            page={gridValues.page}
            maxPage={Math.floor(mediaIndices.length / 50)}
            onPageChange={handlePageChange}
          />
          <button
            onClick={() => setShowStats((s) => !s)}
            className="rounded-md px-2 py-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-900"
          >
            <FontAwesomeIcon icon={faBarChart} title="Show stats" />
          </button>
        </div>
      </div>

      {showStats && (
        <div className="shrink-0 border-b border-gray-200">
          <MediaVisualization mediaIndices={mediaIndices} />
        </div>
      )}

      <div className="shrink-0 px-3 pt-2"><FilterBar /></div>

      {/* Media grid */}
      <div
        className="min-h-0 flex-1 overflow-y-auto p-3"
      >
        <div
          className="grid items-end gap-3"
          style={{
            gridTemplateColumns: `repeat(${gridValues.numberOfColumns}, minmax(0, 1fr))`,
          }}
        >
          {mediaItems.map((media) => (
            <div key={media.index} style={{ contentVisibility: "auto" }}>
              <MediaGridItem
                media={media}
                columns={gridValues.numberOfColumns}
                showColumns={gridValues.showColumnValues}
                boundingBoxColumn={config.bounding_box}
                showBboxLabel={gridValues.showBboxLabel}
                display={config.display}
                onClick={() => handleClick(media.index)}
                onHover={() => handleHover(media.index)}
                onLabelToggle={(label) => handleLabelToggle(media, label)}
                onExclude={isActive ? () => handleExclude(media) : undefined}
              />
            </div>
          ))}
        </div>
      </div>
      </div>
    </ResizableLayout>
  );
}
