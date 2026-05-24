"use client";
import { useEffect } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  dataAtom,
  configAtom,
  uuidAtom,
  mediaIndicesStackAtom,
  filtersAtom,
  gridValuesAtom,
  mediaIndexAtom,
  showPageAtom,
  mediaAtom,
  labelFilterAtom,
} from "@/app/store/atoms";
import { fetchUuid, fetchPlotData, fetchFilteredPlotData, fetchMedia, fetchAllLabels } from "@/app/lib/api";
import { useUrlState } from "@/app/lib/use-url-state";
import { useBreadcrumbNav } from "@/app/lib/use-breadcrumb-nav";
import UnifiedToolbar from "./shared/UnifiedToolbar";
import KeyboardShortcutsOverlay from "./shared/KeyboardShortcutsOverlay";
import SlideOverPanel from "./shared/SlideOverPanel";
import CommandPalette from "./shared/CommandPalette";
import GridView from "./grid/GridView";
import LabelRail from "./grid/LabelRail";
import QuickLook from "./grid/QuickLook";
import FirstRunHint from "./shared/FirstRunHint";
import PaneShortcuts from "./shared/PaneShortcuts";
import PaneLayoutSync from "./shared/PaneLayoutSync";
import MediaPage from "./media/MediaPage";
import ProjectsPage from "./projects/ProjectsPage";

interface PreviewerProps {
  uuidProp: string;
}

export default function Previewer({ uuidProp }: PreviewerProps) {
  const [uuid, setUuid] = useAtom(uuidAtom);
  const [data, setData] = useAtom(dataAtom);
  const setConfig = useSetAtom(configAtom);
  const [mediaIndex, setMediaIndex] = useAtom(mediaIndexAtom);
  const [showPage, setShowPage] = useAtom(showPageAtom);
  const mediaIndices = useAtomValue(mediaIndicesStackAtom);
  const filters = useAtomValue(filtersAtom);
  const setSideMedia = useSetAtom(mediaAtom);
  const labelFilter = useAtomValue(labelFilterAtom);

  const {
    popSelection,
    setBaseAndSelection,
    initBase,
  } = useBreadcrumbNav();

  useUrlState();

  useEffect(() => {
    if (uuidProp === "recent") {
      fetchUuid().then(setUuid);
    } else {
      setUuid(uuidProp);
    }
  }, [uuidProp, setUuid]);

  useEffect(() => {
    fetchPlotData(uuid).then(({ config, data: plotData }) => {
      setData(plotData);
      setConfig(config);
      if (showPage === "media" && mediaIndex != null) {
        fetchMedia(uuid, mediaIndex, true).then(setSideMedia);
      }
    });
  }, [uuid]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resolve label filter from URL into media indices
  useEffect(() => {
    if (!labelFilter || !data || !uuid || uuid === "recent") return;
    fetchAllLabels(uuid).then((allLabels) => {
      const ids: number[] = [];
      for (const [mediaId, labels] of Object.entries(allLabels)) {
        if (labels.includes(labelFilter)) ids.push(parseInt(mediaId));
      }
      if (ids.length > 0) {
        setBaseAndSelection([], ids, `Label: ${labelFilter}`);
        setShowPage("grid");
      }
    });
  }, [uuid, data, labelFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Populate media indices when grid is active but stack is empty.
  // Grid is always rendered now, so init whenever the stack is empty.
  useEffect(() => {
    if (showPage === "media" || mediaIndices.length > 0 || !data) return;
    initBase([]);
  }, [showPage, mediaIndices.length, data, filters, uuid]); // eslint-disable-line react-hooks/exhaustive-deps

  if (showPage === "media" && mediaIndex !== undefined) {
    return (
      <MediaPage
        mediaIndex={mediaIndex}
        onBack={() => {
          setMediaIndex(undefined);
          setShowPage("grid");
        }}
      />
    );
  }

  const closeOverlay = () => setShowPage("grid");

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Skip-link — visible only when focused via keyboard, jumps past chrome */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[100] focus:rounded-md focus:bg-teal-700 focus:px-3 focus:py-1.5 focus:text-xs focus:font-medium focus:text-white"
      >
        Skip to grid
      </a>
      <UnifiedToolbar />
      <KeyboardShortcutsOverlay />
      <CommandPalette />
      <QuickLook />
      <FirstRunHint />
      <PaneShortcuts />
      <PaneLayoutSync />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <LabelRail />
        <div id="main" className="min-w-0 flex-1 overflow-hidden">
          <GridView onBack={popSelection} />
        </div>
      </div>

      {/* Overlays — grid stays visible underneath */}
      <SlideOverPanel open={showPage === "projects"} onClose={closeOverlay} title="Projects" width="max-w-xl">
        <ProjectsPage />
      </SlideOverPanel>
      {/* Insights moved to /insights route */}
    </div>
  );
}
