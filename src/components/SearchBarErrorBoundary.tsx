import { Component, ErrorInfo, ReactNode } from "react"
import { errorN } from '../lib/log'

interface SearchBarErrorBoundaryProps {
    fallback: ReactNode
    onError: (error: Error) => void
    children: ReactNode
}

// Keeps a crash in our search bar from bubbling up to Steam's header error boundary,
// which would replace the whole header with a stack trace until Steam restarts
export class SearchBarErrorBoundary extends Component<SearchBarErrorBoundaryProps, { hasError: boolean }> {
    state = { hasError: false }

    static getDerivedStateFromError() {
        return { hasError: true }
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        errorN('Search Bar Patch', 'Search bar crashed, falling back to the native search box.', error, info.componentStack)
        this.props.onError(error)
    }

    render() {
        return this.state.hasError ? this.props.fallback : this.props.children
    }
}
