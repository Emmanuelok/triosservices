import type { Metadata, Viewport } from "next";
import { socialDescription, socialImage, socialOpenGraph, socialTitle, siteOrigin } from "@/lib/social-preview";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1b5256",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title: "Trios · Property care, all year",
  description: socialDescription,
  icons: { icon: "/favicon.svg?v=3", shortcut: "/favicon.svg?v=3" },
  openGraph: socialOpenGraph,
  twitter: {
    card: "summary_large_image",
    title: socialTitle,
    description: socialDescription,
    images: [socialImage],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
