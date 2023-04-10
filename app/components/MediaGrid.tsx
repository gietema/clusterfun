import React, { useEffect, useState } from 'react'
import { Media } from '../models/Media'
import { Pagination } from './Pagination'
import MediaGridItem from '@/components/MediaGridItem'

function BackButton (props: { back: Function }): JSX.Element {
  return (
    <button className="btn btn-secondary btn-sm" onClick={() => props.back()}>
      Back
    </button>
  )
}

export function MediaGrid (props: {
  selectedIndices: number[]
  media: Media[]
  back?: Function
  handleClick: Function
  handleHover: Function
  handlePage: Function
  handleSort: Function
  page: number
  infoColumns: string[]
  boundingBoxColumn?: string
}): JSX.Element {
  const [columns, setColumns] = useState<number>(10)
  const [shownColumn, setShownColumn] = useState<string | undefined>(undefined)
  const [showBboxLabel, setShowBboxLabel] = useState<boolean>(false)
  const [order, setOrder] = useState<string>('')
  const [ascending, setAscending] = useState<boolean>(true)

  function handleColumn (e: React.ChangeEvent<HTMLInputElement>): void {
    setColumns(parseInt(e.target.value))
  }

  useEffect(() => {
    if (order === '') {
      return
    }
    props.handleSort(order, ascending)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, ascending])

  return (
    <div className="row">
      <div className="col-12 p-3 mb-1 border-bottom-1 border-secondary">
        <div className="row justify-content-between">
          <div className="col text-dark">
            <div className="row">
              {props.back !== undefined && (
                <div className="col-2">
                  <BackButton back={props.back} />
                </div>
              )}
              <div className="col-3 text-dark">
                <small>{props.selectedIndices.length} selected</small>
              </div>
              <div className="col-5">
                <small>
                  <div className="input-group input-group-sm">
                    <select
                      name=""
                      className={'form-select form-select-sm'}
                      onChange={(e) => setOrder(e.target.value)}
                    >
                      <option value="" defaultValue={''}>
                        Order by
                      </option>
                      {props.infoColumns.map((column: string) => {
                        return (
                          <option value={column} key={column}>
                            {column}
                          </option>
                        )
                      })}
                    </select>
                    <button
                      className="btn btn-outline-secondary"
                      type="button"
                      onClick={() => {
                        setAscending(!ascending)
                      }}
                    >
                      <i
                        className={`bi ${
                          ascending ? 'bi-sort-up' : 'bi-sort-down'
                        }`}
                      ></i>
                    </button>
                  </div>
                </small>
              </div>
              {props.boundingBoxColumn != null && (
                <div className="col-4">
                  <small>
                    <div className="form-check">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        value=""
                        id="flexCheckDefault"
                        checked={showBboxLabel}
                        onChange={() => {
                          setShowBboxLabel(!showBboxLabel)
                        }}
                      />
                      <label
                        className="form-check-label"
                        htmlFor="flexCheckDefault"
                      >
                        Show bbox label
                      </label>
                    </div>
                  </small>
                </div>
              )}
            </div>
          </div>
          <div className="col">
            <div className="row justify-content-end">
              <div className="col-4">
                <select
                  name=""
                  className={'form-select form-select-sm'}
                  onChange={(e) => setShownColumn(e.target.value)}
                >
                  <option value="" defaultValue={''}>
                    Show value
                  </option>
                  {props.infoColumns.slice(2).map((infoColumn: string) => {
                    return (
                      <option key={infoColumn} value={infoColumn}>
                        {infoColumn}
                      </option>
                    )
                  })}
                </select>
              </div>
              <div className="col-4">
                <input
                  type="range"
                  className="form-range range--custom"
                  min={1}
                  max={10}
                  onChange={(e) => handleColumn(e)}
                />
              </div>
              <div className="col-4 text-end">
                <Pagination
                  handlePage={(newPage: number) =>
                    props.handlePage(newPage, order, ascending)
                  }
                  maxPage={Math.floor(props.selectedIndices.length / 50)}
                  page={props.page}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="col-12">
        <div className="row row--media-grid">
          {props.media.map((media: Media) => {
            return (
              <MediaGridItem
                media={media}
                key={media.index}
                handleClick={props.handleClick}
                handleHover={props.handleHover}
                infoColumns={props.infoColumns}
                columns={columns}
                showColumn={shownColumn}
                boundingBoxColumn={props.boundingBoxColumn}
                showBboxLabel={showBboxLabel}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
