import React from 'react'
import { useRouter } from 'next/router'
import PlotPage from '@/components/PlotPage'

export default function PlotPageUuid (): JSX.Element {
  const router = useRouter()
  const uuid = router.query.uuid as string

  return <PlotPage uuidProp={uuid} />
}
