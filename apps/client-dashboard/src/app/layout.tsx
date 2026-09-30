import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { DashboardProviders } from "./providers";
import "../styles.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter"
});

export const metadata: Metadata = {
  title: "LatteLink · Operator Dashboard",
  description: "Store operations, ordering, menu, team, and branded app management for LatteLink merchants."
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <DashboardProviders>{children}</DashboardProviders>
      </body>
    </html>
  );
}
