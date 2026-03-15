import { faArrowLeft, faArrowRight, faPencil, faRedo, faSliders, faUndo } from "@fortawesome/free-solid-svg-icons";
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
  showAdjustments?: boolean;
  onToggleAdjustments?: () => void;
  annotateMode?: boolean;
  onToggleAnnotate?: () => void;
}

export default function HeaderControls({
  mediaIndex, mediaItems, onPrevious, onNext,
  onRotateClockwise, onRotateCounterclockwise, onBack,
  showAdjustments, onToggleAdjustments,
  annotateMode, onToggleAnnotate,
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
          {onToggleAdjustments && (
            <button
              className={`rounded-md px-2 py-1.5 transition-colors ${
                showAdjustments
                  ? "bg-gray-200 text-gray-900"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              }`}
              onClick={onToggleAdjustments}
              title="Image adjustments"
            >
              <FontAwesomeIcon icon={faSliders} />
            </button>
          )}
          {onToggleAnnotate && (
            <button
              className={`rounded-md px-2 py-1.5 transition-colors ${
                annotateMode
                  ? "bg-blue-100 text-blue-700"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              }`}
              onClick={onToggleAnnotate}
              title="Annotate"
            >
              <FontAwesomeIcon icon={faPencil} />
              <span className="ml-1.5">Annotate</span>
            </button>
          )}
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
