import React, { ReactNode } from 'react'

export function Browser (props: { children: ReactNode }): JSX.Element {
  return (
        <>
            <div className={'browser p-4 d-none d-sm-block'}>
                <div className="browser-buttons d-sm-block d-none">
                    <div className="browser-button"></div>
                    <div className="browser-button"></div>
                    <div className="browser-button"></div>
                </div>
                {props.children}
            </div>
            <div className={'browser p-0 d-block d-sm-none'}>
                {props.children}
            </div>
        </>
  )
}
