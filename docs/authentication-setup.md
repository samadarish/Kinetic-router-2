# Email verification and Google sign-in

The code supports verified email signup through Brevo SMTP and Google sign-in through the existing Sub2API identity service. Existing users, balances, API keys, and password sign-in stay in that service. No Firebase project, extra user database, browser Google SDK, or Brevo API integration is needed.

**Activation is still required.** The Google Cloud project `kineticrouter-auth` (display name `kineticRouter Authentication`) was created on 2026-09-11. Google Auth Platform configuration and branding are saved: app name `kineticRouter`, External audience in Testing, approved support/contact email, public homepage/privacy/terms links, and authorized domain `kineticrouter.com`. The owner approved and accepted the Google API Services User Data Policy through the setup workflow. The `kineticRouter Console` Web application client is created with the production BFF callback below and only the basic OpenID, email, and profile scopes. Its client ID, client secret, backend callback, and frontend response marker are saved in the server's private Google settings; persistence was verified after reloading the settings page. Brevo domain authentication, verified sender, phone verification, and SMTP credentials are configured; Brevo confirmed delivery of one authorized SMTP test email. Native registration, email verification, and Google sign-in remain disabled, and both portal switches default to `false`. The actual verification-code registration flow and Google login have not been tested end to end. Production returned `404` for the new authentication endpoints during setup, so deploy the updated BFF and console before enabling these flows.

## 1. Set up Brevo

**Setup status, 2026-09-11:** Brevo confirms `kineticrouter.com` is authenticated and `kineticRouter <no-reply@kineticrouter.com>` is a verified sender. The Brevo ownership TXT record, two DKIM CNAME records (DNS only), and DMARC TXT record were added in Cloudflare; all four matched in Brevo's verification check. Existing website records were preserved. After the owner completed phone verification, the dedicated standard SMTP key `kineticRouter verification SMTP` was created and saved in the server's private SMTP settings, alongside the host, port 587, account-specific SMTP login, sender address/name, and TLS enabled. Following a server-settings reload, one `[kineticRouter] Test Email` was sent to the owner-approved recipient; Brevo's logs confirmed **Sent** and **Delivered** at 20:19 (account time). This verifies SMTP delivery using the saved settings, not the complete registration-code flow. Native registration and email verification were confirmed disabled after a final reload.

