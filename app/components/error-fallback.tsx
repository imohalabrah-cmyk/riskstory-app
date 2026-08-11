"use client";

type ErrorFallbackProps = {
  reset: () => void;
};

export function ErrorFallback({ reset }: ErrorFallbackProps) {
  return (
    <main
      role="alert"
      style={{
        display: "grid",
        minHeight: "100vh",
        placeItems: "center",
        padding: 24,
        background: "#070a10",
        color: "#eef6ff",
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <section
        style={{
          width: "min(100%, 440px)",
          padding: 28,
          border: "1px solid rgba(154, 181, 223, .16)",
          borderRadius: 12,
          background: "#101827",
          boxShadow: "0 18px 50px rgba(0, 0, 0, .28)",
        }}
      >
        <p style={{ margin: "0 0 8px", color: "#19d9ff", fontSize: 12, fontWeight: 800 }}>RISK STORY</p>
        <h1 style={{ margin: 0, fontSize: 24 }}>Something went wrong</h1>
        <p style={{ margin: "12px 0 22px", color: "#91a4bd", lineHeight: 1.5 }}>
          Risk Story could not load this part of the workspace.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            minHeight: 36,
            border: "1px solid rgba(25, 217, 255, .55)",
            borderRadius: 8,
            padding: "0 14px",
            background: "rgba(25, 217, 255, .1)",
            color: "#e4fbff",
            cursor: "pointer",
            font: "inherit",
            fontWeight: 760,
          }}
        >
          Try again
        </button>
      </section>
    </main>
  );
}
