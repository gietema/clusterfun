"use client";
import { useAtomValue } from "jotai";
import { configAtom, mediaAtom } from "@/app/store/atoms";
import PreviewMedia from "./PreviewMedia";
import InformationItem from "./InformationItem";

export default function SideBar() {
  const media = useAtomValue(mediaAtom);
  const config = useAtomValue(configAtom);

  if (!media || !config) return <div />;

  const bboxColumnIndex = config.bounding_box
    ? config.columns.indexOf(config.bounding_box)
    : undefined;

  const infoColumns = config.columns.slice(2);
  const filteredInfo = media.information?.filter((_, index) => {
    return index !== (bboxColumnIndex != null ? bboxColumnIndex - 2 : -1);
  });

  return (
    <div className="ms-1 w-full border-l border-gray-200 px-1 ps-2 lg:ps-0">
      <div className="flex w-full flex-col" style={{ maxHeight: "calc(100vh - 35px)" }}>
        <div style={{ maxHeight: "300px" }}>
          <PreviewMedia
            media={media}
            boundingBoxColumnIndex={bboxColumnIndex}
            displayLabel
          />
        </div>
        <div className="overflow-y-auto ps-2" style={{ flexGrow: 1 }}>
          {filteredInfo?.map((item, index) => (
            <InformationItem
              key={index}
              label={infoColumns[index]}
              value={item}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
