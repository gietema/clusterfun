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
  similarityResultsAtom,
  labelFilterAtom,
  textSearchQueryAtom,
} from "@/app/store/atoms";
import { fetchUuid, fetchPlotData, fetchFilteredPlotData, fetchMedia, fetchAllLabels } from "@/app/lib/api";
import { useUrlState } from "@/app/lib/use-url-state";
import TabNavigation from "./shared/TabNavigation";
import PlotPage from "./plot/PlotPage";
import GridView from "./grid/GridView";
import MediaPage from "./media/MediaPage";
import DocsPage from "./docs/DocsPage";
import InsightsPage from "./insights/InsightsPage";
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
  const [mediaIndices, setMediaIndices] = useAtom(mediaIndicesStackAtom);
  const [gridValues, setGridValues] = useAtom(gridValuesAtom);
  const filters = useAtomValue(filtersAtom);
  const setSideMedia = useSetAtom(mediaAtom);
  const setSimilarityResults = useSetAtom(similarityResultsAtom);
  const setTextSearchQuery = useSetAtom(textSearchQueryAtom);
  const [labelFilter, setLabelFilter] = useAtom(labelFilterAtom);

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
      if (config.type === "grid" && showPage === "plot") {
        setShowPage("grid");
      }
      // Deep-link: if URL specified a media index, fetch it
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
        const allIndices = data.flatMap((d) => d.id ?? []);
        setMediaIndices([allIndices, ids]);
        setGridValues((prev) => ({ ...prev, page: 0 }));
        setShowPage("grid");
      }
    });
  }, [uuid, data, labelFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Populate media indices when grid view is shown but stack is empty.
  useEffect(() => {
    if (showPage !== "grid" || mediaIndices.length > 0 || !data) return;

    if (filters.length > 0) {
      fetchFilteredPlotData(uuid, filters).then((filtered) => {
        if (filtered) {
          const indices = filtered.flatMap((d) => d.id ?? []);
          setMediaIndices((prev) => (prev.length > 0 ? prev : [indices]));
        }
      });
    } else {
      const indices = data.flatMap((d) => d.id ?? []);
      if (indices.length > 0) {
        setMediaIndices([indices]);
      }
    }
  }, [showPage, mediaIndices.length, data, filters, uuid]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMediaIndices = (newIndices: number[]) => {
    setMediaIndices((prev) => {
      if (prev.length === 0 && data) {
        // Ensure a base level of all items exists so the user can go back
        const allIndices = data.flatMap((d) => d.id ?? []);
        return [allIndices, newIndices];
      }
      return [...prev, newIndices];
    });
    setGridValues((prev) => ({ ...prev, page: 0 }));
    setShowPage("grid");
  };

  // Pop one level from the indices stack (back from filtered subset).
  // If only one level remains, that's the "all items" level — stay on grid.
  const handleGridBack = () => {
    setMediaIndices((prev) => {
      if (prev.length <= 1) return prev;
      return prev.slice(0, -1);
    });
    setGridValues((prev) => ({ ...prev, page: 0 }));
    setSimilarityResults({});
    setTextSearchQuery("");
    setLabelFilter(null);
  };

  if (showPage === "media" && mediaIndex !== undefined) {
    return (
      <MediaPage
        mediaIndex={mediaIndex}
        onBack={() => {
          setMediaIndex(undefined);
          setShowPage(mediaIndices.length > 0 ? "grid" : "plot");
        }}
      />
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TabNavigation />
      <div className="min-h-0 flex-1 overflow-hidden">
        {showPage === "projects" ? (
          <ProjectsPage />
        ) : showPage === "docs" ? (
          <DocsPage />
        ) : showPage === "insights" ? (
          <InsightsPage />
        ) : showPage === "grid" ? (
          <GridView onBack={handleGridBack} />
        ) : (
          <PlotPage onMediaSelect={handleMediaIndices} />
        )}
      </div>
    </div>
  );
}
