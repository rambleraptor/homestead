import { Component, type ReactNode } from 'react';
import { AlertCircle, RotateCw } from 'lucide-react';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';
import { logger } from '@rambleraptor/homestead-core/utils/logger';
import { Button } from './Button';
import { Card } from './Card';

interface ErrorBoundaryProps {
  children: ReactNode;
  /**
   * What to show in place of the children: a node, or a function given the
   * error and a way to try rendering the children again.
   */
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  /**
   * When this changes, a caught error is cleared and the children render
   * again: the page moved on, or the content that failed has changed.
   */
  resetKey?: unknown;
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

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (this.state.hasError && !Object.is(prevProps.resetKey, this.props.resetKey)) {
      this.handleReset();
    }
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
      const { fallback } = this.props;
      if (typeof fallback === 'function') {
        return fallback(this.state.error ?? new Error('Unknown error'), this.handleReset);
      }
      if (fallback !== undefined) {
        return fallback;
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
              <h2 className="text-2xl font-bold text-brand-navy mb-2">
                Something went wrong
              </h2>
              <p className="text-text-muted mb-6">
                An unexpected error occurred. Please try refreshing the page or contact support
                if the problem persists.
              </p>
              {this.state.error && (
                <details className="text-left mb-6">
                  <summary className="cursor-pointer text-sm text-text-muted hover:text-gray-700">
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
 * App-level error boundary with a simpler fallback
 */
export function AppErrorFallback() {
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
      <h3 className="text-lg font-semibold text-brand-navy mb-2">
        Failed to load this section
      </h3>
      <p className="text-text-muted mb-4">
        An error occurred while loading this content. Try refreshing the page.
      </p>
      <Button variant="secondary" onClick={() => window.location.reload()}>
        Refresh Page
      </Button>
    </Card>
  );
}

export interface RenderErrorProps {
  error: Error;
  title: string;
  /** Shown as a Reload button when given. */
  onReload?: () => void;
  /** For a slot inside a page (a card, one message): smaller type, tighter box. */
  compact?: boolean;
  className?: string;
  'data-testid'?: string;
}

/**
 * The inline fallback for a piece of the screen that threw while rendering:
 * what it was, and the error in its own words. Unlike `QueryError` it doesn't
 * rephrase the error — a render failure is a bug, and the message is what
 * someone needs to report it (a `TypeError` here is not a network problem).
 */
export function RenderError({
  error,
  title,
  onReload,
  compact = false,
  className,
  'data-testid': testId = 'render-error',
}: RenderErrorProps) {
  return (
    <div
      role="alert"
      data-testid={testId}
      className={cn(
        'flex flex-wrap items-start gap-3 border border-red-200 bg-red-50 text-red-800',
        compact ? 'rounded-xl px-3 py-2 text-xs' : 'rounded-2xl p-4 text-sm',
        className,
      )}
    >
      <AlertCircle
        className={cn('mt-0.5 shrink-0 text-red-600', compact ? 'h-4 w-4' : 'h-5 w-5')}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1 basis-40">
        <p className="font-semibold">{title}</p>
        <p className={cn('break-words font-mono text-red-700', compact ? 'mt-0.5' : 'mt-1')}>
          {error.message || String(error)}
        </p>
      </div>
      {onReload && (
        <Button
          variant="secondary"
          size="sm"
          onClick={onReload}
          className="ml-auto shrink-0"
          data-testid={`${testId}-reload`}
        >
          <RotateCw className="h-4 w-4" aria-hidden="true" />
          Reload
        </Button>
      )}
    </div>
  );
}
