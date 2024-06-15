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
  return data.every(
    (value) =>
      typeof value === "string" || value === null || value === undefined,
  );
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
  const columns = config?.columns;
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedColumnName, setSelectedColumnName] = useState(columns?.[0]);
  const [filters, setFilters] = useAtom(filtersAtom);

  const getColumnData = (columnName: string): any[] => {
    if (columns === undefined || mediaMetadata === undefined) return [];
    let columnIndex = columns.indexOf(columnName);
    return mediaMetadata.map(
      (media: MediaMetadata) => media.information?.[columnIndex - 2],
    );
  };

  function handleHistogramClick(points: any[], columnName: string) {
    const selectedValues = points[0].pointIndices;
    const data = getColumnData(columnName).filter((value, index) =>
      selectedValues.includes(index),
    );
    // get min of data
    const minimum = Math.min(...data);
    const maximum = Math.max(...data);
    const minFilter = {
      column: columnName,
      comparison: ">=",
      values: [String(minimum)],
    };
    const maxFilter = {
      column: columnName,
      comparison: "<=",
      values: [String(maximum)],
    };
    const newFilters = filters.filter((filter) => filter.column !== columnName);
    setFilters([...newFilters, minFilter, maxFilter]);
  }

  function handleBarClick(points: any[], columnName: string) {
    const label = points[0].label;
    const newFilters = filters.filter((filter) => filter.column !== columnName);
    setFilters([
      ...newFilters,
      { column: columnName, comparison: "=", values: [label] },
    ]);
  }

  useEffect(() => {
    if (
      mediaIndices === undefined ||
      mediaMetadata === undefined ||
      mediaMetadata.length === mediaIndices.length
    ) {
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

  const renderPlot = (columnName: string) => {
    const data = getColumnData(columnName);
    if (isCategorical(data)) {
      // Count occurrences for categorical data
      const counts: { [key: string]: number } = {};
      data.forEach((value) => {
        counts[value] = (counts[value] || 0) + 1;
      });

      // Sort counts from highest to lowest
      let sortedEntries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      if (sortedEntries.length > 50) {
        sortedEntries = sortedEntries.slice(0, 50);
      }

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
            title: {
              text: `Top ${sortedEntries.length} ${columnName}`,
              xref: "paper",
            },
            yaxis: {
              automargin: true,
            },
            xaxis: {
              automargin: true,
            },
            font: {
              size: 8,
            },
            margin: {
              l: 20,
              r: 20,
              b: 0,
              t: 30,
              pad: 0,
            },
            height: 300,
          }}
          config={{
            displayModeBar: false,
          }}
          onClick={(event) => {
            handleBarClick(event.points, columnName);
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
              b: 50,
              t: 0,
            },
            height: 200,
          }}
          config={{
            displayModeBar: false,
          }}
          onClick={(event) => {
            handleHistogramClick(event.points, columnName);
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
      <div style={{ width: "100%" }}>{renderPlot(selectedColumnName)}</div>
    </div>
  );
}
