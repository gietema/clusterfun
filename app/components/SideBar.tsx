import React from 'react'
import { Media } from '../models/Media'
import { InformationItem } from './InformationItem'
import { PreviewMedia } from './PreviewMedia'

interface SideBarProps {
  media: Media
  columns: string[]
  boundingBoxColumn?: string
}
export default function SideBar ({
  media,
  columns,
  boundingBoxColumn
}: SideBarProps): JSX.Element {
  return (
    <div className={'sidebar text-dark'} style={{
      display: 'flex',
      flexDirection: 'column',
      maxHeight: 'calc(70vh - 35px)'
    }}>
      <div style={{ maxHeight: '300px' }}>
          <PreviewMedia
              media={media}
              boundingBoxColumnIndex={
                  boundingBoxColumn != null
                    ? columns.indexOf(boundingBoxColumn)
                    : undefined
              }
              displayLabel={true}
          />
      </div>
      <div style={{ overflowY: 'scroll', flexGrow: 1 }}>
          {media.information
            ?.filter(
              (item, index) => {
                return index !== (boundingBoxColumn != null ? columns.indexOf(boundingBoxColumn) : -1)
              })
            .map((item: any, index: number) => {
              return InformationItem(index, columns.slice(2), item)
            })}
      </div>
    </div>
  )
}
