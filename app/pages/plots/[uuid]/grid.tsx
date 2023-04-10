import { useRouter } from 'next/router'
import React, { useEffect, useState } from 'react'
import { Config } from '@/models/Config'
import { Media } from '@/models/Media'
import { getMediaItems } from '@/requests/GetMediaItems'
import { Pagination } from '@/components/Pagination'
import MediaGridItem from '@/components/MediaGridItem'
import Link from 'next/link'
import { getConfig } from '@/requests/GetConfig'
import { getMedia } from '@/requests/GetMedia'
import SideBar from '@/components/SideBar'

interface QueryValues {
  uuid?: string
  media?: string[] | string
  sortBy?: string
  asc?: string
  page?: string
  show?: string
}
export default function Grid (): JSX.Element | undefined {
  const router = useRouter()
  const { uuid, media, sortBy, asc, page, show }: QueryValues = router.query
  // TODO:: add previousPage
  const [currentPage, setCurrentPage] = useState<number | undefined>(undefined)
  const [mediaItems, setMediaItems] = useState<Media[]>([])
  const mediaIndices: number[] = decodeURIComponent(media as string)
    .split(',')
    .map((s) => parseInt(s))
  const [ascending, setAscending] = useState<boolean>(
    asc !== undefined && asc === 'true'
  )
  const [sortColumn, setSortColumn] = useState<string | undefined>(
    sortBy !== undefined ? sortBy : undefined
  )
  const [config, setConfig] = useState(new Config('', '', []))
  const [shownColumn, setShownColumn] = useState<string | undefined>(
    undefined
  )
  const [columnNumber, setColumnNumber] = useState<number>(0)
  const [showBboxLabel, setShowBboxLabel] = useState<boolean>(false)
  const [sideMedia, setSideMedia] = useState<Media | undefined>(
    undefined
  )

  useEffect(() => {
    if (page !== undefined) {
      setCurrentPage(parseInt(page))
    }
  }, [page])

  useEffect(() => {
    if (sortBy !== undefined) {
      setSortColumn(sortBy)
    }
  }, [sortBy])

  useEffect(() => {
    if (asc !== undefined) {
      setAscending(asc === 'true')
    }
  }, [asc])

  useEffect(() => {
    if (show !== undefined) {
      setShownColumn(show)
    }
  }, [show])

  useEffect(() => {
    // Fetch config for grid based on uuid
    if (uuid != null) {
      void getConfig(uuid).then((config) => setConfig(config))
    }
    // es-lint-disable-next-line @typescript-eslint/ban-ts-comment
  }, [uuid])

  useEffect(() => {
    if (
      mediaIndices === undefined ||
      mediaIndices.length === 0 ||
      uuid === undefined ||
      currentPage === undefined
    ) {
      return
    }
    getMediaItems(uuid, mediaIndices, currentPage, sortColumn, ascending)
      .then((media) => {
        const query = buildQuery()
        router
          .push(`/plots/${uuid}/grid?${query}`, `/plots/${uuid}/grid?${query}`)
          .catch((e) => console.log(e))
        setMediaItems(media)
      })
      .catch((e) => console.log(e))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortColumn, ascending, uuid, currentPage])

  useEffect(() => {
    if (shownColumn === undefined || uuid === undefined) {
      return
    }
    const query = buildQuery()
    router
      .push(`/plots/${uuid}/grid?${query}`, `/plots/${uuid}/grid?${query}`)
      .catch((e) => console.log(e))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownColumn])

  function handleColumnNumber (e: React.ChangeEvent<HTMLInputElement>): void {
    setColumnNumber(parseInt(e.target.value))
  }

  function handleClick (index: number): void {
    if (uuid === undefined) {
      return
    }
    router
      .push(`/plots/${uuid}/media/${index}`, `/plots/${uuid}/media/${index}`)
      .catch((e) => console.log(e))
  }

  function handleHover (index: number): void {
    void getMedia(uuid as string, index).then((media) => {
      setSideMedia(media)
    })
  }

  function handleSort (
    column: string | undefined,
    ascending: boolean
  ): void {
    if (column === undefined || !config.columns.includes(column)) {
      return
    }
    setSortColumn(column)
    setAscending(ascending)
  }

  function buildQuery (): string {
    let query = ''
    if (currentPage !== undefined) {
      query += `&page=${currentPage}`
    } else {
      query += '&page=0'
    }
    if (sortColumn !== undefined) {
      query += `&sortBy=${sortColumn}`
    }
    if (ascending !== undefined) {
      query += `&asc=${ascending.toString()}`
    }
    if (shownColumn !== undefined) {
      query += `&show=${shownColumn}`
    }
    if (media !== undefined) {
      if (typeof media === 'string') {
        query += `&media=${media}`
      } else if (Array.isArray(media)) {
        const mediaStr: string = media.join(',')
        query += `&media=${mediaStr}`
      }
    }
    return query
  }
  if (uuid === undefined) {
    return
  }

  return (
    <div className="container-fluid">
      <div className="row">
        <div className="col-9">
          <div className="row">
            <div className="col-12 p-3 mb-1 border-bottom-1 border-secondary">
              <div className="row justify-content-between">
                <div className="col text-dark">
                  <div className="row">
                    {config.type !== 'grid' && (
                      <div className="col-2">
                        <Link href={`/plots/${uuid}`}>Back</Link>
                      </div>
                    )}
                    <div className="col-3 text-dark">
                      <small>{mediaIndices.length} selected</small>
                    </div>
                    <div className="col-5">
                      <small>
                        <div className="input-group input-group-sm">
                          <select
                            name=""
                            className={'form-select form-select-sm'}
                            onChange={(e) =>
                              handleSort(e.target.value, ascending)
                            }
                            value={sortColumn}
                          >
                            <option value="" defaultValue={''}>
                              Order by
                            </option>
                            {config.columns.map((column: string) => {
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
                              handleSort(sortColumn, !ascending)
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
                    {config.bounding_box != null && (
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
                        value={shownColumn}
                      >
                        <option value="" defaultValue={''}>
                          Show value
                        </option>
                        {config.columns.map((infoColumn: string) => {
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
                        onChange={(e) => handleColumnNumber(e)}
                      />
                    </div>
                    <div className="col-4 text-end">
                      <Pagination
                        handlePage={(newPage: number) =>
                          setCurrentPage(newPage)
                        }
                        maxPage={Math.floor(mediaIndices.length / 50)}
                        page={currentPage === undefined ? 0 : currentPage}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="col-12">
              <div className="row row--media-grid">
                {mediaItems.map((media: Media) => {
                  return (
                    <MediaGridItem
                      media={media}
                      key={media.index}
                      handleClick={handleClick}
                      handleHover={handleHover}
                      infoColumns={config.columns}
                      columns={columnNumber}
                      showColumn={shownColumn}
                      boundingBoxColumn={config.bounding_box}
                      showBboxLabel={showBboxLabel}
                    />
                  )
                })}
              </div>
            </div>
          </div>
        </div>
        <div className="col-3 p-3">
          {sideMedia != null && (
            <SideBar
              media={sideMedia}
              columns={config.columns}
              boundingBoxColumn={config.bounding_box}
            />
          )}
        </div>
      </div>
    </div>
  )
}
