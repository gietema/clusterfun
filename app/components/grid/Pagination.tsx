import {
  faAngleDoubleLeft,
  faAngleDoubleRight,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

export function Pagination(props: {
  handlePage: Function;
  page: number;
  maxPage: number;
}): JSX.Element {
  return (
    <div
      className="text-xs py-2 lg:py-0.5 flex grow items-center justify-between border-r border-gray-300 pe-2"
      role="group"
      aria-label="Basic example"
    >
      <button
        type="button"
        className={props.page !== 0 ? "hover:text-blue-500" : ""}
        onClick={() => {
          props.handlePage(props.page - 1);
        }}
        disabled={props.page === 0}
      >
        <FontAwesomeIcon icon={faAngleDoubleLeft} />
      </button>
      <button type="button" className="px-1" disabled>
        {props.page + 1} / {props.maxPage + 1}
      </button>
      <button
        type="button"
        className="hover:text-blue-500"
        onClick={() => {
          props.handlePage(props.page + 1);
        }}
        disabled={props.page === props.maxPage}
      >
        <FontAwesomeIcon icon={faAngleDoubleRight} />
      </button>
    </div>
  );
}
