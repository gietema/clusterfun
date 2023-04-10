import { Media } from '@/models/Media'
import { PreviewMedia } from '@/components/PreviewMedia'
import React from 'react'

export default function MediaGridItem (props: {
  media: Media
  handleClick: Function
  handleHover: Function
  infoColumns: string[]
  columns: number
  showColumn?: string
  boundingBoxColumn?: string
  showBboxLabel: boolean
}): JSX.Element {
  let info: JSX.Element = <></>
  if (props.showColumn != null && props.media.information != null) {
    const columnIndex = props.infoColumns.slice(2).indexOf(props.showColumn)
    info = (
      <div className="col-12 media-grid-value text-dark text-small">
        <div>
          <small>{props.media.information[columnIndex]}</small>
        </div>
      </div>
    )
  }
  return (
    <div
      className={`col-3 grid-media pb-4 media-col-${props.columns}`}
      key={`${props.media.index}-${props.media.src}`}
      onClick={() => props.handleClick(props.media.index)}
      onMouseEnter={() => props.handleHover(props.media.index)}
    >
      <div className="row">
        <div className="col-12">
          <PreviewMedia
            media={props.media}
            boundingBoxColumnIndex={
              props.boundingBoxColumn != null
                ? props.infoColumns.indexOf(props.boundingBoxColumn)
                : undefined
            }
            displayLabel={props.showBboxLabel}
            columns={props.columns}
          />
        </div>
        {info}
      </div>
    </div>
  )
}
