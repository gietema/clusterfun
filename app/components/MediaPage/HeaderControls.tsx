import { faArrowLeft, faArrowRight, faRedo, faUndo } from "@fortawesome/free-solid-svg-icons";
import BackButton from "@/app/plots/components/BackButton";
import { Media } from "@/app/plots/models/Media";
import { getNextMedia, getPreviousMedia } from "./utils";
import ButtonWithIcon from "./ButtonWithIcon";

interface HeaderControlsProps {
  mediaIndex: number | undefined;
  mediaItems: Media[];
  onPrevious: () => void;
  onNext: () => void;
  onRotateClockwise: () => void;
  onRotateCounterclockwise: () => void;
  handleBack: () => void;
}

const HeaderControls = ({ mediaIndex, mediaItems, onPrevious, onNext, onRotateClockwise, onRotateCounterclockwise, handleBack }: HeaderControlsProps) => (
  <div className="flex justify-between items-center py-2">
    <BackButton handleBack={handleBack} />
    <div className="text-xs flex gap-8">
      <div className="flex gap-2">
        <ButtonWithIcon icon={faUndo} onClick={onRotateCounterclockwise} />
        <ButtonWithIcon icon={faRedo} onClick={onRotateClockwise} />
      </div>
      <div className="flex gap-2">
        <ButtonWithIcon
          icon={faArrowLeft}
          text="Previous"
          onClick={onPrevious}
          hidden={mediaIndex === undefined || getPreviousMedia(mediaItems, mediaIndex) === null}
          reverse={true}
        />
        <ButtonWithIcon
          icon={faArrowRight}
          text="Next"
          onClick={onNext}
          hidden={mediaIndex === undefined || getNextMedia(mediaItems, mediaIndex) === null}
        />
      </div>
    </div>
  </div>
);

export default HeaderControls;
