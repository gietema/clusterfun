import React, { useEffect, useState } from 'react'
import { Media } from '@/models/Media'
import { useRouter } from 'next/router'
import { getMedia } from '@/requests/GetMedia'
import getImagePlot from '@/components/ImagePlot'
import SideBar from '@/components/SideBar'
import { getConfig } from '@/requests/GetConfig'
import { Config } from '@/models/Config'

export default function MediaPage (): JSX.Element {
  const router = useRouter()
  const { uuid, mediaIndex } = router.query
  const [media, setMedia] = useState<Media | undefined>(undefined)
  const scaleFactor = 1
  const shapes: object[] = []
  const [config, setConfig] = useState<Config | undefined>(undefined)

  useEffect(() => {
    if (uuid === undefined || mediaIndex === undefined) {
      return
    }
    getMedia(uuid as string, Number(mediaIndex), true)
      .then((media) => {
        setMedia(media)
      })
      .catch((e) => console.log(e))
    getConfig(uuid as string)
      .then((config) => {
        setConfig(config)
      })
      .catch((e) => console.log(e))
  }, [uuid, mediaIndex])

  return (
    <div className="container-fluid">
      <div className="row">
        <div className="col-9">
          <div>
            <div className="p-1 mb-1 ps-0 border-bottom-1 border-secondary">
              <button
                className="btn btn-secondary"
                onClick={() => router.back()}
              >
                Back
              </button>
            </div>
            {
              media !== undefined &&
                getImagePlot({
                  media,
                  scaleFactor,
                  shapes
                })
            }
          </div>
        </div>
        <div className="col-3 p-3">
          {config !== undefined && media !== undefined && (
            <SideBar media={media} columns={config?.columns} />
          )}
        </div>
      </div>
    </div>
  )
}