The SMTP key expires on **2027-09-11**; Brevo also expires keys after 90 days of inactivity. Rotate it in [Brevo's SMTP settings](https://app.brevo.com/settings/keys/smtp) and update the server's private SMTP password before expiry. Credentials are not stored in this repository. [Domain authentication instructions](https://help.brevo.com/hc/en-us/articles/12163873383186-Authenticate-your-domain-with-Brevo-Brevo-code-DKIM-DMARC), [SMTP key instructions](https://help.brevo.com/hc/en-us/articles/7959631848850-Create-and-manage-your-SMTP-keys)

In the existing Sub2API administrator settings, configure:

| Setting | Value |
| --- | --- |
| `smtp_host` | `smtp-relay.brevo.com` |
| `smtp_port` | `587` |
| `smtp_username` | Exact **SMTP login** shown in your Brevo account |
| `smtp_password` | A Brevo **SMTP key** |
| `smtp_from_email` | `no-reply@kineticrouter.com` (verified sender) |
| `smtp_from_name` | `kineticRouter` |
| `smtp_use_tls` | `true` |
| `registration_enabled` | `true` |
| `email_verify_enabled` | `true` |

Use an SMTP key, not a REST API key. Sub2API sends its own verification-code template over SMTP; a Brevo automation is unnecessary. Port 587 uses STARTTLS in the pinned backend; port 465 with TLS enabled is an alternative if your server blocks 587. [Brevo SMTP setup](https://help.brevo.com/hc/en-us/articles/7924908994450-Send-transactional-emails-using-Brevo-SMTP), [SMTP ports](https://help.brevo.com/hc/en-us/articles/10905415650322-Which-SMTP-port-should-I-use-Port-587-465-or-2525)

The current Brevo Free plan allows 300 email sends per day. Overflow can delay transactional mail, so monitor the quota: a delayed verification code may expire before arrival. [Brevo Free plan limits](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan)

Brevo's Free-plan documentation says sent emails include a "Sent with Brevo" sticker. The native verification template uses the `kineticRouter` site name and has no Brevo logo. Brevo's stored preview of the delivered SMTP test showed kineticRouter content without a Brevo footer in its text; the final Gmail rendering has not been inspected. Check the received message before promising logo-free delivery on this plan. [Brevo branding limits](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan)

### Branded verification email

On 2026-09-11, the English **Email Verification Code** template (`auth.verify_code`, locale `en`) was customized in the live server's **Settings → Email → Email Templates**. The subject is **Verify your email · kineticRouter**, and the source is [verification.en.html](../deploy/email-templates/verification.en.html). Saving and persistence after reload were verified, and the backend preview correctly rendered the sample code and expiry. The existing BFF explicitly sends `Accept-Language: en`, so console verification requests select this English override.

The template matches the website's charcoal background, cream text, cyan accents, and public kineticRouter PNG wordmark. It uses inline styles and a table layout with mobile sizing; the code remains selectable text. The only placeholders are `{{verification_code}}` and `{{expires_in_minutes}}`, which the native server supplies. Keep these placeholders when copying the source into the editor, then use **Preview / Refresh** and **Save Template**. This server-stored customization does not require a website deployment. Other events and locales retain their existing templates; **Restore Official** rolls back the selected event/locale.

For a local desktop/mobile design preview, run `node deploy/email-templates/preview.mjs` from the repository root and open `http://127.0.0.1:5175`. Its sample values are separate from the production template. Browser previews have been checked. On 2026-09-11, one owner-authorized design test was sent to the approved Gmail recipient from `no-reply@kineticrouter.com`; Brevo recorded **Sent** and **Delivered** at 20:55 (account time), with subject **Verify your email · kineticRouter**. The test used the same design with sample code `123456` and a test-only footer, through the inactive Brevo template `kineticRouter verification — design test` (ID `1`). The recipient was added to Brevo's test list and was the only selected recipient. This verifies design-test delivery; final inbox rendering awaits owner review, and the actual signup-code flow remains untested. The live server template retains dynamic placeholders.

The administrator's **Send Test Email** action sends a separate, hardcoded SMTP diagnostic with subject `[kineticRouter] Test Email`. Customizing verification emails does not alter that connection-test message. Check the real verification flow after activation to validate the customer email. [Native SMTP test handler](https://github.com/Wei-Shaw/sub2api/blob/v0.2.4/backend/internal/handler/admin/setting_handler_email.go), [native template renderer](https://github.com/Wei-Shaw/sub2api/blob/v0.2.4/backend/internal/service/notification_email_service.go)

## 2. Set up Google

Create a project in [Google Cloud Console](https://console.cloud.google.com/), then configure Google Auth Platform:

1. Branding: app name `kineticRouter`, your support/contact email, authorized domain `kineticrouter.com`, homepage `https://kineticrouter.com`, privacy `https://kineticrouter.com/privacy`, and terms `https://kineticrouter.com/terms-of-service`.
2. Audience: External, for public customers. Complete Google's publishing/branding requirements before launch.
3. Data access: only `openid`, `email`, and `profile`.
4. Clients: create an OAuth client of type **Web application**.
5. Authorized redirect URI: `https://console.kineticrouter.com/portal/v1/auth/google/callback` (exactly, without a trailing slash). This server redirect flow does not need JavaScript origins.

[Google client setup](https://support.google.com/cloud/answer/15549257?hl=en), [branding and domains](https://support.google.com/cloud/answer/15549049?hl=en), [web server OAuth and exact redirect matching](https://developers.google.com/identity/protocols/oauth2/web-server)

In Sub2API administrator settings, configure:

| Setting | Value |
| --- | --- |
| `google_oauth_enabled` | `true` |
| `google_oauth_client_id` | The new Web application client ID |
| `google_oauth_client_secret` | Its client secret |
| `google_oauth_redirect_url` | `https://console.kineticrouter.com/portal/v1/auth/google/callback` |
| `google_oauth_frontend_redirect_url` | `https://console.kineticrouter.com/portal/v1/auth/google/result` |

Keep the standard Google authorization, token, user-info endpoints and basic scopes. The `/google/result` URL is a server-side response marker: the BFF consumes the native redirect and never navigates the browser there. Google client secrets and SMTP credentials belong in Sub2API's private administrator settings, never in Vite/Next public variables, Git, or chat.

Google login must now start from the customer console. The global callback setting means Google login started from the original Sub2API frontend will lack the portal transaction cookie and fail. Keep the original administrator password sign-in available.

## 3. Deploy and activate

Build and deploy the code to your server using the existing deployment process. In `deploy/.env`, set these independently after their provider configuration is ready:

```dotenv
ENABLE_EMAIL_SIGNUP=true
ENABLE_GOOGLE_SIGNIN=true
```

Recreate the BFF container to load changed environment variables. Redis remains required in production and stores encrypted, ten-minute Google transactions alongside the existing encrypted portal sessions. Ensure `PORTAL_ORIGIN` is exactly `https://console.kineticrouter.com` and that `/portal/*` is proxied unchanged to the BFF.

Apply the updated Caddy snippet (Caddy 2.8+) and validate your complete configuration before reload. It excludes the Google callback from access logs so authorization codes are not recorded. Apply equivalent query-string redaction at any additional proxy/CDN and the native API callback. Do not enable request-body or cookie logging for authentication endpoints. [Caddy log exclusion](https://caddyserver.com/docs/caddyfile/directives/log_skip)

Public settings are cached for up to 60 seconds. `/portal/v1/auth/options` reports which flows the portal can offer. Email signup requires both native registration and email verification enabled. Google sign-in for existing accounts does not require open registration; first-time accounts still follow the native registration policy.

## 4. Verify activation

1. Visit `/sign-up` on the console with a fresh email address. Request the code, check the actual inbox, enter the six digits, and confirm account creation and the dashboard.
2. Verify incorrect/expired codes cannot create an account; confirm resend waits at least 60 seconds. Native codes expire after 15 minutes and permit five failed attempts.
3. Test Google with an existing account, then a new Google account. New Google users choose a password before their account is created; their verified email cannot be edited. Invitation codes appear when required by native settings.
4. Cancel Google login and retry. Confirm sign-out and existing password/TOTP login still work.
5. Check browser storage and redirects contain no native access or refresh tokens. Test only accounts you control and never share a captured callback URL.

If account creation succeeds upstream but session setup fails, sign in normally instead of resubmitting registration. Turning either BFF switch back to `false` disables that portal flow; native registration/Google settings govern the original API independently.

## Compatibility and authentication policy

This integration targets [Sub2API 0.1.183](compatibility/sub2api-0.1.183.md), commit `e8cb019fabf8b55199436229044cbf9aa7a82564`. It delegates Google code exchange, verified identity checks, and account linking to native Sub2API. The BFF binds the transaction to a host-only HttpOnly cookie, checks and consumes OAuth state, validates fixed redirect destinations, verifies the resulting native profile, and creates its usual encrypted session. It does not implement a separate Google identity-token validator.

During provider setup on 2026-09-11, the live administrator interface reported version `0.2.4`. A comparison against the official `v0.2.4` source found the email-verification and Google authentication contracts used here unchanged from the pinned baseline. This is a source compatibility review, not verification of the running server's image digest or an end-to-end sign-in test. [Sub2API v0.2.4 release](https://github.com/Wei-Shaw/sub2api/releases/tag/v0.2.4), [Google authentication handler](https://github.com/Wei-Shaw/sub2api/blob/v0.2.4/backend/internal/handler/auth_email_oauth.go)

Native Google login does **not** invoke Sub2API's password-login TOTP challenge. Google accounts follow Google's authentication policy; the portal preserves the native backend behavior. Consider this when enabling Google for accounts with local TOTP. [Pinned Google flow](https://github.com/Wei-Shaw/sub2api/blob/e8cb019fabf8b55199436229044cbf9aa7a82564/backend/internal/handler/auth_email_oauth.go), [native token issuance](https://github.com/Wei-Shaw/sub2api/blob/e8cb019fabf8b55199436229044cbf9aa7a82564/backend/internal/service/auth_email_oauth_auto.go)

CAPTCHA widgets are not implemented in this portal. Email signup fails closed if native Turnstile, Tencent, or Aliyun CAPTCHA is enabled; Google start fails closed for Tencent or Aliyun. Native Google start does not require a Turnstile-only proof. Do not disable an existing CAPTCHA policy to bypass this limitation; integrate its widget before activating the affected flow. [Pinned CAPTCHA checks](https://github.com/Wei-Shaw/sub2api/blob/e8cb019fabf8b55199436229044cbf9aa7a82564/backend/internal/service/auth_service.go)

Code validation uses mock native responses: `npm run test:portal` covers signup, rate limits, Origin checks, callback replay, redirect validation, pending registration, and token privacy. These checks cannot validate your future DNS records, SMTP delivery, Google project settings, or server proxy configuration.
