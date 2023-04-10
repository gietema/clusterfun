import React from 'react'

export function InformationItem (
  index: number,
  columns: string[],
  item: any
): JSX.Element {
  return (
    <div key={index}>
      <div className={'border-bottom'}>
        <small>{columns[index]}</small>
      </div>
      <div>{item}</div>
    </div>
  )
}
