# Kinetic Router UI reconstruction

Dark-first public Kinetic Router site reconstruction built with React, Vinext, Vite, and Tailwind CSS.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Checks

```bash
npm run lint
npm run build
```

Provider badges, protocol labels, endpoint examples, and copy gating are controlled by `data/provider-availability.json`. It is display-only: actual provider availability is configured in the original Sub2API administrator interface. After changing it, run `npm run sync:provider-availability` to update the checked-in portal copy, then `npm run check`.

The project includes the public homepage, marketing and legal pages, an exact 20-model Hao.ai reference snapshot, the 57-page English documentation tree, protected console redirects, recovered fonts and brand assets, sitemaps, and LLM exports.

`web/` is the public landing, documentation, and dated reference-catalog surface. Authentication, keys, usage, billing, and customer account data live in the connected Sub2API customer portal under `portal/`; `/account/sign-in` redirects there.
