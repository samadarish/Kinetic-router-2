# Catalog updates

## Current public catalog - October 30, 2026

The public catalog contains 38 unique models across OpenAI, Anthropic, Grok,
DeepSeek, Zhipu, Moonshot, Gemini, and MiniMax. Meta is planned and has no active
models. The roster, lifecycle status, official price profiles, and provider
discounts are maintained in `packages/platform-config/src/model-catalog.json`.
The website adapter applies the provider multiplier to every matching official
component: Anthropic 0.15 (85% off); OpenAI, Moonshot, DeepSeek, and Zhipu 0.2
(80% off); Gemini 0.5 (50% off); Grok and MiniMax 0.1 (90% off).
Actual gateway billing is unchanged.

Added `moonshot/kimi-k3.1-pro` and `zhipu/glm-5.3-flash` using official price
and model metadata verified October 30, 2026. The other reference profiles retain
their October 18 verification date. Kimi K3.1 Pro is the default Moonshot choice;
the global default remains GPT-6 Astra. Only source-verified pricing components
are included; Kimi K3.1 Pro's maximum output remains unspecified.

Kimi K2.7 Code remains listed and selectable, with its existing URL and price
table. It is marked **Deprecated** throughout public model views and the shared
integration picker, using a red pill instead of a percentage-off badge. Its
prices follow the Moonshot multiplier. The catalog contains 37 active models
and one deprecated model.

Every active provider uses the OpenAI-compatible direct or CDN `/v1` base URL.
The dashboard selects exact provider/model IDs from the same shared inventory.
Gemini effort, thinking, agent, and tiered variants without separate official
rates use the named base model's pricing, as requested. DeepSeek headline prices
use peak rates; off-peak and long-context rates retain their own table rows.
Image output is priced per million image tokens, separately from text output.
Introductory Gemini 3.6-3.8 rates are dated through December 31, 2026.

Primary price references checked October 18, 2026:

- [OpenAI model documentation](https://developers.openai.com/api/docs/models)
- [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing/)
- [Zhipu pricing](https://docs.z.ai/guides/overview/pricing)
- [Kimi pricing](https://platform.kimi.ai/docs/pricing/chat)
- [Grok 4.7](https://docs.x.ai/developers/grok-4-7)
- [MiniMax pricing](https://platform.minimax.io/subscribe/token-plan?tab=api-enterprise)
- [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Google Cloud pricing](https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing)

The original August snapshot and September supplements below remain historical
records. They are excluded from active listings and model detail routes.
Run `npm run sync:model-inventory -w @kineticrouter/site` after roster changes.


## GPT-6 Astra

Added `openai/gpt-6-astra` from the owner's
[Hao.ai model page](https://hao.ai/models/openai/gpt-6-astra), captured September 11,
2026. Its public page's serialized model data supplies the exact reference price
values, including cache creation at **$1.875/M**, which the visible source table
rounds to $1.88/M. The record is stored separately in
`apps/site/data/catalog-additions.json`; the August 30 archive is unchanged.

| Component | Imported reference / 1M tokens | Official standard reference / 1M tokens |
| --- | ---: | ---: |
| Input | $1.50 | $10.00 |
| Output | $7.50 | $50.00 |
| Cache read | $0.15 | $1.00 |
| Cache creation | $1.875 | $12.50 |

[OpenAI's model documentation](https://developers.openai.com/api/docs/models/gpt-6-astra)
confirms the standard upstream rates, 1,050,000-token context, 128,000-token
maximum output, text/image input, and text output. The imported gateway record
has a 1,000,000-token input limit, displayed separately. Release date in the
source catalog: September 3, 2026.

The upstream documentation describes additional long-context and service-tier
pricing rules. This is a standard reference table, not a billing-engine change.
Actual account charges remain authoritative in the customer console.

The existing kineticRouter OpenAI-compatible examples use its own API base URL
and environment-held API key. Native Anthropic and dedicated Grok routes are
available through the shared provider registry. Model/tool access is controlled
by the deployed gateway and account configuration.

The initial Astra update brought the catalog to 21 models and 196 active reference price rows.
Astra appears first in the recommended listing, in OpenAI and chat catalogs, the
pricing comparison, its detail route, the sitemap, and the LLM inventories.
The homepage count updates from the server-side catalog. No other model's prices
or record were refreshed in this update.

## Claude Fable 5.1

Added `anthropic/claude-fable-5-1` from the owner's
[Hao.ai model page](https://hao.ai/models/anthropic/claude-fable-5-1), captured
September 11, 2026. The serialized record preserves cache-read pricing at
**$0.0625/M** and cache creation at **$3.125/M** instead of the rounded source display.

| Component | Imported reference / 1M tokens | Official standard reference / 1M tokens |
| --- | ---: | ---: |
| Input | $2.50 | $10.00 |
| Output | $12.50 | $50.00 |
| Cache read | $0.0625 | $0.25 |
| Cache creation / 5 minutes | $3.125 | $12.50 |
| Cache creation / 1 hour | $5.00 | $20.00 |

[Anthropic's model documentation](https://platform.claude.com/docs/en/models/fable-5-1/overview)
confirms the September 1 release, 1M-token context, 128K maximum output,
text/image input, text output, and standard rates. The page shows native
Anthropic access as Available while retaining the dated reference prices.

The combined catalog now contains 22 models and 208 active price rows. The
homepage selects the newest captured chat model per provider by release date:
Claude Fable 5.1, GPT-6 Astra, and Grok 4.6. Each card uses its catalog record for
prices and its detail-page link. The existing three-card layout and styling remain
unchanged. Grok 4.6 is still the newest xAI entry in the owner's catalog.
