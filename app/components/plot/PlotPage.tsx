"use client";
import { useAtom, useAtomValue } from "jotai";
import { useEffect, useState } from "react";
import { configAtom, dataAtom, mediaAtom } from "@/app/store/atoms";
import { useMediaPreview } from "@/app/lib/use-media-preview";
import PlotlyChart from "./PlotlyChart";
import SideBar from "../shared/SideBar";
import ResizableLayout from "../shared/ResizableLayout";
import FilterBar from "../filters/FilterBar";
import TextSearchBar from "../shared/TextSearchBar";

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
    <div className="h-screen">
      <ResizableLayout sidebar={<SideBar />}>
        {config.title && <div className="px-3 py-2 text-sm font-medium text-gray-900">{config.title}</div>}
        <TextSearchBar />
        <FilterBar />
        <div className="bg-white" style={{ height: "calc(100vh - 80px)" }}>
          <PlotlyChart
            revision={revision}
            onHover={previewMedia}
            onClick={handleMediaClick}
            onSelect={handleMediaSelect}
          />
        </div>
      </ResizableLayout>
    </div>
  );
}
