# FavLock app

FavLock is an encrypted private library for bookmarks, notes, tasks, and saved
articles. This repository contains the user-facing dashboard and browser
extension source code.

The hosted backend, marketing website, and internal administration tools are
maintained in private repositories. This repository is therefore not a complete
self-hosted FavLock service.

## Structure

- `dashboard` — React and Vite dashboard
- `extensions/chrome` — Chrome Manifest V3 extension
- `packages/shared` — shared code used inside this repository
- `scripts` — extension configuration and packaging tools

## Development

Development requires Node.js 22.12 or newer and npm. Install dependencies and
create the dashboard environment file:

```sh
npm install
cp .env.example .env.local
npm run dev
```

Fill `.env.local` with the public configuration for the FavLock environment you
want to use. The dashboard and extensions share this root configuration.
`VITE_AUTH_URL` is the existing HTTPS Auth origin used only for interactive
authorization. It may be the project's default Auth URL; a custom domain is an
optional branding improvement described in
[CUSTOM_AUTH_DOMAIN.md](CUSTOM_AUTH_DOMAIN.md).
Local development runs at `http://localhost:4177`. The server deliberately
stops if that port is in use, rather than silently selecting a different port.

To configure the Chrome extension for local development, run:

```sh
npm run dev:chrome
```

Then open `chrome://extensions`, enable Developer mode, and choose
**Load unpacked**. Select the `extensions/chrome` directory.

Run validation with:

```sh
npm test
npm run lint
npm run build
npm run build:chrome
```

The Chrome Web Store ZIP is written to `dist/extensions/chrome`.
Production extension packaging always uses `https://api.favlock.app` and the
generated production manifest allowlists exactly that API origin for extension
fetches. Extension connection opens the protected FavLock dashboard pairing
route, which reuses an existing dashboard login or asks the user to sign in
before issuing an extension-bound one-time session.

## Backend boundary

FavLock clients are migrating incrementally to the hosted FavLock API. The
dashboard account-plan, billing-subscription, resource-usage, account-settings,
encryption-verifier, passkey-wrapped-key, and Trash read/restore/permanent-delete
operations plus the library-content revision feed and its encrypted
entry/folder/tag cache and encryption-recovery sample reads, and all Note,
Todo, and Readspace entry writes, Collection management (including
import-created Collections), Tag rename/delete, and bookmark create, organize,
Trash, favorite, move, import-write, duplicate-cleanup, encrypted snapshot,
changed-row resolution, revision-feed, and encrypted List read/write,
completion, membership, and ordering operations use `VITE_API_URL`.
Bookmark screens, export, and duplicate/import review read the synchronized
IndexedDB cache; import limits and the sidebar List count reuse API account
usage. Cloud search-history reads, replacement, and deletion also use the API;
Local and Off history modes remain browser-only and disabled respectively.
Encrypted `.favlock` exports use the existing account recovery key and are
created in the browser. Import decrypts and validates them locally, preserves
that key as the new account's encryption key, and sends only ciphertext plus an
opaque verifier through the staged atomic migration API.
The matching self-contained offline decryptor can produce plaintext JSON with
no network connection. Migration requires an empty destination library and
covers Collections, Tags, bookmarks, Notes, Tasks, and Readspace, but not
account identity, billing, Trash, search history, Lists, or passkeys. Temporary
destination search history is cleared, and a passkey must be created again for
the migrated account.
No direct Supabase table or RPC data calls remain in the dashboard. Email signup,
signup-confirmation resend, and password-reset-email delivery preserve the
browser's PKCE flow but now use `VITE_API_URL`. Password sign-in, token
exchange/refresh, verified-user fetch, password update, and global logout also
use `VITE_API_URL`. A provider-neutral FavLock Auth client uses Web Crypto for
PKCE, validates callback redirects, rotates sessions through the API, and
synchronizes sessions between tabs. The dashboard no longer bundles the
Supabase JavaScript SDK or a provider publishable key. Extension-session token
creation also uses `VITE_API_URL` and
returns only the existing one-time token. Realtime table subscriptions have
been removed; visible and online dashboards revalidate the existing revision
API routes roughly once per minute and immediately on focus or reconnect.
Google OAuth authorization retains the established Supabase Auth PKCE behavior
and uses the configured `VITE_AUTH_URL` in production.
The Chrome extension now uses `VITE_API_URL` for Quick Save, saved-page detection,
Collections, Tags, Lists, tab-session data operations, PKCE exchange, one-time
email-token verification, session refresh, and verified-user lookup. Its
generated configuration no longer includes the provider publishable key, and
Google OAuth authorization navigates through the configured Auth URL.
New Tags created inside existing relation-aware writes flow through the API,
and the extension also uses the API's explicit encrypted create-Tag route.
Encryption, passkey operations, and Trash preview decryption remain
browser-side. Trash list data still comes from the local IndexedDB library
cache, but full and changed
Trash rows are fetched through the API and commands never send a client-supplied
user ID. Service-role credentials and private backend implementation are not
part of this repository.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) for development, naming, Git workflow,
testing, security, and review conventions. AI agents and automated coding tools
must also follow [AGENTS.md](AGENTS.md).

Report suspected vulnerabilities privately using [SECURITY.md](SECURITY.md).

## License

FavLock is available under the [MIT License](LICENSE).
