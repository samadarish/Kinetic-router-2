# Documentation image audit

Source: [Hao.ai documentation](https://hao.ai/docs/en). Checked September 5, 2026.

All 57 documentation routes were compared with the source pages. The 23 pages
below contain 105 images; all 105 were downloaded. Each image was visually
inspected. The 73 images containing Chinese UI text were localized into English
using ImageGen. A subsequent branding pass replaced source-provider names,
addresses and logos in 50 images across 17 pages with kineticRouter equivalents.
The other 55 images were visually rechecked and did not need branding edits.
All 105 images remain included in the repository.

## Website screenshot provenance

The [Claude Code model-provider guide](https://kineticrouter.com/docs/integrations/claude-code/model-provider)
contains these two images derived from the source site's interface:

- `05-filter-anthropic-protocol-in-model-plaza.webp`: the Models webpage. Its
  header now uses the supplied kineticRouter wordmark, and its four pricing
  column headings use kineticRouter branding.
- `06-copy-model-name-with-one-click.webp`: a cropped model card from the source
  guide. It does not display a literal Hao.ai name or URL, but it shows that
  site's interface and example pricing.

No other image was found to depict the source website itself. These are edited
illustrations, not captures of the current kineticRouter website. Rebranding a
reference screenshot does not verify its example prices, models or third-party
UI against the current kineticRouter service. Users should
follow the kineticRouter endpoints and availability described in the surrounding
documentation text.

## Pages with rebranded screenshots

The first translation pass preserved source-provider names and URLs. The later
branding pass supersedes that decision: every visible occurrence identified in
the image audit has now been replaced. The numbers below refer to filename
prefixes within each page's asset folder. Source attribution in this maintainer
report is historical provenance, not public UI copy.

| Documentation page | Rebranded images | Updated content |
| --- | --- | --- |
| [Claude Code model provider](https://kineticrouter.com/docs/integrations/claude-code/model-provider) | 02, 03, 05, 07 | CC Switch provider fields, actual Models website, terminal base URL |
| [Claude Coworks](https://kineticrouter.com/docs/integrations/claude-coworks) | 04 | Claude Gateway base URL |
| [Codex installation](https://kineticrouter.com/docs/integrations/codex/installation) | 02 | Terminal base URL |
| [Codex model provider](https://kineticrouter.com/docs/integrations/codex/model-provider) | 02, 03 | CC Switch provider fields and configuration |
| [CC-Switch](https://kineticrouter.com/docs/integrations/cc-switch) | 01 | Provider name, website and API URL |
| [Cherry Studio](https://kineticrouter.com/docs/integrations/cherry-studio) | All except 01 | Custom provider names and API configuration |
| [GitHub Copilot](https://kineticrouter.com/docs/integrations/copilot) | 02–07 | OAI Compatible provider IDs and API URLs |
| [Zed](https://kineticrouter.com/docs/integrations/zed) | 01–03 | Provider list, name and API URL |
| [Cline](https://kineticrouter.com/docs/integrations/cline) | 03 | Base URL |
| [LangChain](https://kineticrouter.com/docs/integrations/langchain) | 02 | API URL in code |
| [BotGem](https://kineticrouter.com/docs/integrations/botgem) | 04, 05 | API URL |
| [Chatbox](https://kineticrouter.com/docs/integrations/chatbox) | 03–11, including the three mobile screenshots | Provider names and API URLs |
| [WorkBuddy](https://kineticrouter.com/docs/integrations/workbuddy) | 03 | Model configuration |
| [LobeHub](https://kineticrouter.com/docs/integrations/lobehub) | 03 | Service-provider API URL |
| [OpenCat](https://kineticrouter.com/docs/integrations/opencat) | 03, 04 | API URL |
| [NextChat](https://kineticrouter.com/docs/integrations/nextchat) | 02 | Provider/API configuration |
| [Immersive Translate](https://kineticrouter.com/docs/integrations/immersive-translate) | 03 | API URL |

50 images across these 17 pages were updated and visually reviewed.
The additional cropped model card described above has no literal source branding.

### Branding replacements

Replacement values were checked against `packages/platform-config/src/brand.ts`,
`origins.ts` and `provider-registry.json`:

- Display name: `kineticRouter`; custom provider IDs: `kineticrouter`, preserving
  existing suffixes such as `_chat`, `_response`, `_claude`, `-claude` and `-codex`.
- Website: `https://kineticrouter.com`.
- API host: `https://api.kineticrouter.com`, preserving the pictured endpoint path,
  including `/v1`, `/anthropic` and derived request URLs.
- API-key console links, where present: `https://console.kineticrouter.com/api-keys`.
- Any provider-specific key placeholder uses `KINETICROUTER_API_KEY`; generic
  `YOUR_API_KEY` placeholders and masked fields remain unchanged.

Only text actually present in an image was replaced; no new settings, website
fields or installer routes were added. Provider availability was not changed by
this work. In particular, a setup illustration does not make a planned protocol
available.

## Complete asset inventory

Paths are relative to `apps/site/public/docs-assets/`.

| Folder | Images | Images containing Chinese in the original |
| --- | ---: | ---: |
| `api/openai/images` | 3 | 0 |
| `integrations/claude-code` (direct files) | 1 | 0 |
| `integrations/claude-code/model-provider` | 7 | 4 |
| `integrations/claude-code/contextline` | 1 | 1 |
| `integrations/claude-code/skills` | 3 | 0 |
| `integrations/claude-coworks` | 7 | 3 |
| `integrations/codex/installation` | 2 | 1 |
| `integrations/codex/model-provider` | 4 | 3 |
| `integrations/cc-switch` | 1 | 1 |
| `integrations/opencode` | 2 | 1 |
| `integrations/cherry-studio` | 14 | 14 |
| `integrations/copilot` | 7 | 0 |
| `integrations/zed` | 5 | 1 |
| `integrations/cline` | 3 | 1 |
| `integrations/langchain` | 2 | 1 |
| `integrations/llamaindex` | 2 | 1 |
| `integrations/botgem` | 6 | 6 |
| `integrations/chatbox` | 11 | 11 |
| `integrations/workbuddy` | 5 | 5 |
| `integrations/lobehub` | 4 | 4 |
| `integrations/opencat` | 5 | 5 |
| `integrations/nextchat` | 5 | 5 |
| `integrations/immersive-translate` | 5 | 5 |
| **Total** | **105** | **73** |

## Translation and maintenance

The built-in ImageGen tool is used for screenshot text localization. The prompt
set uses this common specification, with image-specific English translations:

> Translate all visible Chinese text into natural English. Preserve the original
> screenshot's full framing, layout, colors, icons, annotations, existing English,
> numbers, model identifiers, code structure, provider names and URLs. Change only
> the Chinese text, using crisp UI typography matching the original. Do not invent
> controls, remove content or crop the image. Replace any unmasked API key with
> YOUR_API_KEY. Preserve already masked key fields.

The follow-up branding edits used built-in ImageGen with per-image visible text
pairs and this common specification:

> Edit this existing documentation screenshot, not its overall design. Replace
> only the visible source-provider names and URLs listed for this image with the
> specified kineticRouter display name, identifier or URL. Preserve exact endpoint
> suffixes, model identifiers, code structure, numbers, settings, masked keys,
> third-party logos, annotations and instructional arrows. Keep the full framing
> and readable UI typography. Do not invent fields, routes or credentials. Where
> the source website logo appears, use the supplied kineticRouter wordmark.

These are localized reference screenshots, not newly captured application
screens. Text can reflow slightly, and some generated icons or spacing differ
from the originals. Instructional controls, model identifiers, masked keys and
configuration URLs were checked during review. Chinese characters that belong
to an original brand logo or decorative icon remain part of that artwork.

In Cherry Studio image 16, the translated model-test dialog is slightly wider
to cover a previously half-obscured background provider-name fragment. The
model selection, URLs, buttons and numbered instructional arrows are preserved.

`integrations/langchain/02-run-result.webp` contains an unmasked API-key-like value
in the original. Its edited version replaces that value with `YOUR_API_KEY`.
The original value is intentionally not included in this report.

Runtime images live in `apps/site/public/docs-assets/` and the source-to-local map
is `apps/site/data/documentation-images.json`. All runtime images belong in Git;
no screenshot asset is added to `.gitignore`. Normal builds require neither
Hao.ai network access nor ImageGen. The build copies the already-reviewed files.
Each manifest entry includes a 12-character SHA-256 revision. Both inline images
and full-size links include that revision as `?v=...`, so a changed screenshot
does not reuse an old browser or CDN cache entry.

`node scripts/sync-docs-images.mjs` imports source images using the download cache
and checks source-page image counts. Add `--refresh` to fetch fresh source pages
and originals; this does not overwrite reviewed public assets.
`node scripts/prepare-docs-images.mjs` copies missing
images and regenerates the local map. It preserves existing reviewed images.
Optional JSON mapping arguments explicitly replace selected files with inspected
ImageGen outputs; the map keys are original cache paths and values are absolute
generated-image paths. Generated outputs are converted to high-quality WebP for
delivery. The original reference-content snapshot is preserved.

## Verification

- All 105 image references resolve to local files with verified dimensions and
  content revisions.
- The 50 selected images changed; the other 55 match the pre-rebranding backup.
- All 23 image-bearing documentation routes and 105 image URLs returned HTTP 200.
- Four screenshot regression tests and seven existing public-site tests passed.
- Site type checking, lint, content checks, branding checks and production build passed.
- The production output contains all 105 images. No new ignore rules were added.

Visual review covered the image assets; page verification used HTTP and code
checks rather than a full browser visual regression suite. Mobile screenshots
retain their authored thumbnail widths, with full-size viewing available.
