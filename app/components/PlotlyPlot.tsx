import React from 'react'
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
  layout,
  revision,
  handleHover,
  handleClick,
  handleSelect
}: PlotProps): JSX.Element => (
  <Plot
    data={data}
    layout={(layout !== undefined)
      ? layout
      : {
          paper_bgcolor: 'rgba(0,0,0,0)',
          plot_bgcolor: 'rgba(0,0,0,0)',
          xaxis: getXAxis(config),
          yaxis: {
            showgrid: false,
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
        }
    }
    useResizeHandler={true}
    style={{ width: '100%', height: '100%' }}
    config={{ scrollZoom: true }}
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

function getXAxis (cfg: Config): object {
  if (cfg.type !== 'violin') {
    return {
      showgrid: false,
      showline: false,
      title: {
        text: cfg.x
      }
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
      ticktext: cfg.colors
    }
  }
}
