import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LatteLink Admin Console",
  description: "Internal control plane for client onboarding, operations, and launch readiness."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
