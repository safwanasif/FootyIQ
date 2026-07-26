/**
 * ============================================================================
 * FootyIQ Web — Root Layout (layout.tsx)
 * ============================================================================
 * PURPOSE:
 *   Wraps every route in the dark command-center shell: deep zinc
 *   background, monospaced-friendly base, and page metadata. No client
 *   interactivity lives here — this is a pure server component.
 * ============================================================================
 */
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FootyIQ — xG Analytics Console",
  description: "Real-time expected goals (xG) analytics powered by a custom logistic regression model.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-zinc-950">{children}</body>
    </html>
  );
}