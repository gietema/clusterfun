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
    <div className="mt-1 border-t border-gray-200">
      <div className="px-2 py-0.5 text-right text-xs text-gray-300">
        <FontAwesomeIcon icon={faKeyboard} />
      </div>
      {labels.map((label, index) => (
        <div key={label} className="flex w-full items-center px-2 py-1">
          <label
            className="flex flex-grow cursor-pointer items-center gap-1.5"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onLabelToggle(label);
            }}
          >
            <FontAwesomeIcon
              icon={mediaLabels.includes(label) ? faSquareCheck : faSquare}
              className={mediaLabels.includes(label) ? "text-blue-500" : "text-gray-300"}
            />
            <small className="text-xs text-gray-700">{label}</small>
          </label>
          <span className="text-xs text-gray-300">{index + 1}</span>
        </div>
      ))}
    </div>
  );
}
