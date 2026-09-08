import type { MetadataRoute } from 'next';
import { SERVICES } from '@/lib/catalog';
import { MOVING_TIERS } from '@/lib/moving';
import { siteOrigin } from '@/lib/social-preview';
export default function sitemap(): MetadataRoute.Sitemap {
  return ['', '/services', '/moving', ...MOVING_TIERS.map(tier => `/moving/${tier.id}`), '/plans', '/planner', '/areas', '/contact', '/book', '/privacy', '/terms', ...SERVICES.filter(service => service.id !== 'moving').map(service => `/services/${service.id}`)].map(path => ({ url: `${siteOrigin}${path}`, changeFrequency: 'monthly', priority: path === '' ? 1 : path === '/services' ? 0.9 : 0.7 }));
}
