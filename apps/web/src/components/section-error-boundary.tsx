/**
 * Section Error Boundary
 *
 * Wraps a page section. Catches render errors and shows an inline error card
 * instead of crashing the whole page.
 */

import { EmptyState } from '@noema/ui';
import { AlertTriangle } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';

// ============================================================================
// Types
// ============================================================================

interface IProps {
  children: ReactNode;
  /**
   * Optional custom fallback — overrides the default EmptyState.
   * Note: custom fallbacks receive no built-in retry mechanism; the consumer
   * is responsible for any recovery UX.
   */
  fallback?: ReactNode;
}

interface IState {
  hasError: boolean;
  error: Error | null;
}

// ============================================================================
// Component
// ============================================================================

export class SectionErrorBoundary extends Component<IProps, IState> {
  constructor(props: IProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): IState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Structured logging — provides context for debugging
    console.error('[SectionErrorBoundary]', {
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
    });
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  override render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.props.fallback !== undefined) {
      return this.props.fallback;
    }

    // Show the raw error message only in development — production surfaces a
    // generic string to avoid leaking internal details to end users.
    const message =
      process.env.NODE_ENV === 'development'
        ? (this.state.error?.message ?? 'An unexpected error occurred.')
        : 'An unexpected error occurred.';

    return (
      <EmptyState
        icon={<AlertTriangle className="h-8 w-8 text-destructive" />}
        title="Something went wrong"
        description={message}
        action={{
          label: 'Retry',
          onClick: this.handleRetry,
        }}
        className="rounded-lg border border-destructive/30 bg-destructive/5"
      />
    );
  }
}
