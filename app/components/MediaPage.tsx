import BackButton from "@/app/plots/components/BackButton";
import getImagePlot from "@/app/plots/components/ImagePlot";
import { Config } from "@/app/plots/models/Config";
import { Media } from "@/app/plots/models/Media";
import { useAtomValue } from "jotai";
import SideBar from "../plots/components/SideBar";
import { configAtom, mediaAtom, uuidAtom } from "./Previewer";

interface MediaPageProps {
  mediaIndex?: number;
  useRouterFunction?: boolean;
  back?: () => void;
}

export default function MediaPage({ back }: MediaPageProps): JSX.Element {
  const config = useAtomValue<Config | undefined>(configAtom);
  const media = useAtomValue<Media | undefined>(mediaAtom);
  const uuid = useAtomValue(uuidAtom);
  const scaleFactor = 1;
  const shapes: object[] = [];

  function handleBack(): void {
    if (back !== undefined) {
      back();
    }
  }

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
            })}
        </div>
      </div>
      <div className="w-1/4">
        {config !== undefined && media !== undefined && <SideBar />}
      </div>
    </div>
  );
}
