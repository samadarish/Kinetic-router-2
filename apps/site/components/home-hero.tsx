import type { SiteConfig, SiteProviderMap } from '@/data/site-config';
import { HomeApiExample } from './home-api-example';
import { models } from '@/data/content';

export function HomeHero({ home, providers }: { home: SiteConfig['home']; providers: SiteProviderMap }) {
  return <section className="overflow-hidden">
      <div className="home-hero-visual">
        {/* These committed WebP variants are already optimized for their target widths. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/kineticrouter/home-hero-1280.webp"
          srcSet="/brand/kineticrouter/home-hero-640.webp 640w, /brand/kineticrouter/home-hero-1280.webp 1280w, /brand/kineticrouter/home-hero-2061.webp 2061w"
          sizes="100vw"
          width={2061}
          height={763}
          alt=""
          aria-hidden="true"
          loading="eager"
          fetchPriority="high"
          decoding="async"
          className="home-hero-image"
        />
        <div className="home-hero-scrim" aria-hidden="true" />
        <h1 className="home-hero-title">
          <span className="home-hero-title-copy">{home.title}<span className="home-hero-period">.</span></span>
        </h1>
      </div>

      <HomeApiExample home={home} providers={providers} modelCount={models.length} />
    </section>;
}
