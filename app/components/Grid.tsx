"use client";
import MediaGridItem from "@/app/components/grid/MediaGridItem";
import { Media } from "@/app/plots/models/Media";
import { getMedia } from "@/app/plots/requests/GetMedia";
import { faSquare } from "@fortawesome/free-regular-svg-icons";
import {
  faBarChart,
  faCaretDown,
  faTableCells,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import axios from "axios";
import saveAs from "file-saver";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import React, { useEffect, useState } from "react";
import BackButton from "../plots/components/BackButton";
import { Filter } from "../plots/components/FilterContext";
import SideBar from "../plots/components/SideBar";
import { API_URL } from "../plots/models/Constants";
import { getMediaItems } from "../plots/requests/GetMediaItems";
import { deleteLabel, saveLabel } from "../plots/requests/LabelStore";
import { MediaVisualization } from "./MediaStats";
import {
  configAtom,
  filtersAtom,
  gridValuesAtom,
  mediaAtom,
  mediaIndexAtom,
  mediaIndicesAtom,
  mediaItemsAtom,
  showPageAtom,
  uuidAtom,
} from "./Previewer";
import BoundingBoxCheckbox from "./grid/BoundingBoxCheck";
import { Pagination } from "./grid/Pagination";
import ShowValueDropdown from "./grid/ShowValueDropdown";
import SortDropdown from "./grid/SortDropDown";
import LabelPanel from "./label/Panel";

export interface GridValues {
  sortBy: string;
  asc: boolean;
  page: number;
  numberOfColumns: number;
  showColumnValue: string | undefined;
  showBboxLabel: boolean;
}

export interface GridProps {
  back: () => void;
}

function handleColumnNumber(
  e: React.ChangeEvent<HTMLInputElement>,
  gridValues: GridValues,
  setGridValues: (value: GridValues) => void,
): void {
  const value = parseInt(e.target.value);
  setGridValues({ ...gridValues, numberOfColumns: value });
}

function handleClick(
  index: number,
  uuid: string | undefined,
  setMediaIndex: (index: number) => void,
  setSideMedia: (media: Media) => void,
  setShowPage: (page: string) => void,
): void {
  if (index != null && uuid != null) {
    setMediaIndex(index);
    getMedia(uuid, index, true).then((media: Media) => {
      setSideMedia(media);
      setShowPage("media");
    });
  }
}

function handleHover(
  index: number,
  uuid: string | undefined,
  setMediaIndex: (index: number) => void,
  setSideMedia: (media: Media) => void,
): void {
  setMediaIndex(index);
  if (index === undefined || uuid === undefined) {
    return;
  }
  getMedia(uuid, index, false).then((media) => {
    setSideMedia(media);
  });
}

function handleSort(
  column: string,
  ascending: boolean,
  config: any,
  gridValues: GridValues,
  setGridValues: (value: GridValues) => void,
  updateMedia: (
    column: string | undefined,
    ascending: boolean | undefined,
  ) => void,
): void {
  if (config === undefined || !config.columns.includes(column)) {
    return;
  }
  setGridValues({
    ...gridValues,
    sortBy: column,
    asc: ascending,
  });
  updateMedia(column, ascending);
}

function updateMedia(
  column: string | undefined,
  ascending: boolean | undefined,
  mediaIndices: number[],
  uuid: string | undefined,
  gridValues: GridValues,
  setMediaItems: (items: Media[]) => void,
): void {
  if (mediaIndices === undefined || uuid === undefined) {
    return;
  }
  getMediaItems(
    uuid,
    mediaIndices,
    gridValues.page,
    column === undefined ? gridValues.sortBy : column,
    ascending === undefined ? gridValues.asc : ascending,
  ).then((media) => {
    setMediaItems(media);
  });
}

function handleBack(back: () => void): void {
  if (back !== undefined) {
    back();
  }
}

function handleDownloadGrid(
  uuid: string | undefined,
  mediaIndicesAll: number[][],
): void {
  axios
    .post(`${API_URL}/views/${uuid}/download-grid`, {
      media_ids: mediaIndicesAll[mediaIndicesAll.length - 1],
    })
    .then((res) => {
      const blob = new Blob([res.data], { type: "text/csv;charset=utf-8" });
      saveAs(blob, "data.csv");
    });
}

function updateMediaForLabel(
  media: Media,
  label: string,
  uuid: string | undefined,
  setMediaItems: (items: (currentMediaItems: Media[]) => Media[]) => void,
): void {
  if (uuid === undefined) {
    return;
  }
  if (media.labels?.includes(label)) {
    deleteLabel(uuid, [media.index], label)
      .then((response: object) => console.log("Label deleted:", response))
      .catch((error: any) => console.error("Error:", error));
  } else {
    saveLabel(uuid, [media.index], label)
      .then((response: object) => {})
      .catch((error: any) => console.error("Error:", error));
  }
  setMediaItems((currentMediaItems) => {
    return currentMediaItems.map((m) => {
      if (m.index === media.index) {
        const updatedMedia = { ...m };
        if (updatedMedia.labels === undefined || updatedMedia.labels === null) {
          updatedMedia.labels = [];
        }
        if (!updatedMedia.labels.includes(label)) {
          updatedMedia.labels.push(label);
        } else {
          updatedMedia.labels = updatedMedia.labels.filter((l) => l !== label);
        }
        return updatedMedia;
      }
      return m;
    });
  });
}

export default function Grid({ back }: GridProps): JSX.Element {
  let mediaIndicesAll = useAtomValue(mediaIndicesAtom);
  const mediaIndices =
    mediaIndicesAll !== undefined
      ? mediaIndicesAll[mediaIndicesAll.length - 1]
      : [];
  const uuid = useAtomValue(uuidAtom);
  const config = useAtomValue(configAtom);
  const filters = useAtomValue(filtersAtom);

  const setSideMedia = useSetAtom(mediaAtom);
  const setMediaIndex = useSetAtom(mediaIndexAtom);
  const setShowPage = useSetAtom(showPageAtom);

  const [mediaItems, setMediaItems] = useAtom(mediaItemsAtom);
  const [showStats, setShowStats] = useState(false);
  const [gridValues, setGridValues] = useAtom(gridValuesAtom);
  const [showLabelPanel, setShowLabelPanel] = useState(false);

  useEffect(() => {
    if (config === undefined || uuid === undefined) {
      return;
    }
    updateMedia(
      undefined,
      undefined,
      mediaIndices,
      uuid,
      gridValues,
      setMediaItems,
    );
  }, [mediaIndices]);

  if (config === undefined || gridValues === undefined) {
    return <></>;
  }

  return (
    <div className="flex">
      <div className="w-3/4">
        <div>
          {config.title && (
            <div className="text-xs font-bold mb-2">{config.title}</div>
          )}
          <div
            className={`grid w-full  grid-cols-1 border-b border-gray-300 pb-0 pe-2 pt-1 text-black lg:grid-cols-6
            lg:rounded-md lg:border lg:pt-0
                  `}
          >
            {config.type !== "grid" && (
              <div className="flex flex-row border-b border-gray-300 lg:border-b-0 lg:border-r">
                <div className="flex flex-row">
                  <div className="border-r pb-1 pe-1 pt-1 flex">
                    <BackButton handleBack={() => handleBack(back)} />
                  </div>
                  <div className="ms-2 flex items-center text-xs">
                    {mediaIndices !== undefined ? mediaIndices.length : 0}{" "}
                    selected
                  </div>
                </div>
              </div>
            )}
            {config.type === "grid" && config.bounding_box === null && (
              <div></div>
            )}
            <div
              id="grid-menu-order"
              className="border-b flex border-gray-300 py-2 lg:border-b-0 lg:border-r lg:px-2 lg:py-0 lg:pe-2
                      
                    "
            >
              <SortDropdown
                columns={config.columns}
                gridValues={gridValues}
                handleSort={(column: string, ascending: boolean) =>
                  handleSort(
                    column,
                    ascending,
                    config,
                    gridValues,
                    setGridValues,
                    (col, asc) =>
                      updateMedia(
                        col,
                        asc,
                        mediaIndices,
                        uuid,
                        gridValues,
                        setMediaItems,
                      ),
                  )
                }
              />
            </div>
            {config.bounding_box != null && (
              <BoundingBoxCheckbox
                gridValues={gridValues}
                setGridValues={setGridValues}
              />
            )}
            <div
              id="grid-menu-show-column"
              className="border-b border-gray-300 py-2 lg:flex lg:items-center lg:border-b-0 lg:border-r lg:px-2 lg:py-0 lg:pe-2"
            >
              <ShowValueDropdown
                columns={config.columns}
                gridValues={gridValues}
                setGridValues={setGridValues}
              />
            </div>
            <div
              id="grid-menu-column-n"
              className="flex flex-row items-center justify-center border-b border-gray-300 py-2 text-xs lg:border-b-0 lg:border-r lg:px-2 lg:py-0"
            >
              <FontAwesomeIcon icon={faSquare} className="me-1" />
              <div className="flex grow items-center justify-center">
                <input
                  type="range"
                  className="w-full"
                  min={1}
                  max={10}
                  value={gridValues.numberOfColumns}
                  onChange={(e) =>
                    handleColumnNumber(e, gridValues, setGridValues)
                  }
                />
              </div>
              <FontAwesomeIcon icon={faTableCells} className="ms-1" />
            </div>
            <div className="flex-column flex cursor-pointer justify-end ps-2 text-right">
              <Pagination
                handlePage={(newPage: number) => {
                  setGridValues({ ...gridValues, page: newPage });
                  getMediaItems(
                    uuid,
                    mediaIndices,
                    newPage,
                    gridValues.sortBy,
                    gridValues.asc,
                    filters,
                  ).then((media) => {
                    setMediaItems(media);
                  });
                }}
                maxPage={
                  mediaIndices !== undefined
                    ? Math.floor(mediaIndices.length / 50)
                    : 0
                }
                page={gridValues.page === undefined ? 0 : gridValues.page}
              />
              <div
                onClick={() => setShowStats(!showStats)}
                className=" ms-2 flex items-center hover:text-blue-500"
              >
                <FontAwesomeIcon icon={faBarChart} title="Show stats" />
              </div>
            </div>
          </div>
          <div>
            {showStats && (
              <div className="border-b">
                <MediaVisualization mediaIndices={mediaIndices} />
              </div>
            )}
          </div>
          <div className="pt-1">
            <Filter />
          </div>
        </div>
        <div>
          <div
            className={`w-full text-center text-xs bg-gray-300 mt-2 ${showLabelPanel ? "-mb-2 h-3 rounded-t-md" : "rounded-md flex justify-center flex-col py-1 cursor-pointer hover:text-gray-500"}`}
            onClick={() => setShowLabelPanel(!showLabelPanel)}
          >
            {showLabelPanel === false && (
              <div>
                <span className="me-2">Labelling</span>
                <FontAwesomeIcon icon={faCaretDown} className="text-gray-500" />
              </div>
            )}
          </div>
          {showLabelPanel && (
            <LabelPanel
              hideLabel={() => {
                setShowLabelPanel(false);
              }}
            />
          )}
        </div>
        <div className="">
          <div
            className={`grid p-2 grid-cols-${
              gridValues.numberOfColumns && gridValues.numberOfColumns
            } gap-4`}
            style={{ maxHeight: "calc(100vh - 80px)", overflowY: "scroll" }}
          >
            {mediaItems.map((media: Media) => {
              return (
                <MediaGridItem
                  media={media}
                  key={media.index}
                  handleClick={(index: number) =>
                    handleClick(
                      index,
                      uuid,
                      setMediaIndex,
                      setSideMedia,
                      setShowPage,
                    )
                  }
                  handleHover={(index: number) =>
                    handleHover(index, uuid, setMediaIndex, setSideMedia)
                  }
                  infoColumns={config.columns}
                  columns={gridValues.numberOfColumns}
                  showColumn={gridValues.showColumnValue}
                  boundingBoxColumn={config.bounding_box}
                  showBboxLabel={gridValues.showBboxLabel}
                  display={config.display}
                  updateLabel={(media, label) =>
                    updateMediaForLabel(media, label, uuid, setMediaItems)
                  }
                />
              );
            })}
          </div>
        </div>
      </div>
      <div className="w-1/4">
        <div
          className="button w-full cursor-pointer border rounded-md ms-1 mb-2 border-gray-300 bg-gray-100 py-1 text-center text-xs text-gray-900 hover:bg-gray-300 duration-150 ease-in-out transition-all"
          onClick={() => handleDownloadGrid(uuid, mediaIndicesAll)}
        >
          Download grid as csv
        </div>

        <SideBar />
      </div>
    </div>
  );
}
