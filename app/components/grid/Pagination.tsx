import { faAngleDoubleLeft, faAngleDoubleRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

interface PaginationProps {
  page: number;
  maxPage: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({ page, maxPage, onPageChange }: PaginationProps) {
  return (
    <div className="flex grow items-center justify-between border-r border-gray-300 pe-2 text-xs lg:py-0.5">
      <button
        className={page > 0 ? "hover:text-blue-500" : ""}
        onClick={() => onPageChange(page - 1)}
        disabled={page === 0}
      >
        <FontAwesomeIcon icon={faAngleDoubleLeft} />
      </button>
      <span className="px-1">{page + 1} / {maxPage + 1}</span>
      <button
        className="hover:text-blue-500"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= maxPage}
      >
        <FontAwesomeIcon icon={faAngleDoubleRight} />
      </button>
    </div>
  );
}
