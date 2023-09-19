import { uuidAtom } from "@/app/components/Previewer";
import { useAtomValue } from "jotai";
import React, { useEffect, useState } from "react";
import { BoundingBox } from "../models/BoundingBox";
import { colors } from "../models/Colors";
import { Dimension, getContainedSize } from "../models/Dimension";
import { Media } from "../models/Media";

// Simple debounce function
const debounce = (func: () => void, wait: number) => {
  let timeoutId: ReturnType<typeof setTimeout> | null;
  return () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      func();
    }, wait);
  };
};

export function parseBoundingBoxes(unparsedBbox: string): BoundingBox[] {
  const bboxes = JSON.parse(unparsedBbox);
  const newBoundingBoxes: BoundingBox[] = [];
  bboxes.forEach((bbox: BoundingBox) => {
    const xMin = bbox.xmin;
    const yMin = bbox.ymin;
    const xMax = bbox.xmax;
    const yMax = bbox.ymax;
    if (isNaN(xMin) || isNaN(yMin) || isNaN(xMax) || isNaN(yMax)) {
      return;
    }
    newBoundingBoxes.push(
      new BoundingBox(xMin, yMin, xMax, yMax, bbox.color, bbox.label),
    );
  });
  return newBoundingBoxes;
}

interface BboxElements {
  textLabel?: JSX.Element;
  rect: JSX.Element;
  textRectangle: JSX.Element;
}

