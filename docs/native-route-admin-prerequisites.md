# Native provider route administration

The customer portal must not present an on/off control for the Anthropic-native or dedicated Grok routes until the installed Sub2API administrator contract is verified.

## Current boundary

- The public and customer UIs label the OpenAI-compatible route as **Available**.
- Anthropic-native and dedicated Grok routes are labeled **Planned**.
- Planned endpoints and request examples are visible only as reference material; their copy actions are disabled.
- The original Sub2API administrator interface remains the only supported place for provider and gateway configuration.

The display registry has one canonical source at `packages/platform-config/src/provider-registry.json`. From the repository root, run `npm run check:providers` after an operator has enabled and verified a route in Sub2API. Changing this display file does not enable a provider.

## Required before implementing a toggle

1. The pinned Sub2API backend/admin source for the deployed version.
2. The exact administrator method, path, request body, response schema, and authorization/CSRF behavior.
3. Confirmation of whether a setting applies immediately or requires a Sub2API or reverse-proxy reload.
4. The API-domain reverse-proxy configuration that owns the native provider paths.
5. A staging deployment and disposable administrator credential for mutation and rollback tests.
6. An audit-log and concurrency policy for configuration changes.

Do not infer an `enabled` value from a `401`, `403`, or HTML response. Those responses can prove only that something answered at a path, not that the native protocol adapter is correctly configured.
