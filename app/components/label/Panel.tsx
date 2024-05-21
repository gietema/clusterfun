import { API_URL } from "@/app/plots/models/Constants";
import { Media } from "@/app/plots/models/Media";
import { deleteLabel, saveLabel } from "@/app/plots/requests/LabelStore";
import axios from "axios";
import { saveAs } from "file-saver";
import { useAtom, useAtomValue } from "jotai";
import { useState } from "react";
import toast from "react-hot-toast";
import { configAtom, mediaItemsAtom, uuidAtom } from "../Previewer";

interface LabelPanelProps {
  labels: string[];
  setLabels: (labels: string[]) => void;
}

type LabelCount = Record<string, number>;

function countItems(media: Media[]): Record<string, number> {
  const count: LabelCount = {};
  media.map((mediaItem) => {
    if (mediaItem.labels === undefined) {
      return;
    }
    mediaItem.labels.map((label) => {
      if (count[label] === undefined) {
        count[label] = 0;
      }
      count[label] += 1;
    });
  });

  return count;
}

export default function LabelPanel(): JSX.Element {
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

  async function saveAsNewGrid(label: string) {
    if (config === undefined) {
      return;
    }

    axios
      .post(`${API_URL}/views/${uuid}/labels/${label}`)
      .then((res) => {
        const location = res.data;
        toast.custom(
          (t) => (
            <div
              className={`bg-white px-6 py-4 shadow-md rounded-md ${
                t.visible ? "animate-enter" : "animate-leave"
              }`}
            >
              Plot saved. Run <br />
              <code>clusterfun {location.split("/").pop()}</code>
              <br />
              to view the plot. <br />
              <button
                className="bg-blue-500 text-white px-2 py-1 rounded-md mt-2"
                onClick={() => toast.dismiss(t.id)}
              >
                Close
              </button>
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

  async function download() {
    // download the labels as a csv
    // get the media items of the currently labeled images
    const mediaItemsWithLabel: Media[] = mediaItems.filter((mediaItem) => {
      if (mediaItem.labels === undefined || mediaItem.labels === null) {
        return false;
      }
      return mediaItem.labels.length > 0;
    });
    // add the labels
    // then download as csv
    if (config === undefined) {
      console.log("config is undefined");
      return;
    }
    axios.post(`${API_URL}/views/${uuid}/labels/download`, {}).then((res) => {
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

  return (
    <div className="w-full p-2 bg-gray-100 border border-t-0 border-gray-300 mb-3 rounded-b-md">
      {config.labels.length > 0 && (
        <div className="text-sm font-bold">Labels</div>
      )}
      {config.labels.map((label) => (
        <div
          key={label}
          className="flex items-center justify-between border-t border-gray-300 pt-1"
        >
          <div className="text-xs">{label}</div>
          <div className="flex">
            <button
              onClick={() => selectAll(label, shouldDeselect(label))}
              className="border border-gray-300 px-1 py-1 text-xs me-1
                hover:bg-gray-300 
              "
            >
              {
                // if all media items have this label, show deselect all
                shouldDeselect(label) ? "Deselect all" : "Select all"
              }
            </button>
            {
              // only show button to save as new grid if there is at least one label for this label selected
              mediaWithLabels.filter((media) => {
                if (media.labels === undefined) {
                  return false;
                }
                return media.labels.includes(label);
              }).length > 0 && (
                <button
                  className="button border px-1 py-1 text-xs
                  hover:bg-gray-300 duration-150 ease-in-out transition-all border-gray-300
                "
                  onClick={() => saveAsNewGrid(label)}
                >
                  Save as new grid
                </button>
              )
            }
            {
              // if there are labels, we should not be able to delete any,
              // because that would mess with the label index and the media items
              mediaWithLabels.length === 0 && (
                <button
                  className="button border p-1 text-xs border-gray-300"
                  onClick={() => handleDeleteLabel(label)}
                >
                  Delete
                </button>
              )
            }
          </div>
        </div>
      ))}
      {mediaWithLabels.length > 0 && (
        <div className="pb-4">
          {/* <span className="text-sm font-bold">Label count</span> <br />
          {Object.entries(countItems(mediaWithLabels)).map(([label, count]) => (
            <div
              key={label}
              className="flex items-center justify-between border-t py-2 border-gray-300"
            >
              <div className="text-xs">{label}</div>
              <div className="text-xs">{count}</div>
            </div>
          ))} */}
          <div className="border-t border-gray-300">
            <button
              className="w-full rounded-md text-xs px-2 py-1 bg-gray-300 my-2 hover:bg-gray-400
                 duration-150 ease-in-out transition-all
              "
              onClick={() => download()}
            >
              Download as csv
            </button>
          </div>
        </div>
      )}
      <div className="mt-2 border-t border-gray-300 py-2">
        <input
          placeholder="Label name"
          type="text"
          className="w-full border rounded-md py-1 ps-2 text-sm"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
        />
        <button
          className="button mt-2 px-2 border py-1 text-xs bg-gray-300 text-start rounded-md
            hover:bg-gray-400 duration-150 ease-in-out transition-all
          "
          onClick={handleAddLabel}
        >
          Add label
        </button>
      </div>
    </div>
  );
}
