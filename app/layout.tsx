import type { Metadata, Viewport } from "next";
import { PwaInstall } from "@/components/pwa-install";
import { socialDescription, socialImage, socialOpenGraph, socialTitle, siteOrigin } from "@/lib/social-preview";
import "./globals.css";
import "./pwa.css";
import "./public-upgrade.css";
import "./operations-upgrade.css";
import "./customer-upgrade.css";
import "./assistants-upgrade.css";
import "./workflow-upgrade.css";
import "./moving-upgrade.css";
import "./moving-intake.css";
import "./moving-workspace.css";
import "./cinematic-home.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1b5256",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  applicationName: "Trios",
  title: "Trios · Property care & moving, all year",
  description: socialDescription,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Trios",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/favicon.svg?v=3", type: "image/svg+xml" },
      { url: "/pwa/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    shortcut: "/favicon.svg?v=3",
    apple: [
      { url: "/pwa/apple-touch-icon-180.png", sizes: "180x180", type: "image/png" },
    ],
  },
  openGraph: socialOpenGraph,
  twitter: {
    card: "summary_large_image",
    title: socialTitle,
    description: socialDescription,
    images: [socialImage],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en-CA"><body>{children}<PwaInstall /></body></html>;
}
