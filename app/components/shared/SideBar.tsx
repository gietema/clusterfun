"use client";
import { useAtomValue } from "jotai";
import { configAtom, mediaAtom } from "@/app/store/atoms";
import PreviewMedia from "./PreviewMedia";
import InformationItem from "./InformationItem";

export default function SideBar() {
  const media = useAtomValue(mediaAtom);
  const config = useAtomValue(configAtom);

  if (!media || !config) return <div />;

  const info = media.information;
  if (!info) return <div />;

  const entries = Object.entries(info).filter(
    ([key]) => key !== config.bounding_box,
  );

  return (
    <div className="w-full border-l border-gray-200 pl-3">
      <div className="flex w-full flex-col" style={{ maxHeight: "calc(100vh - 35px)" }}>
        <div style={{ maxHeight: "300px" }}>
          <PreviewMedia
            media={media}
            boundingBoxColumn={config.bounding_box}
            displayLabel
          />
        </div>
        <div className="overflow-y-auto" style={{ flexGrow: 1 }}>
          {entries.map(([key, value]) => (
            <InformationItem key={key} label={key} value={value} />
          ))}
        </div>
      </div>
    </div>
  );
}
