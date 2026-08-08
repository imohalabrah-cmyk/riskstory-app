import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Risk Story",
  description: "Options analytics workspace for gamma, flow, heatmap, and open interest.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" dir="ltr">
      <body>{children}</body>
    </html>
  );
}
