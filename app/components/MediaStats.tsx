import { Media } from "@/app/plots/models/Media";
import axios from "axios";
import { useAtom, useAtomValue } from "jotai";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { API_URL } from "../plots/models/Constants";
import { configAtom, filtersAtom, uuidAtom } from "./Previewer";

const Plot = dynamic(async () => await import("react-plotly.js"), {
  ssr: false,
});

export function isCategorical(data: any[]): boolean {
  return data.every((value) => typeof value === "string");
}

interface Props {
  mediaIndices: number[];
}

class MediaMetadata {
  constructor(
    public index: number,
    public information: any[],
  ) {
    this.index = index;
    this.information = information;
  }
}

export default function MediaStats({
  mediaItems,
  columns,
}: {
  mediaItems: Media[];
  columns: string[];
}) {
  return <div>Stats</div>;
}

export function MediaVisualization({ mediaIndices }: Props) {
  const uuid = useAtomValue(uuidAtom);
  const config = useAtomValue(configAtom);
  const [mediaMetadata, setMediaMetadata] = useState<MediaMetadata[]>([]);
  const columns = config?.columns.filter(
    (columnName) => !["id", "img_path"].includes(columnName),
  );
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedColumnName, setSelectedColumnName] = useState(columns?.[0]);
  const [filters, setFilters] = useAtom(filtersAtom);

  const getColumnData = (columnIndex: number): any[] => {
    return mediaMetadata.map(
      (media: MediaMetadata) => media.information?.[columnIndex],
    );
  };

  function handleHistogramClick(
    points: any[],
    columnName: string,
    columnIndex: number,
  ) {
    const selectedValues = points[0].pointIndices;
    const data = getColumnData(columnIndex).filter((value, index) =>
      selectedValues.includes(index),
    );
    // get min of data
    const minimum = Math.min(...data);
    const maximum = Math.max(...data);
    const minFilter = {
      column: columnName,
      comparison: ">=",
      value: minimum,
    };
    const maxFilter = {
      column: columnName,
      comparison: "<=",
      value: maximum,
    };
    const newFilters = filters.filter((filter) => filter.column !== columnName);
    setFilters([...newFilters, minFilter, maxFilter]);
  }

  function handleBarClick(
    points: any[],
    columnName: string,
    columnIndex: number,
  ) {
    const label = points[0].label;
    const newFilters = filters.filter((filter) => filter.column !== columnName);
    setFilters([
      ...newFilters,
      { column: columnName, comparison: "=", value: label },
    ]);
  }

  useEffect(() => {
    if ((mediaIndices === undefined || mediaMetadata === undefined) || mediaMetadata.length === mediaIndices.length) {
      return;
    }
    // get the metadata for the mediaIndices via axios
    axios
      .post(`${API_URL}/views/${uuid}/media-metadata`, {
        media_ids: mediaIndices,
      })
      .then((response) => {
        const mediaMetadata: MediaMetadata[] = response.data;
        setMediaMetadata(mediaMetadata);
      });
  });

  const renderPlot = (columnIndex: number, columnName: string) => {
    const data = getColumnData(columnIndex);
    if (isCategorical(data)) {
      // Count occurrences for categorical data
      const counts: { [key: string]: number } = {};
      data.forEach((value) => {
        counts[value] = (counts[value] || 0) + 1;
      });

      // Sort counts from highest to lowest
      const sortedEntries = Object.entries(counts).sort((a, b) => b[1] - a[1]);

      return (
        <Plot
          data={[
            {
              type: "bar",
              x: sortedEntries.map((entry) => entry[0]),
              y: sortedEntries.map((entry) => entry[1]),
            },
          ]}
          layout={{
            font: {
              size: 8,
            },
            margin: {
              l: 20,
              r: 20,
              b: 50,
              t: 0,
            },
            height: 150,
          }}
          config={{
            displayModeBar: false,
          }}
          onClick={(event) => {
            handleBarClick(event.points, columnName, columnIndex);
          }}
        />
      );
    } else {
      // Render histogram for numerical data
      return (
        <Plot
          data={[
            {
              type: "histogram",
              x: data,
            },
          ]}
          layout={{
            font: {
              size: 8,
            },
            margin: {
              l: 20,
              r: 0,
              b: 20,
              t: 0,
            },
            height: 150,
          }}
          config={{
            displayModeBar: false,
          }}
          onClick={(event) => {
            handleHistogramClick(event.points, columnName, columnIndex);
          }}
        />
      );
    }
  };

  if (
    config === undefined ||
    selectedColumnName === undefined ||
    mediaMetadata === undefined
  ) {
    return <div>Loading...</div>;
  }

  return mediaMetadata.length === 0 ? (
    <div></div>
  ) : (
    <div>
      {/* Display a select to select the displayed column */}
      <div className="flex">
        <div className="mt-2 rounded-s-md border border-gray-300 bg-gray-100 p-1 pe-2 ps-2 text-xs">
          Show stats for
        </div>
        <select
          className="me-0 mt-2 grow rounded-e-md border border-l-0 border-gray-300 p-1 text-xs text-gray-900"
          onChange={(event) => {
            setSelectedIndex(event.target.selectedIndex);
            setSelectedColumnName(event.target.value);
          }}
          value={selectedColumnName}
        >
          {columns?.map((columnName, index) => (
            <option value={columnName} key={index}>
              {columnName}
            </option>
          ))}
        </select>
      </div>
      <div>{renderPlot(selectedIndex, selectedColumnName)}</div>
    </div>
  );
}
