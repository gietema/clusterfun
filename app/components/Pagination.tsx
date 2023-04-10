import React from 'react'

export function Pagination (props: {
  handlePage: Function
  page: number
  maxPage: number
}): JSX.Element {
  return (
    <div
      className="btn-group btn-group-sm"
      role="group"
      aria-label="Basic example"
    >
      <button
        type="button"
        className="btn btn-outline-secondary"
        onClick={() => {
          props.handlePage(props.page - 1)
        }}
        disabled={props.page === 0}
      >
        &laquo;
      </button>
      <button type="button" className="btn btn-outline-secondary" disabled>
        {props.page + 1} / {props.maxPage + 1}
      </button>
      <button
        type="button"
        className="btn btn-outline-secondary"
        onClick={() => {
          props.handlePage(props.page + 1)
        }}
        disabled={props.page === props.maxPage}
      >
        &raquo;
      </button>
    </div>
  )
}
