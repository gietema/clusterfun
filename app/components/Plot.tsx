import React from 'react'
import dynamic from 'next/dynamic'
import { PlotProps } from '@/components/PlotlyPlot'

export const DynamicPlot = dynamic(import('./PlotlyPlot'), {
  ssr: false
})

export default function getPlot ({
  data,
  config,
  revision,
  handleHover,
  handleClick,
  handleSelect
}: PlotProps): JSX.Element {
  return (
    <DynamicPlot
      data={data}
      config={config}
      revision={revision}
      handleHover={handleHover}
      handleClick={handleClick}
      handleSelect={handleSelect}
    />
  )
}
