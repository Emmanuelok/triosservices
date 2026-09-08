import type { MetadataRoute } from 'next';
import { SERVICES } from '@/lib/catalog';
import { siteOrigin } from '@/lib/social-preview';
export default function sitemap(): MetadataRoute.Sitemap {
  return ['', '/services', '/plans', '/planner', '/areas', '/contact', '/book', '/privacy', '/terms', ...SERVICES.map(service => `/services/${service.id}`)].map(path => ({ url: `${siteOrigin}${path}`, changeFrequency: 'monthly', priority: path === '' ? 1 : path === '/services' ? 0.9 : 0.7 }));
}
