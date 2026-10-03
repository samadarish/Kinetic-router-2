import type { SiteConfig, SiteProviderMap } from '@/data/site-config';
import { HomeApiExample } from './home-api-example';
import { models } from '@/data/content';

export function HomeHero({ home, providers }: { home: SiteConfig['home']; providers: SiteProviderMap }) {
  return <section className="overflow-hidden">
      <div className="home-hero-visual">
        <picture>
          <source
            type="image/avif"
            srcSet="/brand/kineticrouter/home-hero-river-delta-640.avif 640w, /brand/kineticrouter/home-hero-river-delta-1280.avif 1280w, /brand/kineticrouter/home-hero-river-delta-2062.avif 2062w"
            sizes="100vw"
          />
          <img
            src="/brand/kineticrouter/home-hero-river-delta-1280.webp"
            srcSet="/brand/kineticrouter/home-hero-river-delta-640.webp 640w, /brand/kineticrouter/home-hero-river-delta-1280.webp 1280w, /brand/kineticrouter/home-hero-river-delta-2062.webp 2062w"
            sizes="100vw"
            width={2062}
            height={763}
            alt=""
            aria-hidden="true"
            loading="eager"
            fetchPriority="high"
            decoding="async"
            className="home-hero-image"
          />
        </picture>
        <div className="home-hero-scrim" aria-hidden="true" />
        <h1 className="home-hero-title">
          <span className="home-hero-title-copy">{home.title}<span className="home-hero-period">.</span></span>
        </h1>
      </div>

      <HomeApiExample home={home} providers={providers} modelCount={models.length} />
    </section>;
}
