import { faArrowLeft, faArrowRight, faRedo, faUndo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { Media } from "@/app/types";
import { getNextMedia, getPreviousMedia } from "@/app/lib/media-utils";
import BackButton from "../shared/BackButton";

interface HeaderControlsProps {
  mediaIndex: number | undefined;
  mediaItems: Media[];
  onPrevious: () => void;
  onNext: () => void;
  onRotateClockwise: () => void;
  onRotateCounterclockwise: () => void;
  onBack: () => void;
}

export default function HeaderControls({
  mediaIndex, mediaItems, onPrevious, onNext,
  onRotateClockwise, onRotateCounterclockwise, onBack,
}: HeaderControlsProps) {
  const hasPrev = mediaIndex != null && getPreviousMedia(mediaItems, mediaIndex) !== null;
  const hasNext = mediaIndex != null && getNextMedia(mediaItems, mediaIndex) !== null;

  return (
    <div className="flex items-center justify-between py-2">
      <BackButton onClick={onBack} />
      <div className="flex gap-8 text-xs">
        <div className="flex gap-2">
          <button className="hover:text-blue-500" onClick={onRotateCounterclockwise}>
            <FontAwesomeIcon icon={faUndo} />
          </button>
          <button className="hover:text-blue-500" onClick={onRotateClockwise}>
            <FontAwesomeIcon icon={faRedo} />
          </button>
        </div>
        <div className="flex gap-2">
          {hasPrev && (
            <button className="flex items-center hover:text-blue-500" onClick={onPrevious}>
              <span className="mr-1">Previous</span>
              <FontAwesomeIcon icon={faArrowLeft} />
            </button>
          )}
          {hasNext && (
            <button className="flex items-center hover:text-blue-500" onClick={onNext}>
              <FontAwesomeIcon icon={faArrowRight} />
              <span className="ml-1">Next</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
