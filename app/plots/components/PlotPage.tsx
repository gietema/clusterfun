import {
  configAtom,
  dataAtom,
  mediaAtom,
  mediaIndexAtom,
  showPageAtom,
  uuidAtom,
} from "@/app/components/Previewer";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { Data } from "plotly.js";
import { useEffect, useState } from "react";
import { getMedia } from "../requests/GetMedia";
import { Filter } from "./FilterContext";
import PlotlyPlot from "./PlotlyPlot";
import SideBar from "./SideBar";

interface PlotPageProps {
  handleMediaIndices: (mediaIndices: number[]) => void;
}

export default function PlotPage({
  handleMediaIndices,
}: PlotPageProps): JSX.Element {
  const [plotData, setPlotData] = useAtom(dataAtom);
  const setShowPage = useSetAtom(showPageAtom);
  const setMediaIndex = useSetAtom(mediaIndexAtom);
  const config = useAtomValue(configAtom);
  const uuid = useAtomValue(uuidAtom);
  const [revision, setRevision] = useState(0);
  const [sideMedia, setSideMedia] = useAtom(mediaAtom);

  useEffect(() => {
    setRevision(revision + 1);
  }, [plotData]);

  useEffect(() => {
    if (
      plotData === undefined ||
      sideMedia !== undefined ||
      plotData.length === 0
    ) {
      return;
    }
    const plotDataIndex = 0;
    const idToShow = 0;
    // @ts-expect-error
    handlePointHover(plotData[plotDataIndex].id[idToShow]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plotData]);

  function handlePointHover(index: number | undefined): void {
    setMediaIndex(index);
    if (index === undefined) return;
    getMedia(uuid, index, false).then((media) => {
      setSideMedia(media);
    });
  }

  function handleFilterData(plotData: Data[]): void {
    setPlotData(plotData);
    setRevision(revision + 1);
  }

  const handleMediaClick = async (index: number | undefined): Promise<void> => {
    if (index != null && uuid != null) {
      getMedia(uuid, index, true).then((media) => {
        setSideMedia(media);
        setShowPage("media");
      });
    }
  };

  const handleMediaSelect = (mediaIndices: number[]): void => {
    if (mediaIndices.length > 0) {
      handleMediaIndices(mediaIndices);
    }
  };

  if (config === undefined) {
    return <div></div>;
  }

  return (
    <div className="flex h-screen">
      <div className="w-3/4">
        <div className="">
          {config.title != null && <div className="">{config.title}</div>}
          {uuid !== null && <Filter />}
          <div className="bg-white" style={{height: "calc(100vh - 80px)"}}>
            <PlotlyPlot
              revision={revision}
              handleHover={handlePointHover}
              handleClick={handleMediaClick}
              handleSelect={handleMediaSelect}
            />
          </div>
        </div>
      </div>
      <div className="w-1/4">
        <SideBar />
      </div>
    </div>
  );
}
