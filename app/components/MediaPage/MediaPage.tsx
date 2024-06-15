import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { configAtom, mediaAtom, mediaIndexAtom, mediaItemsAtom, uuidAtom } from "../Previewer";
import { BoundingBox } from "@/app/plots/models/BoundingBox";
import { getNextMedia, getPreviousMedia, rotateImage } from "./utils";
import { getMedia } from "@/app/plots/requests/GetMedia";
import { parseBoundingBoxes } from "@/app/plots/components/PreviewMedia";
import HeaderControls from "./HeaderControls";
import PlotlyImagePlot from "@/app/plots/components/PlotlyImagePlot";
import SideBar from "@/app/plots/components/SideBar";
import { colors } from "@/app/plots/models/Colors";

interface MediaPageProps {
  mediaIndex?: number;
  back?: () => void;
}

export default function MediaPage({ mediaIndex, back }: MediaPageProps): JSX.Element {
  const config = useAtomValue(configAtom);
  const media = useAtomValue(mediaAtom);
  const setMediaIndex = useSetAtom(mediaIndexAtom);
  const mediaItems = useAtomValue(mediaItemsAtom);
  const setSideMedia = useSetAtom(mediaAtom);
  const uuid = useAtomValue(uuidAtom);
  const [shapes, setShapes] = useState<object[]>([]);
  const [boundingBoxes, setBoundingBoxes] = useState<BoundingBox[]>([]);
  const [rotatedSrc, setRotatedSrc] = useState<string | null>(null);

  useEffect(() => {
    setRotatedSrc(null);
  }, [mediaIndex]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" && mediaIndex !== undefined) {
        handlePreviousMedia();
      } else if (event.key === "ArrowRight" && mediaIndex !== undefined) {
        handleNextMedia();
      }
    },
    [mediaIndex]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  const handleNextMedia = () => {
    if (mediaIndex !== undefined) {
      const nextMedia = getNextMedia(mediaItems, mediaIndex);
      if (nextMedia) {
        setMediaIndex(nextMedia.index);
        getMedia(uuid, nextMedia.index, true).then((media) => setSideMedia(media));
      }
    }
  };

  const handlePreviousMedia = () => {
    if (mediaIndex !== undefined) {
      const previousMedia = getPreviousMedia(mediaItems, mediaIndex);
      if (previousMedia) {
        setMediaIndex(previousMedia.index);
        getMedia(uuid, previousMedia.index, true).then((media) => setSideMedia(media));
      }
    }
  };

  const handleRotateClockwise = () => {
    if (!media) return;
    rotateImage(rotatedSrc || media.src, 90, (src, width, height) => {
      media.width = width;
      media.height = height;
      setSideMedia(media);
      setRotatedSrc(src);
    });
  };

  const handleRotateCounterclockwise = () => {
    if (!media) return;
    rotateImage(rotatedSrc || media.src, -90, (src, width, height) => {
      media.width = width;
      media.height = height;
      setSideMedia(media);
      setRotatedSrc(src);
    });
  };

  useEffect(() => {
    if (!media || !config || !config.bounding_box) return;
    const boundingBoxColumnIndex = config.columns.indexOf(config.bounding_box);
    if (media.information && boundingBoxColumnIndex !== null) {
      const bboxValue = media.information[boundingBoxColumnIndex - 2];
      if (!bboxValue) return;
      setBoundingBoxes(parseBoundingBoxes(bboxValue));
    }
  }, [media, config]);

  useEffect(() => {
    const imgHeight = media?.height || 1000;
    setShapes(
      boundingBoxes.map((bbox, index) => ({
        type: "rect",
        x0: bbox.xmin,
        y0: imgHeight - bbox.ymin,
        x1: bbox.xmax,
        y1: imgHeight - bbox.ymax,
        line: {
          width: 3,
          color: bbox.color || colors[index % colors.length],
        },
      }))
    );
  }, [boundingBoxes, media]);

  return (
    <div className="flex">
      <div className="w-3/4">
        <HeaderControls
          handleBack={back || (() => {})}
          mediaIndex={mediaIndex}
          mediaItems={mediaItems}
          onPrevious={handlePreviousMedia}
          onNext={handleNextMedia}
          onRotateClockwise={handleRotateClockwise}
          onRotateCounterclockwise={handleRotateCounterclockwise}
        />
        <div className="p-2">
          {media && (
            <div style={{ height: "calc(100vh - 80px)" }}>
              <PlotlyImagePlot
                media={{ ...media, src: rotatedSrc || media.src }}
                scaleFactor={1}
                shapes={shapes}
                boundingBoxes={boundingBoxes}
              />
            </div>
          )}
        </div>
      </div>
      <div className="w-1/4">{config && media && <SideBar />}</div>
    </div>
  );
}
