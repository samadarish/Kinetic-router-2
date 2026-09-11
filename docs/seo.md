# SEO and Google Search Console

The public search origin is `https://kineticrouter.com`. Public page metadata,
JSON-LD, and sitemaps use that fixed origin. Account redirects, the authenticated
console, planned documentation, and preview deployments should not appear in search.

## Register with Google

1. In [Google Search Console](https://search.google.com/search-console), add a
   **Domain property** for `kineticrouter.com`.
2. Add the exact DNS verification record Google provides at the domain's DNS
   provider, then select Verify. Keep that record after verification succeeds.
3. After the SEO release is live, submit
   `https://kineticrouter.com/sitemap.xml` in Sitemaps. It includes every canonical
   public page; the compatible `/docs-sitemap.xml` endpoint contains the docs subset.
4. Use URL Inspection on the homepage, `/models`, one model page, and one docs
   page. Check the live test's content, indexability, and canonical URL, then request
   indexing for these representative pages.

For URL-prefix verification instead, set `GOOGLE_SITE_VERIFICATION` to the exact
`content` value from Google's HTML verification tag. Do not paste the whole tag.
Use the hosting platform's server environment configuration and rebuild/redeploy.
For local development, use the ignored `apps/site/.env.local` file. No tag is
emitted when this setting is empty. DNS verification is required for a Domain
property and does not require this environment variable.

## Release checks

Deploy this repository to the existing server using the current public-site
deployment process. Keep the reverse proxy's original `Host` header when forwarding
requests to the site, so production requests are recognized as `kineticrouter.com`
or `www.kineticrouter.com`. Other hosts deliberately receive `noindex`.

```powershell
npm test
npm run typecheck
npm run lint
npm run check:providers
npm run check:content
npm run build:site
node scripts/check-brand-assets.mjs
node scripts/check-site-seo.mjs --origin=http://localhost:3000
```

Run the HTTP check against the server actually serving the candidate build. It
checks complete server HTML for all 91 existing public views, both sitemaps,
robots, account redirects, JSON responses, and invalid routes. Production checks:

```powershell
node scripts/check-site-seo.mjs --origin=https://kineticrouter.com --production
```

The optional `--baseline=path/to/baseline.json` compares rendered text, class
attributes, and images against an earlier HTTP capture. Reports are written to
the ignored `.cache/seo/report.json`. Static response checks do not substitute for
real-user performance measurement.

To check a local production server with the production hostname before deploying:

```powershell
npm run start -w @kineticrouter/site -- --port 3001
# In a second terminal:
npm run check:seo -- --origin=http://localhost:3001 --host=kineticrouter.com --production
```

## Maintaining SEO

- `apps/site/data/seo.ts` defines page metadata and factual structured data.
  `seo-policy.mjs` defines the canonical aliases, utility paths, and production
  hosts. Update those rules when adding routes or making duplicate guides distinct.
- Keep the reference manifest unchanged; supplementary model records belong in `apps/site/data/catalog-additions.json`. Describe catalog prices as reference
  values; do not mark them up as purchasable offers or invent reviews/ratings.
- Only a maintained authored-guide update date becomes `dateModified`/`lastmod`.
  A provider check date, snapshot capture, model release, or build timestamp is
  not a content modification date. Update the authored-guide date when changing
  those guides substantively.
- Site preparation regenerates the documentation sitemap. With the current
  content there are 72 canonical pages, including 41 docs pages. Duplicate views
  remain usable but point to their primary page. Planned docs remain `noindex`.
- The existing hero images, local fonts, social images, visible copy, and styling
  are retained. Catalog props contain only displayed fields and selected prices;
  interactive controls are separate from static page content.
- Preview responses carry `X-Robots-Tag: noindex, follow`. Production must retain
  the custom domain's real request hostname through its hosting layer. Verify the
  response header on the live custom domain after deployment.

## Monitor after release

Check sitemap processing and Page Indexing for unexpected exclusions or errors.
Duplicate aliases and planned/private pages are intentional exclusions. Track
impressions, clicks, queries, and landing pages in Performance. Review Core Web
Vitals with real-user data; Google's good thresholds are LCP at most 2.5 seconds,
INP at most 200 milliseconds, and CLS at most 0.1 at the 75th percentile.

Validate the homepage and representative detail pages with Google's Rich Results
Test. Generic WebPage/TechArticle/CollectionPage markup does not itself create a
Google rich result. Indexing and rankings are determined by Google; neither a
sitemap nor valid structured data guarantees inclusion.

Sources: [verification](https://support.google.com/webmasters/answer/9008080),
[canonical URLs](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls),
[sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap),
[structured data](https://developers.google.com/search/docs/appearance/structured-data/sd-policies),
[Core Web Vitals](https://developers.google.com/search/docs/appearance/core-web-vitals),
[Google AI features](https://developers.google.com/search/docs/appearance/ai-features).
