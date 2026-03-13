import { faAngleDoubleLeft, faAngleDoubleRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

interface PaginationProps {
  page: number;
  maxPage: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({ page, maxPage, onPageChange }: PaginationProps) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <button
        className="text-gray-400 transition-colors hover:text-gray-900 disabled:text-gray-200"
        onClick={() => onPageChange(page - 1)}
        disabled={page === 0}
      >
        <FontAwesomeIcon icon={faAngleDoubleLeft} />
      </button>
      <span className="tabular-nums text-gray-600">{page + 1} / {maxPage + 1}</span>
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
