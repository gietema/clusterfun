import BackButton from "@/app/plots/components/BackButton";
import getImagePlot from "@/app/plots/components/ImagePlot";
import { Config } from "@/app/plots/models/Config";
import { Media } from "@/app/plots/models/Media";
import { useAtomValue } from "jotai";
import { useEffect, useState } from "react";
import { parseBoundingBoxes } from "../plots/components/PreviewMedia";
import SideBar from "../plots/components/SideBar";
import { BoundingBox } from "../plots/models/BoundingBox";
import { colors } from "../plots/models/Colors";
import { configAtom, mediaAtom } from "./Previewer";

interface MediaPageProps {
  mediaIndex?: number;
  useRouterFunction?: boolean;
  back?: () => void;
}

export default function MediaPage({ back }: MediaPageProps): JSX.Element {
  const config = useAtomValue<Config | undefined>(configAtom);
  const media = useAtomValue<Media | undefined>(mediaAtom);
  const scaleFactor = 1;
  const [shapes, setShapes] = useState<Array<object>>([]);
  const [boundingBoxes, setBoundingBoxes] = useState<BoundingBox[]>([]);

  function handleBack(): void {
    if (back !== undefined) {
      back();
    }
  }

  useEffect(() => {
    if (media === undefined || config === undefined) return;
    if (config.bounding_box == null) return;
    const boundingBoxColumnIndex = config.columns.indexOf(config.bounding_box);
    if (media.information != null && boundingBoxColumnIndex != null) {
      const bboxValue = media.information[boundingBoxColumnIndex - 2];
      if (bboxValue == null) {
        return;
      }
      const newBoundingBoxes = parseBoundingBoxes(bboxValue);
      setBoundingBoxes(newBoundingBoxes);
    }
  }, [media, config]);

  useEffect(() => {
    const imgHeight = media?.height != null ? media.height : 1000;
    let shapes: Array<object> = [];
    if (boundingBoxes.length > 0) {
      boundingBoxes.forEach((bbox, index) => {
        shapes.push({
          type: "rect",
          x0: bbox.xmin * scaleFactor,
          y0: imgHeight - bbox.ymin * scaleFactor,
          x1: bbox.xmax * scaleFactor,
          y1: imgHeight - bbox.ymax * scaleFactor,
          line: {
            width: 3,
            color: bbox.color ? bbox.color : colors[index % colors.length],
          },
        });
      });
    }
    setShapes(shapes);
  }, [boundingBoxes, media]);

  return (
    <div className="flex">
      <div className="w-3/4">
        <BackButton handleBack={handleBack} />
        <div className="p-2">
          {media !== undefined &&
            getImagePlot({
              media,
              scaleFactor,
              shapes,
              boundingBoxes,
            })}
        </div>
      </div>
      <div className="w-1/4">
        {config !== undefined && media !== undefined && <SideBar />}
      </div>
    </div>
  );
}
