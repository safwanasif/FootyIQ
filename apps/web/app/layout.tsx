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
  title: "FootyIQ — Explore the quality of every chance",
  description: "An interactive football shot lab. Explore expected goals, compare chances, and discover the evidence behind an interpretable model.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
