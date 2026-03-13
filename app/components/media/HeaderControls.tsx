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
    <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
      <BackButton onClick={onBack} />
      <div className="flex items-center gap-6 text-xs">
        <div className="flex items-center gap-1.5">
          <button className="rounded-md px-2 py-1.5 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900" onClick={onRotateCounterclockwise}>
            <FontAwesomeIcon icon={faUndo} />
          </button>
          <button className="rounded-md px-2 py-1.5 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900" onClick={onRotateClockwise}>
            <FontAwesomeIcon icon={faRedo} />
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          {hasPrev && (
            <button className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900" onClick={onPrevious}>
              <FontAwesomeIcon icon={faArrowLeft} />
              <span>Previous</span>
            </button>
          )}
          {hasNext && (
            <button className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900" onClick={onNext}>
              <span>Next</span>
              <FontAwesomeIcon icon={faArrowRight} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
