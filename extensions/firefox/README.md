# FavLock for Firefox

An independent Firefox desktop extension with FavLock's Chrome design and workflows:
quick save and update, local bookmark search, Collections/tags/Lists, tab sessions,
Reader and encrypted Readspace captures, website highlights and annotations,
optional new-tab navigation, and direct Firefox bookmark import with preview.
A cloud account is required, matching the current Chrome extension. This is not
an offline-only library. Normal plan limits still apply.

## Independence

This directory owns all runtime source, images, styles, tests, build scripts,
configuration, package metadata, and its lockfile. It has no runtime dependencies
and does not import, symlink, bundle, or build from Chrome, Safari, dashboard,
or `packages/shared`. The initial visual and feature baseline was copied from
Chrome; subsequent changes are maintained independently. Firefox shares the app
and Chrome release version, currently **1.13.1**. Update its manifest, package
metadata, and separate lockfile with every app release. The build checks these
local versions and, when present, the app package version. A standalone copy can
still build using its own metadata; no app code is imported.

The hosted dashboard and API remain services used by both clients. Firefox has
its own dashboard pairing route and messaging modules. The encrypted wire format
and `/v1` API contracts remain compatible; no encrypted-format migration is needed.

## Build and install temporarily

Requires Node.js 22.12+ and Firefox desktop **142+**. From this directory:

```sh
npm ci --ignore-scripts
npm test
npm run build
npm run lint
```

Open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**,
and select `dist/production/manifest.json`. Temporary installs are removed when
Firefox closes. Open the toolbar extension, then choose **Connect FavLock**.
The dashboard changes described below must be deployed before production pairing.

`dist/favlock-firefox-v1.13.1-production.zip` is an unsigned submission artifact.
From the app repository root, `npm run build:firefox` also writes a versioned
copy to `dist/extensions/firefox/favlock-firefox-extension-v1.13.1.zip`. The Firefox
package remains responsible for building and packaging its own runtime files.
Normal permanent installation requires Mozilla signing; nothing here publishes
or signs an add-on. The proposed fixed ID is `firefox@favlock.app`; AMO uniqueness
is checked on first submission. If that ID must change, update the manifest,
Firefox build configuration, dashboard validator, API and backend validators together.
The per-install `moz-extension://<uuid>` origin is a different identifier.

## Local development

```sh
npm run build:development
```

From the app repository root, `npm run dev:firefox` writes
`dist/extensions/firefox/[dev]-favlock-firefox-extension-v1.13.1.zip`; it keeps the
production ZIP separate. Root `npm run test:firefox` runs this package's unit
tests. Root `npm run test:firefox-browser` builds the development fixture and
runs the native smoke test with the Python QA dependencies installed.

Load `dist/development/manifest.json`. Defaults are dashboard
`https://vault.favlock.localhost` and API `https://api.favlock.localhost`. To use different servers:

```sh
FIREFOX_DASHBOARD_URL=https://vault.favlock.localhost \
FIREFOX_API_URL=https://api.favlock.localhost npm run build:development
```

Only those two public URLs are read. Firefox does not read Chrome's generated
configuration or the app's environment files. Production URLs are fixed at
`https://vault.favlock.app` and `https://api.favlock.app`. Load a generated `dist`
manifest, not the source manifest; the build keeps CSP, host permissions, content
scripts and import origins aligned. `npm test` generates only its own ignored
fixture configuration.

## Browser and privacy boundaries

- Firefox uses an MV3 background module, the native `browser` API, and a dashboard
  content-script bridge. It does not use `externally_connectable` or service workers.
- Pairing checks the exact extension ID, dashboard origin, top frame, initiating
  tab, bounded payload, verified account, and a short-lived attempt consumed once
  before token exchange. The bridge exposes pairing and a minimal installation
  acknowledgment used to hide the dashboard install suggestion; the installation
  check returns no account, session, or library data.
- Keys stay as non-extractable Web Crypto keys in extension IndexedDB. Session
  credentials remain in the extension's local storage, matching Chrome. Raw pairing
  keys are never written to extension storage. Explicit disconnect clears credentials,
  keys and pending pairing state; temporary cloud errors preserve the local key.
- Protected content is encrypted before the API request. Account/session identifiers,
  relationships and operational metadata are still visible to the service.
- API and dashboard host access are required. Bookmark-tree permission is requested
  only from the import button; website access is requested per site for highlights.
  Bookmark access is mediated by the background script because Firefox restricts
  APIs in embedded extension pages. The import iframe validates its parent origin
  and response correlation; the
  dashboard previews imports before any writes. Reader content is allowlisted and
  bounded again on render.
- New-tab navigation is off by default and can be enabled in extension settings.
  Browser-internal/restricted pages cannot be captured or highlighted.
- Mozilla's required data consent lists authentication, bookmarks, browsing activity,
  website content and website activity used for the requested cloud features. There
  is no analytics SDK, remote executable code, or new telemetry.
- Desktop Firefox is the target. Android is not declared or validated.

## Native browser regression

Install Mozilla's test driver in an isolated Python environment, then run:

```sh
python3 -m venv /tmp/favlock-firefox-qa
/tmp/favlock-firefox-qa/bin/pip install -r scripts/requirements-qa.txt
npm run build:development
FIREFOX_BINARY=/Applications/Firefox.app/Contents/MacOS/firefox \
/tmp/favlock-firefox-qa/bin/python scripts/test-firefox-browser.py
```

The test launches a disposable profile and local fake API/dashboard fixture. It
never uses a real account. It exercises background messaging, pairing, encrypted
writes, bookmark-import permission denial, settings, new-tab navigation and
disconnect. Screenshots go to ignored `dist/qa/`. Browser permission prompts,
AMO signing/review and live cloud workflows still need release QA.

## Deployment order

1. Deploy backend `create-extension-session` with exact Firefox ID support.
2. Deploy the API schema accepting that ID alongside existing Chrome IDs.
3. Deploy the dashboard `/extension/firefox/pair` and Firefox import controls.
4. Smoke-test a real account, then submit/sign the independently built Firefox ZIP.

No database migration is required. Existing Chrome source, build and IDs are
unchanged. Rollback can remove the Firefox client; the additive server validators
can stay deployed without affecting Chrome.

## Validation on this branch

- Firefox: 97 tests; development and production ZIPs; Mozilla `web-ext lint` with
  zero errors/warnings; standalone build without other repository components.
- Native Firefox 156.0.1: disposable-profile pairing, encryption before bookmark
  and article writes, import permission denial, popup/settings, new-tab redirect,
  and disconnect passed. Desktop and narrow settings screenshots were inspected.
- Dashboard tests, lint and build; Chrome tests, headless highlight regression and
  packaging; API tests/lint/typecheck/build; backend tests; npm audits and Git
  whitespace checks passed. The dashboard retains its existing large-chunk warning.
- Unverified release gates: live-account end-to-end workflows, permission-approval
  prompts, Firefox 142 minimum-version runtime, AMO ID availability/signing/review.
  No deployment, commit, push or store submission was performed.

Mozilla references: [background modules](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background),
[match patterns and port limitations](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Match_patterns),
[required data consent](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/).
