import type { MetadataRoute } from 'next';
import { siteOrigin } from '@/lib/social-preview';
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/operations', '/crew', '/portal', '/staff', '/sign-in', '/sign-out', '/auth/'] }, sitemap: `${siteOrigin}/sitemap.xml` };
}
