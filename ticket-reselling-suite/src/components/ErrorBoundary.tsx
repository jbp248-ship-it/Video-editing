"use client";

import React from "react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[TicketOps] Unhandled error:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex h-screen items-center justify-center bg-slate-900">
            <div className="card max-w-md text-center space-y-4">
              <h2 className="text-lg font-semibold text-red-400">
                Something went wrong
              </h2>
              <p className="text-sm text-slate-400">
                {this.state.error?.message ?? "An unexpected error occurred."}
              </p>
              <button
                className="btn-primary"
                onClick={() => this.setState({ hasError: false, error: null })}
              >
                Try Again
              </button>
            </div>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
