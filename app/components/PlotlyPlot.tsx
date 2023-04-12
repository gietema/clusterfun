import React, { useEffect, useState } from 'react'
import { Config } from '@/models/Config'
import dynamic from 'next/dynamic'

export interface PlotProps {
  data: any[]
  config: Config
  layout?: any
  revision: number
  handleHover: Function
  handleClick: Function
  handleSelect: Function
}

const Plot = dynamic(async () => await import('react-plotly.js'), { ssr: false })

// eslint-disable-next-line react/display-name,import/no-anonymous-default-export
export default ({
  data,
  config,
  revision,
  handleHover,
  handleClick,
  handleSelect
}: PlotProps): JSX.Element => {
  const [layout, setLayout] = useState<any>({
    hovermode: 'closest',
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    xaxis: getXAxis(config),
    yaxis: {
      autorange: true,
      showgrid: true,
      showline: false,
      title: {
        text: config.y
      }
    },
    dragmode: 'select',
    datarevision: revision,
    autosize: true,
    margin: {
      l: 40,
      r: 0,
      b: 40,
      t: 15,
      pad: 0
    }
  })

  useEffect(() => {
    setLayout((prevState: any) => ({
      ...prevState,
      xaxis: getXAxis(config),
      yaxis: {
        ...prevState.yaxis,
        title: {
          text: config.y
        }
      },
      datarevision: revision
    }))
  }, [config, revision])

  // Update the onRelayout event handler to update the layout state
  function onRelayout (e: any): void {
    if (e['xaxis.range[0]'] !== undefined &&
        e['xaxis.range[1]'] !== undefined &&
        e['yaxis.range[0]'] !== undefined &&
        e['yaxis.range[1]'] !== undefined) {
      setLayout((prevState: { xaxis: any, yaxis: any }) => ({
        ...prevState,
        xaxis: { ...prevState.xaxis, range: [e['xaxis.range[0]'], e['xaxis.range[1]']] },
        yaxis: { ...prevState.yaxis, range: [e['yaxis.range[0]'], e['yaxis.range[1]']] }
      }))
    }
  }

  return (
      <Plot
          data={data}
          layout={layout}
          revision={revision}
          useResizeHandler={true}
          style={{ width: '100%', height: '100%' }}
          config={{ scrollZoom: true }}
          onRelayout={(e: any) => onRelayout(e)}
          onHover={(e: { points: Array<{ pointIndex: string | number }> }) =>
            handleHover(
              // @ts-expect-error
              e.points?.[0].data.id[e.points[0].pointIndex]
            )
          }
          onClick={(e: { points: Array<{ pointIndex: string | number }> }) =>
            handleClick(
              // @ts-expect-error
              e.points?.[0].data.id[e.points[0].pointIndex]
            )
          }
          onSelected={(e: { points: any[] }) => {
            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
            if (e?.points && e.points.length > 0) {
              const selectedIndices = e.points.map(
                (p) => data[p.curveNumber].id[p.pointIndex]
              )
              // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
              handleSelect(e.points && selectedIndices)
            }
          }}
      />
  )
}

function getXAxis (cfg: Config): object {
  if (cfg.type !== 'violin') {
    return {
      showgrid: true,
      showline: false,
      zeroline: false,
      title: {
        text: cfg.x
      },
      autorange: true
    }
  } else {
    return {
      /* Set the placement of the first tick */
      tick0: 0,
      /* Set the step in-between ticks */
      dtick: 2,
      /* Specifies the maximum number of ticks */
      tickvals:
        cfg.colors != null &&
        Array.from({ length: cfg.colors.length }, (v, i) => i * 2),
      ticktext: cfg.colors,
      autorange: true
    }
  }
}
