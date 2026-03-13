"use client";
import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faHashtag, faWater, faToggleOn, faBox, faList,
  faCalendar, faClock, faHourglass, faArrowsAltH,
  type IconDefinition,
} from "@fortawesome/free-solid-svg-icons";
import type { DropdownOption } from "@/app/types";

const DTYPE_ICONS: Record<string, IconDefinition> = {
  int64: faHashtag,
  float64: faWater,
  bool: faToggleOn,
  object: faBox,
  category: faList,
  "datetime64[ns]": faCalendar,
  "timedelta[ns]": faClock,
  Period: faHourglass,
  Interval: faArrowsAltH,
};

interface ColumnDropdownProps {
  options: DropdownOption[];
  selected: string | undefined;
  onChange: (value: string) => void;
}

export default function ColumnDropdown({ options, selected, onChange }: ColumnDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);

  const selectedOption = options.find((o) => o.value === selected);
  const icon = selectedOption?.dtype ? DTYPE_ICONS[selectedOption.dtype] : undefined;

  return (
    <div className="relative w-full">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full rounded border border-gray-300 bg-white px-4 py-2 text-left text-gray-700 focus:border-blue-500 focus:outline-none"
      >
        {selected ? (
          <div className="flex items-center">
            {icon && <FontAwesomeIcon icon={icon} className="mr-2" />}
            {selectedOption?.label ?? selected}
          </div>
        ) : (
          "-"
        )}
      </button>
      {isOpen && (
        <ul className="absolute z-10 mt-1 w-full rounded-md border border-gray-300 bg-white shadow-lg">
          {options.map((opt) => {
            const optIcon = opt.dtype ? DTYPE_ICONS[opt.dtype] : undefined;
            return (
              <li
                key={opt.value}
                onClick={() => { onChange(opt.value); setIsOpen(false); }}
                className="flex cursor-pointer items-center px-4 py-2 hover:bg-gray-100"
              >
                {optIcon && <FontAwesomeIcon icon={optIcon} className="mr-2" />}
                {opt.label}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
