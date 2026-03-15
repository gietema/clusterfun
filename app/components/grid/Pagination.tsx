import { useState, useRef, useEffect } from "react";
import { faAngleDoubleLeft, faAngleDoubleRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

interface PaginationProps {
  page: number;
  maxPage: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({ page, maxPage, onPageChange }: PaginationProps) {
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commitPage = () => {
    const parsed = parseInt(inputValue, 10);
    if (!isNaN(parsed)) {
      const clamped = Math.max(0, Math.min(maxPage, parsed - 1));
      onPageChange(clamped);
    }
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-2 text-xs">
      <button
        className="text-gray-400 transition-colors hover:text-gray-900 disabled:text-gray-200"
        onClick={() => onPageChange(page - 1)}
        disabled={page === 0}
      >
        <FontAwesomeIcon icon={faAngleDoubleLeft} />
      </button>
      {editing ? (
        <span className="tabular-nums text-gray-600">
          <input
            ref={inputRef}
            type="text"
            className="w-8 rounded border border-gray-300 px-1 text-center text-xs tabular-nums outline-none focus:border-gray-500"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitPage();
              if (e.key === "Escape") setEditing(false);
            }}
            onBlur={commitPage}
          />
          {" / "}{maxPage + 1}
        </span>
      ) : (
        <button
          className="tabular-nums text-gray-600 hover:text-gray-900"
          onClick={() => { setInputValue(String(page + 1)); setEditing(true); }}
        >
          {page + 1} / {maxPage + 1}
        </button>
      )}
      <button
        className="text-gray-400 transition-colors hover:text-gray-900 disabled:text-gray-200"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= maxPage}
      >
        <FontAwesomeIcon icon={faAngleDoubleRight} />
      </button>
    </div>
  );
}
