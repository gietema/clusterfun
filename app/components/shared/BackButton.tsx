import { faArrowLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

interface BackButtonProps {
  onClick: () => void;
}

export default function BackButton({ onClick }: BackButtonProps) {
  return (
    <button
      className="flex cursor-pointer items-center text-xs hover:text-blue-500"
      onClick={onClick}
    >
      <FontAwesomeIcon icon={faArrowLeft} className="mr-1" />
      back
    </button>
  );
}
