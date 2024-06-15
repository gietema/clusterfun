import { useEffect } from "react";

import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { Data } from "plotly.js";
import PlotPage from "../plots/components/PlotPage";
import { Config } from "../plots/models/Config";
import { FilterInterface } from "../plots/models/FilterInterface";
import { Media } from "../plots/models/Media";
import { getFilteredPlotData } from "../plots/requests/GetFilteredPlotData";
import { getPlotData } from "../plots/requests/GetPlotData";
import { getUuid } from "../plots/requests/GetUuid";
import Grid, { GridValues } from "./Grid";
import MediaPage from "./MediaPage";

export const dataAtom = atom<Data[] | undefined>(undefined);
export const configAtom = atom<Config | undefined>(undefined);
export const uuidAtom = atom<string>("recent");
export const mediaIndicesAtom = atom<Array<number[]>>([]);
export const filtersAtom = atom<FilterInterface[]>([]);
export const gridValuesAtom = atom<GridValues>({
  sortBy: "",
  asc: true,
  page: 0,
  numberOfColumns: 5,
  showColumnValue: undefined,
  showBboxLabel: false,
});
export const mediaIndexAtom = atom<number | undefined>(undefined);
export const showPageAtom = atom<string>("plot");
export const mediaAtom = atom<Media | undefined>(undefined);
export const mediaItemsAtom = atom<Media[]>([]);

export default function Previewer({
  uuidProp,
}: {
  uuidProp: string;
}): JSX.Element {
  const [uuid, setUuid] = useAtom(uuidAtom);
  const setData = useSetAtom(dataAtom);
  const setConfig = useSetAtom(configAtom);
  const [mediaIndex, setMediaIndex] = useAtom(mediaIndexAtom);
  const [showPage, setShowPage] = useAtom(showPageAtom);
  const [mediaIndices, setMediaIndices] = useAtom(mediaIndicesAtom);
  const [gridValues, setGridValues] = useAtom(gridValuesAtom);
  const filters = useAtomValue(filtersAtom);

  useEffect(() => {
    if (uuidProp === "recent") {
      void getUuid().then((uuid: string) => {
        setUuid(uuid);
      });
    } else {
      setUuid(uuidProp);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uuidProp]);

  useEffect(() => {
    getPlotData(uuid).then(
      ({ config, data }: { config: Config; data: Data[] }) => {
        setData(data);
        setConfig(config);
        if (config.type === "grid") {
          // make sure we show some data on the grid page
          setShowPage("grid");
          getFilteredPlotData(uuid, filters).then((data) => {
            if (data) {
              let indices: number[] = [];
              data.forEach((d) => {
                // d.index is an array of indices that need to be added to indices
                // @ts-ignore
                indices = [...indices, ...d.id];
              });
              setMediaIndices([...mediaIndices, indices]);
            }
          });
        }
      },
    );
  }, [uuid]);

  function handleMediaIndices(newMediaIndices: number[]) {
    // append the new mediaindices the current ones
    setMediaIndices([...mediaIndices, newMediaIndices]);
    setShowPage("grid");
  }

  function renderSwitch(): JSX.Element {
    switch (showPage) {
      case "plot":
        return <PlotPage handleMediaIndices={handleMediaIndices} />;
      case "grid":
        return (
          <Grid
            back={() => {
              setMediaIndices([]);
              // reset the page in gridvalues
              setGridValues((prevValues) => ({ ...prevValues, page: 0 }));
              setShowPage("plot");
            }}
          />
        );
      case "media":
        if (mediaIndex !== undefined) {
          return (
            <MediaPage
              mediaIndex={mediaIndex}
              back={() => {
                setMediaIndex(undefined);
                if (mediaIndices.length > 0) {
                  setShowPage("grid");
                } else {
                  setShowPage("plot");
                }
              }}
            />
          );
        }
        return <div className={"text-black"}>Loading..</div>;
      default:
        return <div className={"text-black"}>Loading..</div>;
    }
  }

  return renderSwitch();
}
