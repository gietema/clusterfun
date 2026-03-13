"use client";
import type { Media, BoundingBox } from "@/app/types";
import { COLORS } from "@/app/lib/constants";
import dynamic from "next/dynamic";

const Plot = dynamic(() => import("@/app/lib/PlotlyChart"), { ssr: false });

interface PlotlyImagePlotProps {
  media: Media;
  scaleFactor: number;
  shapes?: Record<string, any>[];
  boundingBoxes: BoundingBox[];
}

export default function PlotlyImagePlot({
  media,
  scaleFactor,
  shapes = [],
  boundingBoxes,
}: PlotlyImagePlotProps) {
  const w = (media.width ?? 1000) * scaleFactor;
  const h = (media.height ?? 1000) * scaleFactor;

  return (
    <Plot
      data={[{ x: [0, w], y: [0, h], mode: "markers", marker: { opacity: 0 } }]}
      layout={{
        dragmode: "pan",
        hovermode: "closest",
        yaxis: {
          showgrid: false, showline: false, zeroline: false,
          showticklabels: false, range: [0, h], scaleanchor: "x",
        },
        xaxis: {
          showgrid: false, showline: false, zeroline: false,
          showticklabels: false, range: [0, w],
        },
        images: [{
          x: 0, sizex: w, y: h, sizey: h,
          xref: "x", yref: "y", opacity: 1.0,
          layer: "below", sizing: "stretch", source: media.src,
        }],
        margin: { l: 0, r: 0, b: 0, t: 0, pad: 0 },
        shapes,
        annotations: boundingBoxes.map((bbox, i) => ({
          x: bbox.xmin * scaleFactor,
          y: media.height
            ? media.height - bbox.xmin * scaleFactor
            : 1000 - bbox.xmin * scaleFactor,
          xref: "x", yref: "y",
          text: bbox.label, align: "right",
          showarrow: false, xanchor: "left", yanchor: "top",
          font: { color: "white" },
          bgcolor: COLORS[i % COLORS.length],
          bordercolor: COLORS[i % COLORS.length],
        })),
      }}
      config={{
        modeBarButtonsToRemove: [
          "sendDataToCloud", "autoScale2d",
          "hoverClosestCartesian", "hoverCompareCartesian",
          "lasso2d", "select2d", "toImage",
        ],
        responsive: true,
        scrollZoom: true,
      }}
      useResizeHandler
      style={{ width: "100%", height: "100%" }}
    />
  );
}
