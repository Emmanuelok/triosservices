import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SiteApp } from '@/components/site-app';
import { MOVING_TIERS } from '@/lib/moving';
import { siteOrigin } from '@/lib/social-preview';
export function generateStaticParams() { return MOVING_TIERS.map(tier => ({ tier: tier.id })); }
export async function generateMetadata({ params }: { params: Promise<{ tier: string }> }): Promise<Metadata> {
  const { tier: id } = await params;
  const tier = MOVING_TIERS.find(item => item.id === id);
  if (!tier) return { title: 'Moving tier not found · Trios' };
  return { title: `${tier.name} in St. John’s · Trios moving services`, description: tier.summary, alternates: { canonical: `${siteOrigin}/moving/${tier.id}` }, openGraph: { title: `${tier.name} · Trios Moving`, description: tier.summary, url: `${siteOrigin}/moving/${tier.id}`, images: [{ url: '/moving-hero.webp', width: 1536, height: 1024, alt: 'A thoughtfully prepared home move' }] } };
}
export default async function MovingTierPage({ params }: { params: Promise<{ tier: string }> }) { const { tier } = await params; if (!MOVING_TIERS.some(item => item.id === tier)) notFound(); return <SiteApp page="moving" serviceId={tier} />; }
