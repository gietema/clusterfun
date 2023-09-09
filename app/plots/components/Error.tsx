import React, { Component, ReactNode } from 'react'
import ErrorPage from 'next/error'

interface ErrorBoundaryState {
  hasError: boolean
  errorInfo: React.ErrorInfo | null
  error: Error | null
}
export default class ErrorBoundary extends Component<{}, ErrorBoundaryState> {
  constructor (props: { children: ReactNode }) {
    super(props)
    this.state = {
      hasError: false,
      errorInfo: null,
      error: null
    }
  }

  static getDerivedStateFromError (error: Error): ErrorBoundaryState {
    return { hasError: true, errorInfo: null, error }
  }

  componentDidCatch (error: Error, errorInfo: React.ErrorInfo): void {
    this.setState({ errorInfo, error })
    // You can also log the error to an error reporting service here
  }

  render (): React.ReactNode {
    if (this.state.hasError) {
      return (
          <ErrorPage error={this.state.error} errorInfo={this.state.errorInfo} statusCode={500}/>
      )
    }
    // @ts-expect-error
    return this.props.children
  }
}
