import { faArrowLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

export default function BackButton({ handleBack }: { handleBack: () => void }) {
  return (
    <div
      className="flex cursor-pointer items-center text-xs hover:text-blue-500"
      onClick={() => handleBack()}
    >
      <div>
        <FontAwesomeIcon
          icon={faArrowLeft}
          className="pe-1 ps-1 hover:text-blue-500"
        />
        back
      </div>
    </div>
  );
}
