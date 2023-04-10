import React, { useEffect, useState } from 'react'
import { Data } from 'plotly.js'
import { Media } from '@/models/Media'
import { Config } from '@/models/Config'
import { getMedia } from '@/requests/GetMedia'
import { useRouter } from 'next/router'
import { getPlotData } from '@/requests/GetPlotData'
import { Filter } from '@/components/Filter'
import getPlot from '@/components/Plot'
import SideBar from '@/components/SideBar'
import { getUuid } from '@/requests/GetUuid'

export default function PlotPage ({ uuidProp }: { uuidProp: string }): JSX.Element {
  const router = useRouter()
  const [uuid, setUuid] = useState<string | undefined>(undefined)
  const [config, setConfig] = useState(new Config('', '', []))
  const [sideMedia, setSideMedia] = useState<Media | null>(null)
  const [plotData, setPlotData] = useState<Data[]>([])
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    if (uuidProp === undefined) {
      return
    }
    if (uuidProp === 'recent') {
      void getUuid().then((uuid: string) => setUuid(uuid))
    } else {
      setUuid(uuidProp)
    }
  }, [uuidProp])

  useEffect(() => {
    if (uuid === undefined) {
      return
    }
    getPlotData(uuid)
      .then(async ({ config, data }) => {
        setConfig(config)
        setPlotData(data)
        setRevision(revision + 1)
        if (config.type === 'grid') {
          // @ts-expect-error
          await handleMediaSelect(data[0].id)
        }
      })
      .catch((e) => console.log(e))
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uuid])

  useEffect(() => {
    // Fetch an image at start of page to fill the side panel
    if (sideMedia === null && plotData.length > 0) {
      // @ts-expect-error
      handlePointHover(plotData[0].id[1])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uuid, plotData])

  function handlePointHover (index: number | undefined): void {
    if (index != null && uuid != null) {
      getMedia(uuid, index)
        .then((media) => setSideMedia(media))
        .catch((e) => console.log(e))
    }
  }

  function handleFilterData (plotData: React.SetStateAction<Data[]>): void {
    setPlotData(plotData)
    setRevision(revision + 1)
  }

  const handleMediaClick = async (index: number | undefined): Promise<void> => {
    if (index != null && uuid != null) {
      const media: Media = await getMedia(uuid, index)
      setSideMedia(media)
      router.push(`/plots/${uuid}/media/${index}`).catch((e) => console.log(e))
    }
  }

  const handleMediaSelect = (mediaIndices: number[]): void => {
    if (uuid === undefined) {
      return
    }
    router
      .push(`/plots/${uuid}/grid?page=0&media=${mediaIndices.join(',')}`)
      .catch((e) => console.log(e))
  }

  return (
        <div className="container-fluid pt-1">
            <div className="row">
                <div className="col-9 col--main">
                    <div className="row">
                        {config.title != null && (
                            <div className="col-12">{config.title}</div>
                        )}
                        <div className="col-12">
                            {(uuid !== null) && (
                                <Filter
                                    cfg={config}
                                    uuid={uuid as string}
                                    handleFilterData={(data: React.SetStateAction<Data[]>) =>
                                      handleFilterData(data)
                                    }
                                />
                            )}
                        </div>
                        <div className="col-12 col--plot">
                            {getPlot({
                              data: plotData,
                              config,
                              revision,
                              handleClick: handleMediaClick,
                              handleHover: handlePointHover,
                              handleSelect: handleMediaSelect
                            })}
                        </div>
                    </div>
                </div>
                <div className="col-3 border-start border-dark text-dark">
                    {sideMedia !== null && (
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
