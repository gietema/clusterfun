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
} from "@/app/store/atoms";
import { fetchUuid, fetchPlotData, fetchFilteredPlotData, fetchMedia } from "@/app/lib/api";
import { useUrlState } from "@/app/lib/use-url-state";
import PlotPage from "./plot/PlotPage";
import GridView from "./grid/GridView";
import MediaPage from "./media/MediaPage";

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

  // Populate media indices when grid view is shown but stack is empty.
  // Handles: grid-type configs on initial load, deep-linking to ?view=grid
  // for any config type, and filtered initial loads (e.g. from URL filters).
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
    setMediaIndices((prev) => [...prev, newIndices]);
    setShowPage("grid");
  };

  switch (showPage) {
    case "grid":
      return (
        <GridView
          onBack={() => {
            setMediaIndices([]);
            setGridValues((prev) => ({ ...prev, page: 0 }));
            setSimilarityResults({});
            setShowPage("plot");
          }}
        />
      );
    case "media":
      return mediaIndex !== undefined ? (
        <MediaPage
          mediaIndex={mediaIndex}
          onBack={() => {
            setMediaIndex(undefined);
            setShowPage(mediaIndices.length > 0 ? "grid" : "plot");
          }}
        />
      ) : (
        <div className="text-black">Loading...</div>
      );
    default:
      return <PlotPage onMediaSelect={handleMediaIndices} />;
  }
}
