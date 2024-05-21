import { faSquare } from "@fortawesome/free-regular-svg-icons";
import { faKeyboard, faSquareCheck } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useAtomValue } from "jotai";
import { configAtom } from "../Previewer";

interface MediaLabelsProps {
  handleLabel: Function;
  mediaLabels: string[];
}

const MediaLabels = ({ handleLabel, mediaLabels }: MediaLabelsProps) => {
  const config = useAtomValue(configAtom);
  const possibleLabels = config?.labels;

  if (possibleLabels === undefined || possibleLabels.length === 0) {
    return <></>;
  }

  return (
    <div>
      <div className="w-full border-b pt-1 text-right text-xs">
        <FontAwesomeIcon icon={faKeyboard} className=" text-gray-300" />
      </div>
      {possibleLabels.map((label, index) => (
        <div key={label} className="flex w-full border-b text-center">
          <label
            className="flex flex-grow cursor-pointer justify-start ps-2"
            onClick={(e) => {
              e.preventDefault();
              // stop other events from firing
              e.stopPropagation();
              handleLabel(index);
            }}
          >
            {mediaLabels.includes(label) ? (
              <small>
                <FontAwesomeIcon
                  icon={faSquareCheck}
                  className="px-2 text-blue-500"
                />
              </small>
            ) : (
              <small>
                <FontAwesomeIcon icon={faSquare} className="px-2" />
              </small>
            )}

            <small className="ps-2">{label}</small>
          </label>
          <div className="flex flex-row justify-center text-xs text-gray-300">
            {index + 1}
          </div>
        </div>
      ))}
    </div>
  );
};

export default MediaLabels;
