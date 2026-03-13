import { faSquare } from "@fortawesome/free-regular-svg-icons";
import { faKeyboard, faSquareCheck } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useAtomValue } from "jotai";
import { configAtom } from "@/app/store/atoms";

interface MediaLabelsProps {
  mediaLabels: string[];
  onLabelToggle: (label: string) => void;
}

export default function MediaLabels({ mediaLabels, onLabelToggle }: MediaLabelsProps) {
  const config = useAtomValue(configAtom);
  const labels = config?.labels;

  if (!labels?.length) return null;

  return (
    <div>
      <div className="w-full border-b pt-1 text-right text-xs">
        <FontAwesomeIcon icon={faKeyboard} className="text-gray-300" />
      </div>
      {labels.map((label, index) => (
        <div key={label} className="flex w-full border-b text-center">
          <label
            className="flex flex-grow cursor-pointer justify-start ps-2"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onLabelToggle(label);
            }}
          >
            <small>
              <FontAwesomeIcon
                icon={mediaLabels.includes(label) ? faSquareCheck : faSquare}
                className={mediaLabels.includes(label) ? "px-2 text-blue-500" : "px-2"}
              />
            </small>
            <small className="ps-2">{label}</small>
          </label>
          <div className="flex items-center text-xs text-gray-300">{index + 1}</div>
        </div>
      ))}
    </div>
  );
}
