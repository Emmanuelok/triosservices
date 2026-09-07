import type { Metadata, Viewport } from "next";
import "./globals.css";
export const viewport: Viewport = {width:'device-width',initialScale:1,viewportFit:'cover',themeColor:'#1b5256'};
export const metadata: Metadata = { title: "Trios · Property care, all year", description: "Snow clearing, lawn care and seasonal property services in St. John's. Request a quote, build your care plan and manage your property with Trios Snow and Mowing Inc.", icons:{icon:"/favicon.svg?v=3",shortcut:"/favicon.svg?v=3"} };
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
