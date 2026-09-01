# kineticRouter public site

The public landing page, documentation, legal pages, model reference catalog, and console redirects for `kineticrouter.com`.

Run it from the monorepo root:

```powershell
npm run dev:site
npm run build:site
```

Provider display state is controlled by the canonical registry at `packages/platform-config/src/provider-registry.json`. It is display-only; real provider availability is configured and validated in the original Sub2API administrator interface.

Authentication, API keys, usage, billing, and account data live in `apps/console` and `apps/bff`. `/account/sign-in` safely redirects to the console, preserving only allowlisted console return paths.
