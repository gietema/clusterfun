import { Media } from "@/app/plots/models/Media";
import dynamic from "next/dynamic";
import { BoundingBox } from "../models/BoundingBox";
import { colors } from "../models/Colors";

export interface ImagePlotProps {
  media: Media;
  scaleFactor: number;
  shapes?: object[];
  boundingBoxes: BoundingBox[];
}

const Plot = dynamic(async () => await import("react-plotly.js"), {
  ssr: false,
});

// eslint-disable-next-line react/display-name,import/no-anonymous-default-export
export default ({
  media,
  scaleFactor,
  shapes,
  boundingBoxes,
}: ImagePlotProps): JSX.Element => (
  <Plot
    data={[
      {
        x: [0, media.width != null ? media.width * scaleFactor : 1000],
        y: [0, media.height != null ? media.height * scaleFactor : 1000],
        mode: "markers",
        marker: {
          opacity: 0,
        },
      },
    ]}
    layout={{
      dragmode: "pan",
      hovermode: "closest",
      yaxis: {
        showgrid: false,
        showline: false,
        zeroline: false,
        showticklabels: false,
        range: [0, media.height != null ? media.height * scaleFactor : 1000],
        scaleanchor: "x",
      },
      xaxis: {
        showgrid: false,
        showline: false,
        zeroline: false,
        showticklabels: false,
        range: [0, media.width != null ? media.width * scaleFactor : 1000],
      },
      images: [
        {
          x: 0,
          sizex: media.width != null ? media.width * scaleFactor : 1000,
          y: media.height != null ? media.height * scaleFactor : 1000,
          sizey: media.height != null ? media.height * scaleFactor : 1000,
          xref: "x",
          yref: "y",
          opacity: 1.0,
          layer: "below",
          sizing: "stretch",
          source: media.src,
        },
      ],
      margin: {
        l: 0,
        r: 0,
        b: 0,
        t: 0,
        pad: 0,
      },
      shapes: shapes != null ? shapes : [],
      annotations:
        boundingBoxes &&
        boundingBoxes.map((boundingBox, index) => {
          return {
            x: boundingBox.xmin * scaleFactor,
            y: media.height
              ? media.height - boundingBox.xmin * scaleFactor
              : 1000 - boundingBox.xmin * scaleFactor,
            xref: "x",
            yref: "y",
            text: boundingBox.label,
            align: "right",
            showarrow: false,
            xanchor: "left",
            yanchor: "top",
            font: {
              color: "white",
            },
            bgcolor: colors[index % colors.length],
            bordercolor: colors[index % colors.length],
          };
        }),
    }}
    config={{
      modeBarButtonsToRemove: [
        "sendDataToCloud",
        "autoScale2d",
        "hoverClosestCartesian",
        "hoverCompareCartesian",
        "lasso2d",
        "select2d",
        "toImage",
      ],
      responsive: true,
      scrollZoom: true,
    }}
    useResizeHandler={true}
    style={{ width: "100%", height: "100%" }}
  />
);
