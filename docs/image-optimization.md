# Image delivery

Run `npm run optimize:images` after adding or replacing a finalized screenshot or
brand asset. It optimizes the images, updates screenshot revisions, synchronizes
shared files into both apps, and checks dimensions, budgets, hashes and alpha.
Run `npm run test:images` to check repeatability and transparent ICO generation.

The committed `scripts/image-optimization-manifest.json` records profiles and
output hashes. Unchanged outputs skip encoding, including lossy WebP and JPEG
files. Changing a master, a finalized public image or a profile invalidates the
corresponding entry. Local before-images for visual comparison live in the
ignored `.cache/image-optimization/before/` directory.

## Profiles

| Asset | Delivery format | Preservation |
| --- | --- | --- |
| Wordmarks and marks | Lossless WebP, PNG fallback | Same dimensions, exact alpha and visible pixels |
| River-delta hero | AVIF quality 60 at 640/1280/2062px, WebP quality 80 fallback | New filenames, original aspect ratio |
| Header symbols | Lossless 144×144 PNG, displayed at 36×36 | Supplied light/dark symbols, exact resized pixels and alpha |
| Screenshots | WebP quality 88, effort 6, smart subsampling | Original resolution, reviewed content and full-size links |
| Screenshots with alpha | Lossless WebP | Transparency retained |
| Favicons and app icons | Smallest transparent RGBA/palette PNG; 16/32/48px PNG frames in ICO | Original white-symbol source and 8% padding, transparent canvas |
| Existing opaque social poster | JPEG quality 85, progressive, 4:4:4 | Same poster and dimensions |

Recompressed PNG fallbacks, screenshots and JPEGs retain the current file if the
candidate is larger. Transparent icon generation replaces the old opaque tiles
even when a small icon grows slightly. Keep a reviewed original if visual
comparison reveals a readability regression; set its manifest `outputHash` to
the retained file's SHA-256 and `bytes` to its size to skip another encode with
the same profile.

Derived assets always regenerate when their master or profile changes, even if
the replacement is larger. The original river-delta PNG and all supplied logo
files remain available as authoring sources.

Source PNGs in `packages/brand-ui/assets/` and original artwork in `logog/` remain
authoring masters. Screenshot optimization uses the finalized files in
`apps/site/public/docs-assets/`, preserving reviewed translations and branding.
After running `prepare-docs-images.mjs`, run the optimizer to refresh the delivery
profiles and hashes.

## October 2, 2026 verification

- All 105 screenshot mappings, descriptions and dimensions were preserved; 104
  were smaller after encoding and one smaller original was retained.
- Screenshots across all pages: 9,807,870 to 8,151,772 bytes (16.9% less).
- Previous hero variants: 468,796 to 354,037 bytes (24.5% less).
- The replacement river-delta source is 2,906,368 bytes at 2062×763. Its largest
  AVIF is 243,956 bytes (91.6% smaller), with a 299,090-byte WebP fallback.
  Delivery variants use new filenames at 640, 1280, and 2062 pixels.
- Preferred logos: 27,558 to 23,370 bytes (15.2% less), with exact alpha and visible
  pixel equality against the PNGs.
- Repeat runs skipped all 127 managed images and left all 167 image/metadata
  output hashes identical.

These figures compare delivered formats. Keeping compatibility fallbacks adds
files to the repository; a browser selects one supported format. Documentation
totals cover all pages and are not the initial homepage download size. Earlier
hash comparisons in the documentation image audit predate delivery compression.
