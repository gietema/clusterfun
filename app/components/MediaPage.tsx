import BackButton from "@/app/plots/components/BackButton";
import getImagePlot from "@/app/plots/components/ImagePlot";
import { Config } from "@/app/plots/models/Config";
import { Media } from "@/app/plots/models/Media";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { parseBoundingBoxes } from "../plots/components/PreviewMedia";
import SideBar from "../plots/components/SideBar";
import { BoundingBox } from "../plots/models/BoundingBox";
import { colors } from "../plots/models/Colors";
import { configAtom, mediaAtom, mediaIndexAtom, mediaItemsAtom, uuidAtom } from "./Previewer";
import { getMedia } from "../plots/requests/GetMedia";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faArrowRight, faRedo, faUndo } from "@fortawesome/free-solid-svg-icons";
import PlotlyImagePlot from "../plots/components/PlotlyImagePlot";

interface MediaPageProps {
  mediaIndex?: number;
  useRouterFunction?: boolean;
  back?: () => void;
}

export default function MediaPage({ mediaIndex, back }: MediaPageProps): JSX.Element {
  const config = useAtomValue<Config | undefined>(configAtom);
  const media = useAtomValue<Media | undefined>(mediaAtom);
  const setMediaIndex = useSetAtom(mediaIndexAtom);
  const scaleFactor = 1;
  const [shapes, setShapes] = useState<Array<object>>([]);
  const [boundingBoxes, setBoundingBoxes] = useState<BoundingBox[]>([]);
  const mediaItems = useAtomValue<Media[]>(mediaItemsAtom);
  const setSideMedia = useSetAtom(mediaAtom);
  const uuid = useAtomValue(uuidAtom);
  const [rotatedSrc, setRotatedSrc] = useState<string | null>(null);

  useEffect(() => {
    setRotatedSrc(null);
  }, [mediaIndex]);


  function handleBack(): void {
    if (back !== undefined) {
      back();
    }
  }

  function getNextMedia(mediaList: Media[], currentIndex: number): Media | null {
    const currentMediaIndex = mediaList.findIndex(media => media.index === currentIndex);
    if (currentMediaIndex === -1 || currentMediaIndex >= mediaList.length - 1) {
      return null; // No next media, or already at the end of the list
    }
    return mediaList[currentMediaIndex + 1];
  }
  
  function getPreviousMedia(mediaList: Media[], currentIndex: number): Media | null {
    const currentMediaIndex = mediaList.findIndex(media => media.index === currentIndex);
    if (currentMediaIndex <= 0) {
      return null; // No previous media, or already at the start of the list
    }
    return mediaList[currentMediaIndex - 1];
  }

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft"  && mediaIndex !== undefined) {
          handlePreviousMedia();
      } else if (event.key === "ArrowRight" && mediaIndex !== undefined) {
          handleNextMedia();
      }
    },
    [setMediaIndex, mediaIndex]
  );

  function handleNextMedia(): void {
    if (mediaIndex !== undefined) {
      const nextMedia = getNextMedia(mediaItems, mediaIndex);
      if (nextMedia !== null) {
        setMediaIndex(nextMedia.index);
        getMedia(uuid, nextMedia.index, true).then((media: Media) => {
          setSideMedia(media);
        });
      }
    }
  }

  function handlePreviousMedia(): void {
    if (mediaIndex !== undefined) {
      const previousMedia = getPreviousMedia(mediaItems, mediaIndex);
      if (previousMedia !== null) {
        setMediaIndex(previousMedia.index);
        getMedia(uuid, previousMedia.index, true).then((media: Media) => {
          setSideMedia(media);
        });
      }
    }
  }

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

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

  function rotateClockwise() {
    if (media === undefined) return;
    rotateImage(rotatedSrc || media.src, 90);
  }

  function rotateCounterclockwise() {
    if (media === undefined) return;
    rotateImage(rotatedSrc || media.src, -90);
  }

  function rotateImage(base64Image: string, degrees: number) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const image = new Image();

    image.onload = () => {
      if (degrees % 180 === 0) {
        canvas.width = image.width;
        canvas.height = image.height;
      } else {
        canvas.width = image.height;
        canvas.height = image.width;
      }

      if (ctx === null) {
        return;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();

      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((degrees * Math.PI) / 180);
      ctx.drawImage(image, -image.width / 2, -image.height / 2);

      ctx.restore();

      // update the media width and height
      const temp = media;
      if (temp !== undefined) {
        temp.width = canvas.width;
        temp.height = canvas.height;
        setSideMedia(temp);
      }

      setRotatedSrc(canvas.toDataURL());
    };

    image.src = base64Image;
  }

  return (
    <div className="flex">
      <div className="w-3/4">
        <div className="flex justify-between">
          <div className="py-2">
            <BackButton handleBack={handleBack} />
          </div>
          <div className="text-xs flex gap-2">
          <div className="flex justify-center flex-col cursor-pointer hover:text-blue-500" onClick={rotateCounterclockwise}>
              <FontAwesomeIcon icon={faUndo} />
            </div>
            <div className="flex justify-center flex-col cursor-pointer hover:text-blue-500" onClick={rotateClockwise}>
              <FontAwesomeIcon icon={faRedo} />
            </div>
          <div className="flex gap-2 text-xs py-2">
            {
              mediaIndex !== undefined && getPreviousMedia(mediaItems, mediaIndex) !== null && (
                <div className="flex justify-center flex-row cursor-pointer hover:text-blue-500"
                  onClick={handlePreviousMedia}
                >
                  <span className="me-1">
                    <FontAwesomeIcon icon={faArrowLeft} />
                  </span>
                  Previous image
                </div>
              )
            }
            {
              mediaIndex !== undefined && getNextMedia(mediaItems, mediaIndex) !== null && (
                <div className="flex justify-center flex-row cursor-pointer hover:text-blue-500"
                  onClick={handleNextMedia}
                >
                  Next image
                  <span className="ms-1">
                    <FontAwesomeIcon icon={faArrowRight} />
                  </span>
                </div>
              )
            }
          </div>
          </div>
        </div>
        <div className="p-2">
          {media !== undefined && (
            <div style={{ height: "calc(100vh - 80px)" }}>
            <PlotlyImagePlot
              media={{ ...media, src: rotatedSrc || media.src }}
              scaleFactor={scaleFactor}
              shapes={shapes}
              boundingBoxes={boundingBoxes}
            />
          </div>
          )}
        </div>
      </div>
      <div className="w-1/4">
        {config !== undefined && media !== undefined && <SideBar />}
      </div>
    </div>
  );
}
