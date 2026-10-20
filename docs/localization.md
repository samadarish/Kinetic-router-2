# Website and console languages

The header selector uses one browser preference across the public site and
console. Without a saved preference, the browser's primary language is selected
automatically; unsupported languages fall back to English. Regional variants
such as `fr-CA`, `pt-BR`, and `vi-VN` select the corresponding language.
Simplified Chinese variants select `zh-CN`; Traditional Chinese falls back to
English. The cookie
`kineticrouter-language` is shared with `kineticrouter.com` subdomains; local
storage is a fallback. Visible windows reconcile the cookie once a second and
on focus, visibility changes, and page restoration. No account or authentication
cookie is changed. Manual choices override browser detection on later visits.
Existing valid preferences, including English, are retained.

The display order is English, Español, Português, Bahasa Indonesia, Deutsch,
Français, Русский, 한국어, 日本語, 简体中文, and Tiếng Việt. Codes are `en`,
`es`, `pt`, `id`, `de`, `fr`, `ru`, `ko`, `ja`, `zh-CN`, and `vi`.

## Rendering and catalogs

`@kineticrouter/i18n` supplies typed shared messages, interpolation, plural forms,
and React context. The two app TypeScript configurations select its JSX runtime.
It translates native element text and accessible labels within React, preserving
event handlers, refs, form values, and React state. Router link text also uses the
context. It does not observe or rewrite the DOM. The shared UI package uses the
regular React runtime to avoid a dependency cycle.

Both document roots opt out of browser auto-translation. This prevents an
automatic translator from changing the selected language or rewriting server
HTML before React hydrates; the local catalogs still translate through React.

Use `OriginalText` or `translate="no"` for user-authored text and identifiers.
Code, preformatted examples, keyboard shortcuts, SVG, and math inherit a
preservation boundary. URL, value, ID, and other structural attributes are never
translated. React components can also use `useTranslations()` and the typed `t`
helper, or `text` for a source string.

Catalogs live in `packages/i18n/src/catalogs/<locale>`. UI catalogs are split into
`site` and `console`; documentation has one catalog per route. Source English is
the catalog key. Existing translations fall back to the original English when a
new key is unavailable. `npm run check:translations` identifies missing entries
and damaged interpolation parameters before release.

The public layout reads the locale cookie for each request, or the primary
`Accept-Language` preference when no valid cookie exists, and seeds the client
provider with that locale. The initial browser script and console startup use
the same language matcher. Preference-dependent HTML/RSC responses are dynamic;
content caches are keyed by locale and route. URLs and canonical links stay
unchanged. Documentation search explicitly requests
`/docs/search-index.json?locale=<code>`, so its public cache cannot mix languages.

## Generate translations locally

The app and its build have no translation-service dependency. Initial catalogs
were generated on the local machine with the MIT-licensed
[SMaLL-100 model](https://huggingface.co/alirezamsh/small100), using the pinned
[CTranslate2 INT8 conversion](https://huggingface.co/solavr/small100-ctranslate2-int8/tree/3c5af8e17d5c4f35bda849b7ffceaa1dfc62eb84).
Weights and optional Python/CUDA tools stay in the ignored `.cache` directory
and are not shipped with the website.

1. Run `npm run build:shared` and `node scripts/collect-translations.mjs`.
   Collection reads static application copy and the corrected English articles;
   it reads no environment files, credentials, live API payloads, or user data.
2. In a separate Python environment install `ctranslate2==4.8.3`,
   `sentencepiece==0.2.2`, and `opencc-python-reimplemented==0.1.7` from PyPI.
3. Download the pinned model's `config.json`, `model.bin`,
   `sentencepiece.bpe.model`, `shared_vocabulary.json`, and `SHA256SUMS` into a
   local model directory. Retain its LICENSE and NOTICE. Downloads are inbound;
   the generation script contains no network client or downloader.
4. Run `python scripts/generate-translations-local.py --model <directory>`.
   CUDA installations may add `--device cuda`. Model checksums are verified
   before inference. Interpolation parameters, endpoint URLs, and technical
   identifiers are protected. OpenCC ensures Simplified Chinese output.
   Use `--locales vi` to generate only Vietnamese without rewriting other languages.
5. Review the resulting machine translations, particularly legal and technical
   wording. Existing catalog edits take precedence when rerunning generation.
6. Run `npm run check:translations`, relevant tests, type checks, and both builds.

The generator stores resumable translation memory in `.cache`. Catalog JSON
files are the application artifacts; model downloads and generation
tools are optional maintenance dependencies only.
