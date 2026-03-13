"use client";
import { useAtom, useAtomValue } from "jotai";
import { useEffect, useState } from "react";
import { configAtom, dataAtom, mediaAtom } from "@/app/store/atoms";
import { useMediaPreview } from "@/app/lib/use-media-preview";
import PlotlyChart from "./PlotlyChart";
import SideBar from "../shared/SideBar";
import FilterBar from "../filters/FilterBar";

interface PlotPageProps {
  onMediaSelect: (indices: number[]) => void;
}

export default function PlotPage({ onMediaSelect }: PlotPageProps) {
  const [plotData, setPlotData] = useAtom(dataAtom);
  const config = useAtomValue(configAtom);
  const [revision, setRevision] = useState(0);
  const [sideMedia] = useAtom(mediaAtom);
  const { openMedia, previewMedia } = useMediaPreview();

  useEffect(() => {
    setRevision((r) => r + 1);
  }, [plotData]);

  useEffect(() => {
    if (!plotData || sideMedia || plotData.length === 0) return;
    const firstId = plotData[0]?.id?.[0];
    if (firstId != null) previewMedia(firstId);
  }, [plotData]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMediaClick = (index: number | undefined) => {
    if (index == null) return;
    openMedia(index);
  };

  const handleMediaSelect = (indices: number[]) => {
    if (indices.length > 0) onMediaSelect(indices);
  };

  if (!config) return <div />;

  return (
    <div className="flex h-screen">
      <div className="w-3/4">
        {config.title && <div>{config.title}</div>}
        <FilterBar />
        <div className="bg-white" style={{ height: "calc(100vh - 80px)" }}>
          <PlotlyChart
            revision={revision}
            onHover={previewMedia}
            onClick={handleMediaClick}
            onSelect={handleMediaSelect}
          />
        </div>
      </div>
      <div className="w-1/4">
        <SideBar />
      </div>
    </div>
  );
}
