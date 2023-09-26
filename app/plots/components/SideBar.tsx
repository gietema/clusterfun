import { configAtom, mediaAtom } from "@/app/components/Previewer";
import { useAtomValue } from "jotai";
import { Media } from "../models/Media";
import { InformationItem } from "./InformationItem";
import { PreviewMedia } from "./PreviewMedia";

export default function SideBar(): JSX.Element {
  const media = useAtomValue<Media | undefined>(mediaAtom);
  const config = useAtomValue(configAtom);

  if (media === undefined || config === undefined) return <div></div>;

  return (
    <div className="sidebar text-dark border-s-1 ms-1 w-full border-s border-gray-200 px-1 ps-2 lg:ps-0">
      <div
        className="w-full"
        style={{
          display: "flex",
          flexDirection: "column",
          maxHeight: "calc(100vh - 35px)",
        }}
      >
        <div style={{ maxHeight: "300px" }}>
          <PreviewMedia
            media={media}
            boundingBoxColumnIndex={
              config.bounding_box != null
                ? config.columns.indexOf(config.bounding_box)
                : undefined
            }
            displayLabel={true}
          />
        </div>
        <div className="ps-2" style={{ overflowY: "scroll", flexGrow: 1 }}>
          {media.information
            ?.filter((item, index) => {
              return (
                index !==
                (config.bounding_box != null
                  ? config.columns.indexOf(config.bounding_box)
                  : -1)
              );
            })
            .map((item: any, index: number) => {
              return InformationItem(index, config.columns.slice(2), item);
            })}
        </div>
      </div>
    </div>
  );
}
