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
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Use inline styles as fallback in case CSS classes are not available
      return (
        <div
          style={{
            display: "flex",
            height: "100vh",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#FAF9F6",
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          <div
            style={{
              maxWidth: "28rem",
              textAlign: "center",
              padding: "2rem",
              backgroundColor: "#FFFFFF",
              borderRadius: "12px",
              boxShadow: "0 4px 12px rgba(61,57,41,0.1)",
            }}
          >
            <h2
              style={{
                fontSize: "1.125rem",
                fontWeight: 600,
                color: "#dc2626",
                marginBottom: "0.75rem",
              }}
            >
              Something went wrong
            </h2>
            <p
              style={{
                fontSize: "0.875rem",
                color: "#78716C",
                marginBottom: "1rem",
              }}
            >
              {this.state.error?.message ?? "An unexpected error occurred."}
            </p>
            <button
              style={{
                padding: "0.5rem 1.25rem",
                borderRadius: "6px",
                fontSize: "0.875rem",
                fontWeight: 600,
                color: "#FFFFFF",
                backgroundColor: "#D97706",
                border: "none",
                cursor: "pointer",
              }}
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
