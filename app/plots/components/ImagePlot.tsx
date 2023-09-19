import PlotlyImagePlot, {
  ImagePlotProps,
} from "@/app/plots/components/PlotlyImagePlot";
import dynamic from "next/dynamic";

export const DynamicImagePlot = dynamic(import("./PlotlyImagePlot"), {
  ssr: false,
});

export default function getImagePlot({
  media,
  scaleFactor,
  shapes,
  boundingBoxes,
}: ImagePlotProps): JSX.Element {
  return (
    <div style={{ height: "calc(100vh - 80px)" }}>
      <PlotlyImagePlot
        media={media}
        scaleFactor={scaleFactor}
        shapes={shapes}
        boundingBoxes={boundingBoxes}
      />
    </div>
  );
}
