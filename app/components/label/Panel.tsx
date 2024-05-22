import { API_URL } from "@/app/plots/models/Constants";
import { deleteLabel, saveLabel } from "@/app/plots/requests/LabelStore";
import {
  faCaretDown,
  faDownload,
  faTableCells,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import axios from "axios";
import { saveAs } from "file-saver";
import { useAtom, useAtomValue } from "jotai";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  configAtom,
  mediaIndicesAtom,
  mediaItemsAtom,
  uuidAtom,
} from "../Previewer";

interface LabelPanelProps {
  labels: string[];
  setLabels: (labels: string[]) => void;
}

interface LabelCount {
  label: string;
  inCurrentSelection: number;
  inEntireDataset: number;
}

const fetchLabelCounts = async (
  mediaIds: number[],
  uuid: string,
): Promise<LabelCount[]> => {
  return axios
    .post(`${API_URL}/views/${uuid}/labels-count`, {
      media_ids: mediaIds,
    })
    .then((res) => {
      console.log(res.data, "COUNT");
      return res.data as LabelCount[];
    });
};

interface LabelPanelProps {
  hideLabel: () => void;
}

export default function LabelPanel({
  hideLabel,
}: LabelPanelProps): JSX.Element {
  const uuid = useAtomValue(uuidAtom);
  const [newLabel, setNewLabel] = useState("");
  const [config, setConfig] = useAtom(configAtom);
  const [mediaItems, setMediaItems] = useAtom(mediaItemsAtom);
  const mediaWithLabels = mediaItems.filter((mediaItem) => {
    if (mediaItem.labels === undefined || mediaItem.labels === null) {
      return false;
    }
    return mediaItem.labels.length > 0;
  });
  let mediaIndicesAll = useAtomValue(mediaIndicesAtom);
  const mediaIndices =
    mediaIndicesAll !== undefined
      ? mediaIndicesAll[mediaIndicesAll.length - 1]
      : [];
  const [labelCounts, setLabelCounts] = useState<LabelCount[]>([]);

  if (config === undefined) {
    return <></>;
  }

  const handleAddLabel = () => {
    if (newLabel === "") {
      return;
    }
    if (config.labels.includes(newLabel)) {
      return;
    }
    setConfig({ ...config, labels: [...config.labels, newLabel] });
    setNewLabel("");
  };

  const handleDeleteLabel = (labelToDelete: string) => {
    setConfig({
      ...config,
      labels: config.labels.filter((label) => label !== labelToDelete),
    });
  };

  async function saveAsNewGrid(currentSelection: boolean, label?: string) {
    if (config === undefined) {
      return;
    }
    let mediaToDownload = currentSelection ? mediaIndices : [];
    axios
      .post(`${API_URL}/views/${uuid}/label-to-grid`, {
        label: {
          title: label === undefined ? "" : label,
        },
        media_indices: {
          media_ids: mediaToDownload,
        },
      })
      .then((res) => {
        const location = res.data.split("/").pop();
        toast.custom(
          (t) => (
            <div
              className={`bg-gray-300 text-black px-6 py-4 shadow-md rounded-md ${
                t.visible ? "animate-enter" : "animate-leave"
              }`}
            >
              Plot saved. To view the plot, run <br />
              <div className="my-2">
                <code className="bg-gray-800 text-white p-2">
                  <span className="text-pink-500">clusterfun</span> {location}
                </code>
              </div>
              <div className="flex justify-end">
                <button
                  className="bg-blue-500 text-white px-2 py-1 rounded-md mt-2
                  hover:bg-blue-600 duration-150 ease-in-out transition-all
                "
                  onClick={() => toast.dismiss(t.id)}
                >
                  Close
                </button>
              </div>
            </div>
          ),
          {
            duration: 10000,
          },
        );
      })
      .catch((e) => {
        console.log(e);
        alert("Could not save labels as new plot");
      });
  }

  async function download(currentSelection: boolean, label?: string) {
    let mediaToDownload = currentSelection ? mediaIndices : [];
    axios
      .post(`${API_URL}/views/${uuid}/label-download`, {
        label: {
          title: label === undefined ? "" : label,
        },
        media_indices: {
          media_ids: mediaToDownload,
        },
      })
      .then((res) => {
        const blob = new Blob([res.data], { type: "text/csv;charset=utf-8" });
        saveAs(blob, `${uuid}_labels.csv`);
      });
  }

  function shouldDeselect(label: string): boolean {
    const allMediaItemsHaveLabel = mediaItems.every((mediaItem) => {
      if (mediaItem.labels === undefined || mediaItem.labels === null) {
        return false;
      }
      return mediaItem.labels.includes(label);
    });
    return allMediaItemsHaveLabel;
  }

  async function selectAll(label: string, deselect: boolean = false) {
    setMediaItems((currentMediaItems) => {
      let toProcess: number[] = []; // Will hold indices to add or delete labels

      const updatedMediaItems = currentMediaItems.map((mediaItem) => {
        // Clone the mediaItem to avoid mutating the state directly
        let updatedMedia = { ...mediaItem };

        // Ensure labels array exists
        updatedMedia.labels = updatedMedia.labels || [];

        if (deselect) {
          // Check if label exists and remove it
          if (updatedMedia.labels.includes(label)) {
            toProcess.push(updatedMedia.index);
            updatedMedia.labels = updatedMedia.labels.filter(
              (l) => l !== label,
            );
          }
        } else {
          // Add label if it doesn't exist
          if (!updatedMedia.labels.includes(label)) {
            toProcess.push(updatedMedia.index);
            updatedMedia.labels = [...updatedMedia.labels, label];
          }
        }
        return updatedMedia;
      });

      // Perform the label addition or deletion operation outside the map
      if (deselect) {
        deleteLabel(uuid, toProcess, label);
      } else {
        saveLabel(uuid, toProcess, label);
      }
      return updatedMediaItems;
    });
  }

  useEffect(() => {
    fetchLabelCounts(mediaIndices, uuid).then((data) => setLabelCounts(data));
  }, [mediaIndices, mediaItems]);

  const totalInCurrentSelection = labelCounts.reduce(
    (total, labelCount) => total + labelCount.inCurrentSelection,
    0,
  );
  const totalInEntireDataset = labelCounts.reduce(
    (total, labelCount) => total + labelCount.inEntireDataset,
    0,
  );

  return (
    <div className="w-full px-2 bg-gray-100 border border-gray-300  mt-2 rounded-b-md">
      {mediaWithLabels.length > 0 && (
        <div className="">
          <table className="text-xs w-full border-collapse mt-2">
            <thead>
              <tr>
                <th className="border px-4 py-2"></th>
                <th className="border px-4 py-2">Label</th>
                <th className="text-xs border px-4 py-2">Count in selection</th>
                <th className="border px-4 py-2">Count in all data</th>
              </tr>
            </thead>
            <tbody>
              {labelCounts.map((labelCount) => (
                <tr key={labelCount.label}>
                  <td className="border py-2 text-center w-24">
                    <button
                      className="px-2 py-1 text-blue-500 rounded hover:text-blue-600"
                      onClick={() =>
                        selectAll(
                          labelCount.label,
                          shouldDeselect(labelCount.label),
                        )
                      }
                    >
                      {shouldDeselect(labelCount.label)
                        ? "Deselect all"
                        : "Select all"}
                    </button>
                  </td>
                  <td className="border px-4 py-2">{labelCount.label}</td>
                  <td className="border px-4 py-2 text-center">
                    <div className="flex flex-end justify-between w-full">
                      <div className="flex justify-center flex-col">
                        {labelCount.inCurrentSelection}
                      </div>
                      <div className="flex gap-1">
                        {labelCount.inCurrentSelection > 0 && (
                          <>
                            <button
                              className="p-2 text-blue-500 hover:text-blue-700"
                              onClick={() => download(true, labelCount.label)}
                            >
                              <FontAwesomeIcon icon={faDownload} />
                              <span className="ms-2">Download</span>
                            </button>
                            <button
                              className="p-2 text-blue-500 hover:text-blue-700"
                              onClick={() =>
                                saveAsNewGrid(true, labelCount.label)
                              }
                            >
                              <FontAwesomeIcon icon={faTableCells} />
                              <span className="ms-2">Save as grid</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="border px-4 py-2 text-center">
                    <div className="flex flex-end justify-between w-full">
                      <div className="flex justify-center flex-col">
                        {labelCount.inEntireDataset}
                      </div>
                      <div className="flex gap-1">
                        {labelCount.inEntireDataset > 0 && (
                          <>
                            <button
                              className="p-2 text-blue-500 hover:text-blue-700"
                              onClick={() => download(false, labelCount.label)}
                            >
                              <FontAwesomeIcon icon={faDownload} />
                              <span className="ms-2">Download</span>
                            </button>
                            <button
                              className="p-2 text-blue-500 hover:text-blue-700"
                              onClick={() =>
                                saveAsNewGrid(false, labelCount.label)
                              }
                            >
                              <FontAwesomeIcon icon={faTableCells} />
                              <span className="ms-2">Save as grid</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
              {labelCounts.length > 1 && (
                <tr>
                  <td></td>
                  <td className="border px-4 py-2 text-left">
                    <b>Total</b>
                  </td>
                  <td className="border px-4 py-2 text-center">
                    <div className="flex justify-between">
                      <div className="flex justify-center flex-col">
                        {totalInCurrentSelection}
                      </div>
                      <div className="flex gap-1">
                        <div className="flex justify-center flex-col">
                          <button
                            className="p-2 text-blue-500 hover:text-blue-700"
                            onClick={() => download(true)}
                          >
                            <FontAwesomeIcon icon={faDownload} />
                            <span className="ms-2">Download</span>
                          </button>
                        </div>
                        <button
                          className="p-2 text-blue-500 hover:text-blue-700"
                          onClick={() => saveAsNewGrid(true)}
                        >
                          <FontAwesomeIcon icon={faTableCells} />
                          <span className="ms-2">Save as grid</span>
                        </button>
                      </div>
                    </div>
                  </td>
                  <td className="border px-4 py-2 text-center">
                    <div className="flex justify-between">
                      <div className="flex justify-center flex-col">
                        {totalInEntireDataset}
                      </div>
                      <div className="flex gap-1">
                        <button
                          className="p-2 text-blue-500 hover:text-blue-700"
                          onClick={() => download(false)}
                        >
                          <FontAwesomeIcon icon={faDownload} />
                          <span className="ms-2">Download</span>
                        </button>
                        <button
                          className="p-2 text-blue-500 hover:text-blue-700"
                          onClick={() => download(false)}
                        >
                          <FontAwesomeIcon icon={faTableCells} />
                          <span className="ms-2">Save as grid</span>
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-2 border-t border-gray-300 py-2">
        <div className="flex items-center ">
          <input
            placeholder="Label name"
            type="text"
            className="border rounded-l-md py-1 px-2 text-xs flex-grow"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
          />
          <button
            className="button px-2 border py-1 text-xs bg-blue-500 rounded-r-md hover:bg-blue-600 text-white duration-150 ease-in-out transition-all"
            onClick={handleAddLabel}
          >
            Add label
          </button>
        </div>
      </div>

      <div
        className="bg-gray-300 text-xs cursor-pointer flex justify-center flex-col -ms-2 h-4 -me-2 text-gray-500 rounded-b-md text-center caret-container"
        onClick={() => {
          hideLabel();
        }}
      >
        <FontAwesomeIcon icon={faCaretDown} className="caret-icon" />
      </div>
    </div>
  );
}
