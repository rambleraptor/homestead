'use client';

import { Component, type ReactNode } from 'react';
import { logger } from '@rambleraptor/homestead-core/utils/logger';
import { Button } from './Button';
import { Card } from './Card';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: { componentStack: string }) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary Component
 *
 * Catches JavaScript errors anywhere in the child component tree,
 * logs those errors, and displays a fallback UI.
 *
 * Note: Error boundaries do not catch errors for:
 * - Event handlers
 * - Asynchronous code (e.g., setTimeout or requestAnimationFrame callbacks)
 * - Server side rendering
 * - Errors thrown in the error boundary itself
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: { componentStack: string }): void {
    // Log the error to the logging service
    logger.error('Error boundary caught an error', error, {
      componentStack: errorInfo.componentStack,
    });

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
    });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Custom fallback UI if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <Card className="max-w-md w-full">
            <div className="text-center">
              <div className="mb-4">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full">
                  <svg
                    className="w-8 h-8 text-red-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                </div>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Something went wrong
              </h2>
              <p className="text-gray-600 mb-6">
                An unexpected error occurred. Please try refreshing the page or contact support
                if the problem persists.
              </p>
              {this.state.error && (
                <details className="text-left mb-6">
                  <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
                    Error details
                  </summary>
                  <pre className="mt-2 text-xs bg-gray-100 p-3 rounded overflow-auto max-h-40">
                    {this.state.error.toString()}
                  </pre>
                </details>
              )}
              <div className="flex gap-3 justify-center">
                <Button variant="secondary" onClick={this.handleReset}>
                  Try Again
                </Button>
                <Button onClick={() => window.location.reload()}>
                  Reload Page
                </Button>
              </div>
            </div>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Module-level error boundary with a simpler fallback
 */
export function ModuleErrorFallback() {
  return (
    <Card className="p-6 text-center">
      <div className="inline-flex items-center justify-center w-12 h-12 bg-red-100 rounded-full mb-4">
        <svg
          className="w-6 h-6 text-red-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">
        Failed to load this section
      </h3>
      <p className="text-gray-600 mb-4">
        An error occurred while loading this content. Try refreshing the page.
      </p>
      <Button variant="secondary" onClick={() => window.location.reload()}>
        Refresh Page
      </Button>
    </Card>
  );
}
