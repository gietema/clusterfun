"use client";
import MediaGridItem from "@/app/components/grid/MediaGridItem";
import { Media } from "@/app/plots/models/Media";
import { getMedia } from "@/app/plots/requests/GetMedia";
import { faSquare } from "@fortawesome/free-regular-svg-icons";
import { faBarChart, faTableCells } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import axios from "axios";
import saveAs from "file-saver";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import React, { useEffect, useState } from "react";
import BackButton from "../plots/components/BackButton";
import { Filter } from "../plots/components/Filter";
import SideBar from "../plots/components/SideBar";
import { API_URL } from "../plots/models/Constants";
import { getMediaItems } from "../plots/requests/GetMediaItems";
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

  useEffect(() => {
    if (config === undefined || uuid === undefined) {
      return;
    }
    updateMedia(undefined, undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaIndices]);

  function handleColumnNumber(e: React.ChangeEvent<HTMLInputElement>): void {
    const value = parseInt(e.target.value);
    setGridValues({ ...gridValues, numberOfColumns: value });
  }

  function handleClick(index: number): void {
    if (index != null && uuid != null) {
      getMedia(uuid, index, true).then((media) => {
        setSideMedia(media);
        setShowPage("media");
      });
    }
  }

  function handleHover(index: number): void {
    setMediaIndex(index);
    if (index === undefined) return;
    getMedia(uuid, index, false).then((media) => {
      setSideMedia(media);
    });
  }
  function handleSort(column: string, ascending: boolean): void {
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
  ): void {
    if (mediaIndices === undefined || uuid === undefined) {
      return;
    }
    // get the media if the mediaIndices change
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

  function handleBack(): void {
    if (back !== undefined) {
      back();
    }
  }

  function handleDownloadGrid() {
    axios
      .post(`${API_URL}/views/${uuid}/download-grid`, {
        media_ids: mediaIndicesAll[mediaIndicesAll.length - 1],
      })
      .then((res) => {
        const blob = new Blob([res.data], { type: "text/csv;charset=utf-8" });
        saveAs(blob, "data.csv");
      });
  }

  if (config === undefined || gridValues === undefined) {
    return <></>;
  }

  return (
    <div className="flex">
      <div className="w-3/4">
        <div>
          <div
            className={`grid w-full  grid-cols-1 border-b border-gray-300 pb-0 pe-2 pt-1 text-black lg:grid-cols-6
            lg:rounded-md lg:border lg:pt-0
                  `}
          >
            {config.type !== "grid" && (
              <div className="flex flex-row border-b border-gray-300 lg:border-b-0 lg:border-r">
                <div className="flex flex-row">
                  <div className="border-r pb-1 pe-1 pt-1 flex">
                    <BackButton handleBack={handleBack} />
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
                handleSort={handleSort}
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
                  onChange={(e) => handleColumnNumber(e)}
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
                  handleClick={handleClick}
                  handleHover={handleHover}
                  infoColumns={config.columns}
                  columns={gridValues.numberOfColumns}
                  showColumn={gridValues.showColumnValue}
                  boundingBoxColumn={config.bounding_box}
                  showBboxLabel={gridValues.showBboxLabel}
                  display={config.display}
                />
              );
            })}
          </div>
        </div>
      </div>
      <div className="w-1/4">
        <div
          className="button w-full cursor-pointer border rounded-md mb-2 border-gray-300 bg-gray-100 py-1 text-center text-xs text-gray-900 hover:bg-gray-300 duration-150 ease-in-out transition-all"
          onClick={() => handleDownloadGrid()}
        >
          Download grid as csv
        </div>

        <SideBar />
      </div>
    </div>
  );
}
