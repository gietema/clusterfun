"use client";
import { useState } from "react";
import { faChevronDown, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

interface SectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  badge?: React.ReactNode;
}

export default function Section({ title, defaultOpen = false, children, badge }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-gray-200">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
      >
        <FontAwesomeIcon icon={open ? faChevronDown : faChevronRight} className="w-2.5 text-gray-500" />
        {title}
        {badge && <span className="ml-auto">{badge}</span>}
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}
