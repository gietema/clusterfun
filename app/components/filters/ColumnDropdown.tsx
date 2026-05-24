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
        className="w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-left text-xs text-gray-700 focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400"
      >
        {selected ? (
          <div className="flex items-center">
            {icon && <FontAwesomeIcon icon={icon} className="mr-2 text-gray-500" />}
            {selectedOption?.label ?? selected}
          </div>
        ) : (
          <span className="text-gray-500">-</span>
        )}
      </button>
      {isOpen && (
        <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {options.map((opt) => {
            const optIcon = opt.dtype ? DTYPE_ICONS[opt.dtype] : undefined;
            return (
              <li
                key={opt.value}
                onClick={() => { onChange(opt.value); setIsOpen(false); }}
                className="flex cursor-pointer items-center px-3 py-2 text-xs hover:bg-gray-50"
              >
                {optIcon && <FontAwesomeIcon icon={optIcon} className="mr-2 text-gray-500" />}
                {opt.label}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
