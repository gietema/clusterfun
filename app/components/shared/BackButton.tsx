import { faArrowLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

interface BackButtonProps {
  onClick: () => void;
}

export default function BackButton({ onClick }: BackButtonProps) {
  return (
    <button
      className="flex cursor-pointer items-center gap-1.5 text-xs text-gray-600 transition-colors hover:text-gray-900"
      onClick={onClick}
    >
      <FontAwesomeIcon icon={faArrowLeft} />
      back
    </button>
  );
}
