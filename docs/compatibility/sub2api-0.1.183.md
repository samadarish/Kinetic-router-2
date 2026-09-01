# Supported Sub2API compatibility target

The customer portal is mapped to the verified kineticRouter Sub2API runtime below.

| Property | Verified value |
| --- | --- |
| Product | Official Sub2API |
| Version | `0.1.183` |
| Release date | 2026-08-25 |
| Commit | `e8cb019fabf8b55199436229044cbf9aa7a82564` |
| Image digest | `sha256:cff6bc3ed1a6eba7ea240bad8637cf12856161a4efb98be0882c2fa7aff371e3` |
| Customer API prefix | `/api/v1` |
| Inference API | `https://api.kineticrouter.com/v1` |

## Compatibility rules

- Raw upstream response handling stays inside `packages/sub2api-client`.
- The frontend consumes only the stable `/portal/v1` contract.
- Optional fields and disabled capabilities degrade to an empty or unavailable customer state.
- Read requests may be replayed once after a refresh-token rotation. Writes are never replayed automatically.
- A Sub2API upgrade must run the contract and read-only smoke tests before the production image changes.
- The original Sub2API frontend remains the operational fallback and the administrator interface.

## Runtime feature baseline

Registration, password reset, Google/OAuth, TOTP, passkeys, payment, subscription purchase, model plaza, affiliate, and user-visible request errors were disabled during discovery. Channel monitor v1 and promo-code history were enabled. Portal controls follow live public settings instead of assuming these flags remain constant.
