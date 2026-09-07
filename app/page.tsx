import type { Metadata } from "next";
import { SiteApp } from "@/components/site-app";
import { socialOpenGraph, siteOrigin } from "@/lib/social-preview";

export const metadata: Metadata = {
  openGraph: { ...socialOpenGraph, url: siteOrigin },
};

export default function Home(){ return <SiteApp page="home"/>; }
