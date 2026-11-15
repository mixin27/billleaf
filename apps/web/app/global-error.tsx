"use client"

import * as Sentry from "@sentry/nextjs"
import * as React from "react"

/** Last-resort error boundary for the root layout; reports to Sentry. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  React.useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 40 }}>
        <h1 style={{ fontSize: 20 }}>Something went wrong</h1>
        <p style={{ color: "#555" }}>
          The error has been reported. Please try again.
        </p>
        <button onClick={() => reset()} style={{ marginTop: 16 }}>
          Try again
        </button>
      </body>
    </html>
  )
}
