import PlotPage from '@/components/PlotPage'
import React from 'react'
import ErrorBoundary from '@/components/Error'

export default function Home (): JSX.Element {
  return (
    <>
        <ErrorBoundary>
            <PlotPage uuidProp={'recent'} />
        </ErrorBoundary>
    </>
  )
}
