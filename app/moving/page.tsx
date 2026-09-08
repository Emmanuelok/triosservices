import type { Metadata } from 'next';
import { SiteApp } from '@/components/site-app';
import { siteOrigin } from '@/lib/social-preview';
export const metadata: Metadata = {
  title: 'Moving services in St. John’s · Four tiers of moving help · Trios',
  description: 'Explore labour-only moving help, local moves, packing and settling-in support in St. John’s. Compare four tiers and build a detailed moving quote request with Trios.',
  alternates: { canonical: `${siteOrigin}/moving` },
  openGraph: { title: 'A new chapter, thoughtfully planned. · Trios Moving', description: 'Four levels of moving help. Plan your inventory, addresses, packing and next steps in one Trios request.', url: `${siteOrigin}/moving`, images: [{ url: '/moving-hero.webp', width: 1536, height: 1024, alt: 'Boxes and a houseplant ready for a move in a bright home' }] },
};
export default function MovingPage() { return <SiteApp page="moving" />; }
