"use client";

import { ErrorFallback } from "./components/error-fallback";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <ErrorFallback reset={reset} />
      </body>
    </html>
  );
}
