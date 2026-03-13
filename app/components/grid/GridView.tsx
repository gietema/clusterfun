"use client";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { faSquare } from "@fortawesome/free-regular-svg-icons";
import { faBarChart, faCaretDown, faTableCells } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { saveAs } from "file-saver";
import {
  configAtom, filtersAtom, gridValuesAtom, mediaAtom,
  mediaIndicesAtom, mediaItemsAtom, uuidAtom,
} from "@/app/store/atoms";
import { fetchMediaItems, downloadGridCsv, saveLabel, deleteLabel } from "@/app/lib/api";
import type { Media } from "@/app/types";
import BackButton from "../shared/BackButton";
import SideBar from "../shared/SideBar";
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
  const mediaIndicesAll = useAtomValue(mediaIndicesAtom);
  const mediaIndices = mediaIndicesAll.length > 0
    ? mediaIndicesAll[mediaIndicesAll.length - 1]
    : [];
  const uuid = useAtomValue(uuidAtom);
  const config = useAtomValue(configAtom);
  const filters = useAtomValue(filtersAtom);
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
    fetchMediaItems(uuid, mediaIndices, newPage, gridValues.sortBy || undefined, gridValues.asc, filters)
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

  return (
    <div className="flex">
      <div className="w-3/4">
        {config.title && <div className="mb-2 text-xs font-bold">{config.title}</div>}
        {/* Toolbar */}
        <div className="grid w-full grid-cols-1 border-b border-gray-300 pb-0 pe-2 pt-1 text-black lg:grid-cols-6 lg:rounded-md lg:border lg:pt-0">
          {config.type !== "grid" && (
            <div className="flex items-center border-b border-gray-300 lg:border-b-0 lg:border-r">
              <div className="border-r pb-1 pe-1 pt-1">
                <BackButton onClick={onBack} />
              </div>
              <span className="ms-2 text-xs">{mediaIndices.length} selected</span>
            </div>
          )}
          {config.type === "grid" && !config.bounding_box && <div />}
          <div className="flex border-b border-gray-300 py-2 lg:border-b-0 lg:border-r lg:px-2 lg:py-0">
            <SortDropdown
              columns={config.columns}
              gridValues={gridValues}
              onSort={handleSort}
            />
          </div>
          {config.bounding_box && (
            <BoundingBoxCheckbox
              checked={gridValues.showBboxLabel}
              onChange={(checked) => setGridValues((prev) => ({ ...prev, showBboxLabel: checked }))}
            />
          )}
          <div className="border-b border-gray-300 py-2 lg:flex lg:items-center lg:border-b-0 lg:border-r lg:px-2 lg:py-0">
            <ShowValueDropdown
              columns={config.columns}
              value={gridValues.showColumnValue}
              onChange={(val) => setGridValues((prev) => ({ ...prev, showColumnValue: val || undefined }))}
            />
          </div>
          <div className="flex items-center justify-center border-b border-gray-300 py-2 text-xs lg:border-b-0 lg:border-r lg:px-2 lg:py-0">
            <FontAwesomeIcon icon={faSquare} className="me-1" />
            <input
              type="range"
              className="w-full"
              min={1}
              max={10}
              value={gridValues.numberOfColumns}
              onChange={(e) => setGridValues((prev) => ({ ...prev, numberOfColumns: parseInt(e.target.value) }))}
            />
            <FontAwesomeIcon icon={faTableCells} className="ms-1" />
          </div>
          <div className="flex cursor-pointer justify-end ps-2 text-right">
            <Pagination
              page={gridValues.page}
              maxPage={Math.floor(mediaIndices.length / 50)}
              onPageChange={handlePageChange}
            />
            <button
              onClick={() => setShowStats((s) => !s)}
              className="ms-2 flex items-center hover:text-blue-500"
            >
              <FontAwesomeIcon icon={faBarChart} title="Show stats" />
            </button>
          </div>
        </div>

        {showStats && (
          <div className="border-b">
            <MediaVisualization mediaIndices={mediaIndices} />
          </div>
        )}

        <div className="pt-1"><FilterBar /></div>

        {/* Label panel toggle */}
        <div
          className={`mt-2 w-full bg-gray-300 text-center text-xs ${
            showLabelPanel
              ? "-mb-2 h-3 rounded-t-md"
              : "flex cursor-pointer flex-col justify-center rounded-md py-1 hover:text-gray-500"
          }`}
          onClick={() => setShowLabelPanel((s) => !s)}
        >
          {!showLabelPanel && (
            <div>
              <span className="me-2">Labelling</span>
              <FontAwesomeIcon icon={faCaretDown} className="text-gray-500" />
            </div>
          )}
        </div>
        {showLabelPanel && <LabelPanel onHide={() => setShowLabelPanel(false)} />}

        {/* Media grid */}
        <div
          className="grid gap-4 p-2"
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
                showColumn={gridValues.showColumnValue}
                boundingBoxColumn={config.bounding_box}
                showBboxLabel={gridValues.showBboxLabel}
                display={config.display}
                infoColumns={config.columns}
                onClick={() => handleClick(media.index)}
                onHover={() => handleHover(media.index)}
                onLabelToggle={(label) => handleLabelToggle(media, label)}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="w-1/4">
        <button
          className="mb-2 ms-1 w-full cursor-pointer rounded-md border border-gray-300 bg-gray-100 py-1 text-center text-xs text-gray-900 transition-all duration-150 ease-in-out hover:bg-gray-300"
          onClick={handleDownload}
        >
          Download grid as csv
        </button>
        <SideBar />
      </div>
    </div>
  );
}