export function PreviewMedia(props: {
  media: Media | undefined;
  boundingBoxColumnIndex: number | undefined;
  displayLabel: boolean;
  columns?: number;
}): JSX.Element {
  const uuid = useAtomValue(uuidAtom);
  const [boundingBoxes, setBoundingBoxes] = useState<BoundingBox[]>([]);
  const [dims, setDims] = useState<Dimension>({
    width: 0,
    height: 0,
    naturalWidth: 0,
    naturalHeight: 0,
  });
  const [bboxElement, setBboxElement] = useState<JSX.Element[]>([]);
  const imageRef = React.useRef(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const containerRef = React.useRef(null);

  const recomputeDimsAndBoxes = () => {
    if (imageRef.current) {
      trySetDims(imageRef.current);
    }
    if (containerRef.current) {
      // @ts-expect-error
      setContainerWidth(containerRef.current.offsetWidth);
    }
  };

  const debouncedRecompute = debounce(recomputeDimsAndBoxes, 300);

  // Measure the container's width on mount
  useEffect(() => {
    recomputeDimsAndBoxes();
  }, []); // Empty dependency array to ensure it only runs on mount

  // Add an effect to listen for window resize
  useEffect(() => {
    window.addEventListener("resize", debouncedRecompute);
    return () => {
      window.removeEventListener("resize", debouncedRecompute);
    };
  }, []); // Empty dependency array to ensure it only runs on mount and unmount

  useEffect(() => {
    if (props.media === undefined) return;
    if (
      props.media.information != null &&
      props.boundingBoxColumnIndex != null
    ) {
      const bboxValue =
        props.media.information[props.boundingBoxColumnIndex - 2];
      if (bboxValue == null) {
        return;
      }
      const newBoundingBoxes = parseBoundingBoxes(bboxValue);
      setBoundingBoxes(newBoundingBoxes);
    }
  }, [props.media, props.boundingBoxColumnIndex]);

  function trySetDims(image: HTMLImageElement) {
    const img = imageRef.current;
    // @ts-expect-error
    let width = img.offsetWidth;
    // @ts-expect-error
    let height = img.offsetHeight;
    // image dimension is set by object fit, so need to calculate specifically here.
    // if (props.columns === 1) {
    const size = getContainedSize(image);
    width = size.width;
    height = size.height;
    // }
    setDims({
      height: isNaN(height) ? 0 : height,
      // @ts-expect-error
      naturalWidth: isNaN(img.naturalWidth) ? 0 : img.naturalWidth,
      // @ts-expect-error
      naturalHeight: isNaN(img.naturalHeight) ? 0 : img.naturalHeight,
      width: isNaN(width) ? 0 : width,
    });
  }

  React.useEffect(() => {
    // When the image is now loaded, we want to compute the size of the image, required for
    // making our bounding box sizes responsive
    if (imageRef.current) {
      trySetDims(imageRef.current);
    }
  }, [props.media, props.columns, props.displayLabel]);

  useEffect(() => {
    // when these dimensions are set, we can add our actual svg rect bounding boxes.
    loadBoundingBoxes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dims]);

  function getRect(index: number, bbox: BoundingBox): JSX.Element {
    return (
      <rect
        key={index}
        x={(bbox.xmin / dims.naturalWidth) * dims.width}
        y={(bbox.ymin / dims.naturalHeight) * dims.height}
        width={((bbox.xmax - bbox.xmin) / dims.naturalWidth) * dims.width}
        height={((bbox.ymax - bbox.ymin) / dims.naturalHeight) * dims.height}
        stroke={bbox.color != null ? bbox.color : colors[index % colors.length]}
        strokeWidth="3"
        fill="none"
      />
    );
  }

  function getTextRectangle(bbox: BoundingBox, index: number): JSX.Element {
    return (
      <rect
        x={(bbox.xmin / dims.naturalWidth) * dims.width}
        y={(bbox.ymin / dims.naturalHeight) * dims.height}
        width={((bbox.xmax - bbox.xmin) / dims.naturalWidth) * dims.width}
        height={12}
        fill={bbox.color != null ? bbox.color : colors[index % colors.length]}
      />
    );
  }

  function getTextLabel(bbox: BoundingBox): JSX.Element {
    return (
      <text
        x={(bbox.xmin / dims.naturalWidth) * dims.width + 2}
        y={(bbox.ymin / dims.naturalHeight) * dims.height + 10}
        fill="white"
        className="small"
      >
        {bbox.label}
      </text>
    );
  }

  function getBboxElements(index: number, bbox: BoundingBox): BboxElements {
    let textLabel: JSX.Element | undefined;
    const rect: JSX.Element = getRect(index, bbox);
    const textRectangle: JSX.Element = getTextRectangle(bbox, index);
    if (bbox.label != null && props.displayLabel) {
      textLabel = getTextLabel(bbox);
    }
    return { textLabel, rect, textRectangle };
  }

  const loadBoundingBoxes = (): JSX.Element | undefined => {
    if (
      isNaN(dims.width) ||
      isNaN(dims.height) ||
      isNaN(dims.naturalWidth) ||
      isNaN(dims.naturalHeight)
    ) {
      return;
    }
    if (
      dims.width === 0 ||
      dims.height === 0 ||
      dims.naturalHeight === 0 ||
      dims.naturalWidth === 0
    ) {
      return;
    }
    const bboxElement: JSX.Element[] = boundingBoxes.map(
      (bbox, index: number) => {
        const { textLabel, rect, textRectangle } = getBboxElements(index, bbox);
        return (
          <React.Fragment key={index}>
            {rect}
            {textLabel != null ? textRectangle : ""}
            {textLabel != null ? textLabel : ""}
          </React.Fragment>
        );
      },
    );
    setBboxElement(bboxElement);
  };

  useEffect(() => {
    const handleResize = () => {
      if (imageRef.current === null) return;
      trySetDims(imageRef.current);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  if (props.media === undefined) return <></>;

  return (
    <div className={"image--preview"} ref={containerRef}>
      <img
        src={props.media.src}
        ref={imageRef}
        className={"sidebar-image"}
        style={{ objectFit: "contain", width: "100%" }}
      />
      <div
        style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
        className="flex justify-center items-center"
      >
        <svg className={"sidebar-svg"} width={dims.width} height={dims.height}>
          {bboxElement}
        </svg>
      </div>
      {props.boundingBoxColumnIndex == null &&
        props.boundingBoxColumnIndex !== undefined && (
          <svg
            className={"sidebar-svg"}
            width={dims.width}
            height={dims.height}
          >
            {bboxElement}
          </svg>
        )}
    </div>
  );
}
