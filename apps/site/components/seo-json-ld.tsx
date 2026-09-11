import { structuredData } from '@/data/seo';
import { serializeJsonLd } from '@/data/seo-policy.mjs';

export function SeoJsonLd({ route }: { route: string }) {
  const data = structuredData(route);
  return data ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} /> : null;
}
