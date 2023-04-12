import React, { useEffect, useState } from 'react'
import { Media } from '@/models/Media'
import { useRouter } from 'next/router'
import { getMedia } from '@/requests/GetMedia'
import getImagePlot from '@/components/ImagePlot'
import SideBar from '@/components/SideBar'
import { getConfig } from '@/requests/GetConfig'
import { Config } from '@/models/Config'

interface MediaPageProps {
  uuid: string
  mediaIndex?: number
  useRouterFunction?: boolean
  back?: () => void
}

interface PageValues {
  uuid: string
  mediaIndex?: number
  back?: () => void
}
export default function MediaPage (): JSX.Element {
  const router = useRouter()
  const { uuid, mediaIndex } = router.query
  const pageValues: PageValues = {uuid: uuid as string, mediaIndex: mediaIndex as unknown as number}
  const [media, setMedia] = useState<Media | undefined>()
  const scaleFactor = 1
  const shapes: object[] = []
  const [config, setConfig] = useState<Config | undefined>(undefined)

  useEffect(() => {
    if (pageValues.uuid === undefined || pageValues.mediaIndex === undefined) {
      return
    }
    getMedia(pageValues.uuid, Number(pageValues.mediaIndex), true)
      .then((media) => {
        setMedia(media)
      })
      .catch((e) => console.log(e))
    getConfig(pageValues.uuid)
      .then((config) => {
        setConfig(config)
      })
      .catch((e) => console.log(e))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageValues.uuid, pageValues.mediaIndex])

  function handleBack (): void {
    void router.push(`/plots/${pageValues.uuid}`)
  }

  return (
    <div className="container-fluid">
      <div className="row">
        <div className="col-9">
          <div>
            <div className="p-1 mb-1 ps-0 border-bottom-1 border-secondary">
              <button
                className="btn btn-sm btn-secondary"
                onClick={() => handleBack()}
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
