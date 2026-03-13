"use client";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { faSquare } from "@fortawesome/free-regular-svg-icons";
import { faBarChart, faCaretDown, faTableCells } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { saveAs } from "file-saver";
import {
  configAtom, gridValuesAtom, mediaAtom,
  currentMediaIndicesAtom, mediaItemsAtom, uuidAtom,
} from "@/app/store/atoms";
import { fetchMediaItems, downloadGridCsv, saveLabel, deleteLabel } from "@/app/lib/api";
import type { Media } from "@/app/types";
import BackButton from "../shared/BackButton";
import SideBar from "../shared/SideBar";
import ResizableLayout from "../shared/ResizableLayout";
import FilterBar from "../filters/FilterBar";
import MediaGridItem from "./MediaGridItem";
import Pagination from "./Pagination";
import SortDropdown from "./SortDropdown";
import ShowValueDropdown from "./ShowValueDropdown";
import BoundingBoxCheckbox from "./BoundingBoxCheckbox";
import LabelPanel from "../labels/LabelPanel";
import MediaVisualization from "./MediaVisualization";
import { useLabelUndo } from "@/app/lib/use-label-undo";
import { useMediaPreview } from "@/app/lib/use-media-preview";

interface GridViewProps {
  onBack: () => void;
}

export default function GridView({ onBack }: GridViewProps) {
  const mediaIndices = useAtomValue(currentMediaIndicesAtom);
  const uuid = useAtomValue(uuidAtom);
  const config = useAtomValue(configAtom);
  const setSideMedia = useSetAtom(mediaAtom);
  const [mediaItems, setMediaItems] = useAtom(mediaItemsAtom);
  const [gridValues, setGridValues] = useAtom(gridValuesAtom);
  const [showStats, setShowStats] = useState(false);
  const [showLabelPanel, setShowLabelPanel] = useState(false);
  const { pushAction, undo } = useLabelUndo();
  const { openMedia } = useMediaPreview();

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
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        undo();
      } else if (e.key === "Escape" && config?.type !== "grid") {
        onBack();
      } else if (e.key === "l" && !isInput && !e.metaKey && !e.ctrlKey) {
        setShowLabelPanel((s) => !s);
      }
    },
    [undo, onBack, config?.type],
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

  const handleDownload = () => {
    downloadGridCsv(uuid, mediaIndices).then((blob) => saveAs(blob, "data.csv"));
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

  if (!config) return null;

  const sidebarContent = (
    <div className="pl-2">
      <button
        className="mb-2 w-full cursor-pointer rounded-md bg-gray-800 px-3 py-1.5 text-center text-xs font-medium text-white transition-colors hover:bg-gray-700"
        onClick={handleDownload}
      >
        Download grid as csv
      </button>
      <SideBar />
    </div>
  );

  return (
    <ResizableLayout sidebar={sidebarContent}>
      {config.title && <div className="mb-2 text-sm font-medium text-gray-900">{config.title}</div>}
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 px-3 py-2">
        {config.type !== "grid" && (
          <div className="flex items-center gap-2">
            <BackButton onClick={onBack} />
            <span className="text-xs text-gray-500">{mediaIndices.length} selected</span>
          </div>
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
        <div className="border-b border-gray-200">
          <MediaVisualization mediaIndices={mediaIndices} />
        </div>
      )}

      <div className="px-3 pt-2"><FilterBar /></div>

      {/* Label panel toggle */}
      <div
        className={`mx-3 mt-2 w-auto text-center text-xs ${
          showLabelPanel
            ? "-mb-2 h-3 rounded-t-lg bg-gray-100"
            : "cursor-pointer rounded-md bg-gray-100 py-1.5 text-gray-600 transition-colors hover:bg-gray-200"
        }`}
        onClick={() => setShowLabelPanel((s) => !s)}
      >
        {!showLabelPanel && (
          <div>
            <span className="mr-1.5">Labelling</span>
            <FontAwesomeIcon icon={faCaretDown} className="text-gray-400" />
          </div>
        )}
      </div>
      {showLabelPanel && <div className="mx-3"><LabelPanel onHide={() => setShowLabelPanel(false)} /></div>}

      {/* Media grid */}
      <div
        className="grid items-end gap-3 p-3"
        style={{
          maxHeight: "calc(100vh - 80px)",
          overflowY: "scroll",
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
            />
          </div>
        ))}
      </div>
    </ResizableLayout>
  );
}
