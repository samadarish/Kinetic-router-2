# Catalog updates

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
and environment-held API key. Native Anthropic access is not claimed because
that kineticRouter route is still marked planned. Model/tool access is still
controlled by the deployed gateway and account configuration.

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
text/image input, text output, and standard rates. Native Anthropic availability
on kineticRouter remains planned; the new page preserves that reference status.

The combined catalog now contains 22 models and 208 active price rows. The
homepage selects the newest captured chat model per provider by release date:
Claude Fable 5.1, GPT-6 Astra, and Grok 4.6. Each card uses its catalog record for
prices and its detail-page link. The existing three-card layout and styling remain
unchanged. Grok 4.6 is still the newest xAI entry in the owner's catalog.
