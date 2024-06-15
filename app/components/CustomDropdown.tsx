// components/CustomDropdown.tsx
import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faHashtag,
  faWater,
  faToggleOn,
  faBox,
  faList,
  faCalendar,
  faClock,
  faHourglass,
  faArrowsAltH,
} from "@fortawesome/free-solid-svg-icons";

interface Option {
  value: string;
  label: string;
  dtype?: string;
}

interface CustomDropdownProps {
  options: Option[];
  selectedOption: string | undefined;
  handleDropdownChange: (value: string) => void;
}

const getIcon = (dtype?: string) => {
  switch (dtype) {
    case "int64":
      return faHashtag;
    case "float64":
      return faWater;
    case "bool":
      return faToggleOn;
    case "object":
      return faBox;
    case "category":
      return faList;
    case "datetime64[ns]":
      return faCalendar;
    case "timedelta[ns]":
      return faClock;
    case "Period":
      return faHourglass;
    case "Interval":
      return faArrowsAltH;
    case "Sparse[int]":
      return faHashtag; // Use faHashtag as a placeholder
    case "Sparse[float]":
      return faWater; // Use faWater as a placeholder
    case "Sparse[bool]":
      return faToggleOn; // Use faToggleOn as a placeholder
    case "Sparse[object]":
      return faBox; // Use faBox as a placeholder
    default:
      return null;
  }
};

const CustomDropdown: React.FC<CustomDropdownProps> = ({
  options,
  selectedOption,
  handleDropdownChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleSelect = (value: string) => {
    handleDropdownChange(value);
    setIsOpen(false);
  };

  return (
    <div className="relative w-full">
      <div className="w-full">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full bg-white border border-gray-300 text-gray-700 py-2 px-4 rounded leading-tight focus:outline-none focus:ring-blue-500 focus:border-blue-500"
        >
          {selectedOption ? (
            <div className="flex items-center">
              {getIcon(
                options.find((opt) => opt.value === selectedOption)?.dtype,
              ) && (
                // @ts-ignore
                <FontAwesomeIcon
                  icon={getIcon(
                    options.find((opt) => opt.value === selectedOption)?.dtype,
                  )}
                  className="mr-2"
                />
              )}
              {options.find((opt) => opt.value === selectedOption)?.label ||
                selectedOption}
            </div>
          ) : (
            "-"
          )}
        </button>
        {isOpen && (
          <ul className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg">
            {options.map((opt) => (
              <li
                key={opt.value}
                onClick={() => handleSelect(opt.value)}
                className="cursor-pointer px-4 py-2 hover:bg-gray-100 flex items-center"
              >
                {getIcon(opt.dtype) && (
                  // @ts-ignore
                  <FontAwesomeIcon icon={getIcon(opt.dtype)} className="mr-2" />
                )}
                {opt.label}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default CustomDropdown;
