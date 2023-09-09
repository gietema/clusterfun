import Highlight from 'react-highlight'
import React, { useState } from 'react'

export const CodeBlock: React.FC<{ code: string }> = ({ code }) => {
  const [copied, setCopied] = useState(false)

  const copyCode = (): void => {
    void navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1000)
  }

  return (
    <div className="code-block code">
      <div className="card">
        <div className="card-header bg-black p-1">
          <button
            onClick={copyCode}
            className="btn btn-sm btn-secondary float-end"
          >
            {copied
              ? (
              <i className="bi bi-check px-2"></i>
                )
              : (
              <i className="bi bi-clipboard px-2"></i>
                )}
            {copied ? 'Code copied!' : 'Copy code'}
          </button>
        </div>
        <code style={{ background: '#0d1117' }}>
          <Highlight className="python">{code}</Highlight>
        </code>
      </div>
    </div>
  )
}
