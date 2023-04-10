import React from 'react'
import dynamic from 'next/dynamic'
import { ImagePlotProps } from '@/components/PlotlyImagePlot'

export const DynamicImagePlot = dynamic(import('./PlotlyImagePlot'), {
  ssr: false
})

export default function getImagePlot ({
  media,
  scaleFactor,
  shapes
}: ImagePlotProps): JSX.Element {
  return (
    <DynamicImagePlot media={media} scaleFactor={scaleFactor} shapes={shapes} />
  )
}
