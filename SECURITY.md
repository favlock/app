# Security

## Supported versions

Security fixes target the current released FavLock version and the latest code
on `main`. Update to the newest available release before reporting behavior that
may already be fixed.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability or include secrets,
account data, encryption keys, or customer content in a report.

Report security concerns privately to support@favlock.app with the affected
component, reproduction steps, and expected impact. FavLock will acknowledge
the report and coordinate disclosure after a fix is available.

Include only the minimum data needed to reproduce the issue. Use test accounts
and redact tokens, personal data, encrypted content, and key material.

## Secure development

Security-sensitive contributions must follow the privacy, encryption,
authentication, browser-message, dependency, and validation rules in
[CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md).

Do not use a public issue or pull request to disclose an unpatched vulnerability.

Dashboard signup, confirmation resend, and password-reset-email delivery send
only bounded email-flow fields, the Turnstile token, and the browser-generated
S256 PKCE challenge through the FavLock API. The PKCE verifier stays in browser
storage. The adapter must never forward the upstream API key, an arbitrary Auth
path, or an absolute redirect chosen by untrusted input.

Dashboard password sign-in, PKCE exchange, refresh, verified-user fetch,
password update, and global logout also pass through fixed FavLock API routes.
The dashboard uses a small provider-neutral Auth client instead of a provider
SDK or publishable key. It creates S256 PKCE material with Web Crypto, accepts
only same-dashboard redirects, validates bounded API responses, serializes
refresh with the Web Locks API where available, and synchronizes session
changes between tabs. Session and PKCE values remain browser-readable, so XSS
prevention remains essential; credentials and tokens must never be logged or
persisted by the API.

Extension-session token creation sends only the validated Chrome extension ID
and current bearer token to the FavLock API. The API verifies the user binding
and returns only the existing one-time token; the dashboard no longer invokes
the privileged Edge Function directly and never receives a service-role key.

Chrome extension PKCE exchange, one-time email-token verification, session
refresh, and verified-user lookup use only fixed FavLock API routes. Generated
extension configuration contains no provider publishable key, and the manifest
permits fetches only to the configured FavLock API origin. Google OAuth remains
an interactive navigation through the configured Supabase Auth origin and
must keep exact state, PKCE, and callback validation. Production configuration
rejects non-HTTPS URLs, credentials, paths, queries, and fragments. Google's
authorized redirect list must contain the exact callback shown by the Supabase
Google provider settings. A supported custom domain remains optional.

The dashboard opens no direct database Realtime channel. When visible and
online, it checks the existing provider-neutral revision routes at randomized
intervals and after focus, reconnect, or visibility changes. Hidden and offline
pages stop polling, event bursts are debounced, and teardown removes all timers
and listeners. Revision fetches retain the current user JWT and existing RLS;
no client-selected table, channel, filter, or event reaches the API.
