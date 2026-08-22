# Contributing to FavLock

Thank you for helping improve FavLock. This repository contains security- and
privacy-sensitive browser software, so contributions should be focused,
reviewable, and supported by evidence.

AI agents and automated coding tools must also follow
[AGENTS.md](AGENTS.md).

## Development setup

Requirements:

- Node.js 22.12 or newer;
- npm;
- Google Chrome or another Chromium browser for extension development;
- public FavLock development configuration values.

Install and configure the project:

```sh
npm install
cp .env.example .env.local
```

Fill `.env.local` with public development values. The dashboard and extensions
share this root configuration. Never place a service-role key, signing
credential, private token, or customer data in a browser-facing environment
variable.

Run the dashboard:

```sh
npm run dev
```

Configure the Chrome extension:

```sh
npm run dev:chrome
```

Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**,
and select `extensions/chrome`.

## Repository structure

- `dashboard` contains the React and Vite dashboard.
- `extensions/chrome` contains the Chrome Manifest V3 extension.
- `packages/shared` contains code used by more than one public client.
- `scripts` contains extension configuration and packaging tools.
- `docker` contains dashboard deployment configuration.

Keep backend, website, and administration code in their separate private
repositories.

## Development workflow

1. Start from an up-to-date `main` branch.
2. Create a short-lived branch for one focused change.
3. Inspect existing behavior and tests before editing.
4. Implement the smallest complete solution.
5. Add or update tests and documentation.
6. Run the checks required for the changed surface.
7. Review the complete diff for secrets, generated files, unrelated changes,
   accessibility regressions, and inaccurate public claims.
8. Open a pull request that explains the problem, solution, validation, and
   remaining risks.

`main` is the integration branch and should always remain releasable.
`production` contains the deployed release state. Prefer small pull requests
that can be reviewed and reverted independently.

## Naming conventions

Use clear domain language and preserve established FavLock capitalization:
FavLock, Collection, List, Readspace, Quick Save, and Chrome.

### Files and directories

- React components, providers, and error boundaries: `PascalCase.tsx`.
- Hooks: `useDescriptiveName.ts`.
- TypeScript utilities and domain modules: `camelCase.ts`.
- Tests: colocated `*.test.ts`, `*.test.tsx`, or `*.test.js`.
- Web workers: descriptive `camelCaseWorker.ts` names.
- Directories: lowercase; use kebab-case when multiple words are necessary.
- Generated files: include `.generated.` in the filename and add them to the
  appropriate ignore file.

### Code

- Components, classes, types, and interfaces: `PascalCase`.
- Functions, variables, object properties, and hooks: `camelCase`.
- Boolean values: begin with `is`, `has`, `can`, `should`, or `needs`.
- Event handlers: begin with `handle`; callback props begin with `on`.
- Module constants: `UPPER_SNAKE_CASE` when truly constant across the module.
- Database-shaped fields may retain backend `snake_case` at the boundary; map
  them deliberately rather than mixing conventions accidentally.
- Environment variables: `UPPER_SNAKE_CASE`; browser-visible dashboard values
  use the `VITE_` prefix.
- Extension message types and cross-context protocol constants:
  `FAVLOCK_UPPER_SNAKE_CASE`.
- Test names: describe observable behavior, not implementation details.

Avoid abbreviations unless they are established domain terms. Prefer names that
make units, ownership, and security sensitivity obvious.

## Commit conventions

Use Conventional Commit style:

```text
type(optional-scope): imperative summary
```

Allowed types:

- `feat` — a user-visible capability;
- `fix` — a defect or security correction;
- `docs` — documentation only;
- `refactor` — behavior-preserving restructuring;
- `perf` — measurable performance improvement;
- `test` — test-only work;
- `build` — build or packaging changes;
- `ci` — continuous-integration changes;
- `chore` — maintenance that fits no type above;
- `revert` — an explicit rollback.

Use a scope when it improves clarity, such as `dashboard`, `chrome`, `shared`,
`security`, or `release`.

Examples:

```text
feat(chrome): add encrypted quick-save tags
fix(security): reject unexpected pairing origins
docs: document local extension setup
build(chrome): package store assets from extensions directory
```

Keep the subject imperative, lowercase after the colon, and concise. Use the
body to explain motivation, compatibility, migration, and security consequences.
Reference an issue in the footer when applicable. Mark a breaking change with
`!` and a `BREAKING CHANGE:` footer.

Each commit should be atomic, buildable, and free of secrets, generated output,
debug logging, and unrelated formatting. Do not use vague messages such as
`updates`, `fix stuff`, or `WIP` in shared history.

## Branch naming strategy

Use lowercase kebab-case:

```text
type/short-description
```

Recommended prefixes:

- `feat/` for product work;
- `fix/` for defects;
- `security/` for non-sensitive security hardening;
- `docs/` for documentation;
- `refactor/` for structural work;
- `test/` for test infrastructure;
- `build/` or `ci/` for delivery tooling;
- `chore/` for maintenance;
- `release/vX.Y.Z` only when focused release preparation needs a branch before
  merging into `main`;
- `hotfix/short-description` for urgent production fixes.

Examples:

```text
feat/chrome-safari-import
fix/pairing-origin-validation
docs/contribution-workflow
release/v1.4.0
```

Include an issue number when useful, for example
`fix/123-pairing-timeout`. Codex-created branches use
`codex/type/short-description`.

Do not use personal names, spaces, uppercase letters, versionless `release`, or
long sentences. Never reuse a merged release or hotfix branch.

Coordinate unpatched vulnerabilities privately using `SECURITY.md`. Do not put
embargoed vulnerability details in a public branch name, commit, issue, or pull
request.

## Branch and merge strategy

FavLock uses this normal delivery flow:

```text
feature or fix branch -> main -> production -> Dokploy deployment
```

- branch normal work from `main`;
- keep branches short-lived and focused;
- regularly incorporate current `main` before final review;
- open a pull request instead of pushing feature work directly to `main`;
- require passing checks and resolved review comments before merging;
- delete the source branch after merging.

Use **squash merge** for normal feature, fix, documentation, refactor, test, and
maintenance pull requests. The squash commit must follow the commit convention.
This keeps `main` readable while allowing iterative branch commits.

To release:

- complete the version bump and relevant changelog entries on `main`;
- open a release pull request from `main` to `production`;
- require the full CI gate before merging;
- use a merge commit for the `main` to `production` release pull request so
  release ancestry remains explicit;
- let Dokploy deploy only after the merge updates `production`;
- tag the deployed `production` commit with `vX.Y.Z`.

A merge or push to `main` must never trigger a production deployment. Dokploy
must watch only the `production` branch.

For an urgent production correction:

1. Branch `hotfix/short-description` from `production`.
2. Make the smallest complete fix, including any required version and changelog
   updates.
3. Run the same required checks as a normal release.
4. Open and merge a pull request into `production`; do not push directly.
5. Let Dokploy deploy the updated `production` branch.
6. Open a pull request from `production` back to `main` immediately and use a
   merge commit so the fix cannot be lost from future releases.

Use **rebase** to update a private branch when it improves review clarity. Never
rebase or force-push `main`, `production`, a shared release branch, or another
contributor's branch. Use `--force-with-lease`, never plain `--force`, when
rewriting your own published branch is necessary and coordinated.

Protect both `main` and `production` with GitHub rulesets that require pull
requests and the CI quality check, and that block branch deletion and
force-pushes. Do not bypass security or compatibility checks because a fix is
urgent.

## Dashboard development practices

- Keep UI state local unless multiple distant consumers require shared state.
- Keep server state in the established query layer and preserve cache and sync
  invariants.
- Keep encryption, persistence, parsing, search, and synchronization logic out
  of presentation components.
- Render explicit loading, empty, failure, locked, offline, and permission
  states.
- Use semantic HTML before ARIA. Preserve keyboard navigation, focus handling,
  readable contrast, responsive layouts, and reduced motion.
- Avoid leaking protected values through URLs, analytics, browser history,
  console output, error reporting, or DOM attributes.
- Lazy-load large feature surfaces where it improves startup cost without
  introducing visible instability.
- Preserve backward compatibility with deployed backend APIs.

## Browser-extension practices

- Follow Manifest V3 and Chrome Web Store policies.
- Request only permissions required by a shipped feature and document why each
  sensitive permission is needed.
- Use `chrome.runtime.id` inside the extension. Treat configured production and
  development extension IDs as public routing identifiers.
- Validate external messages and origins; do not trust an ID alone.
- Keep content-script access narrow and avoid running on pages unnecessarily.
- Do not use remotely hosted executable code, `eval`, or dynamic code injection.
- Keep generated environment configuration out of Git.
- Test service-worker lifecycle behavior, missing permissions, locked state,
  expired sessions, malformed messages, and unavailable tabs.
- Ensure store listing language and screenshots match the submitted build.

## Shared-code practices

Move code into `packages/shared` only when at least two public clients need the
same domain behavior or contract. Shared code must remain browser-safe and must
not depend on dashboard-only UI, extension APIs, private backend code, or secret
configuration.

Prefer a small stable exported surface. Changing a shared contract requires
tests for every consumer and backward-compatibility consideration.

## Security and privacy review

Before requesting review, verify that the change:

- does not expose secrets, private URLs, customer data, keys, or tokens;
- encrypts protected content before network persistence;
- does not log decrypted content or authentication material;
- validates untrusted input and rejects unsupported URL protocols;
- preserves authorization, origin, sender, and payload checks;
- uses least-privilege browser permissions;
- handles errors without exposing sensitive internals;
- includes negative tests for security-sensitive behavior;
- keeps public privacy and encryption claims precise.

Report suspected vulnerabilities using `SECURITY.md`, not a public issue.

## Testing and quality gates

Run the smallest relevant test during development, then complete the required
gate before review:

| Changed surface | Required commands |
| --- | --- |
| Documentation or metadata | Review links and paths; `git diff --check` |
| Dashboard | `npm test`; `npm run lint`; `npm run build` |
| Chrome extension | `npm test`; `npm run build:chrome` |
| Shared code | All dashboard and Chrome checks |
| Dependencies or security-sensitive code | All checks; `npm audit` |
| Combined release | All checks; verify every version field and changelog |

Tests should be deterministic, isolated, and behavior-focused. Do not call real
production services. Use fake domains and unmistakably non-production keys.

## Dependency practices

- Add a dependency only when its value outweighs maintenance, security, bundle,
  and supply-chain cost.
- Prefer exact versions for build infrastructure when drift would threaten
  reproducibility; follow the repository's established range style otherwise.
- Commit `package.json` and `package-lock.json` changes together.
- Review transitive changes and install scripts.
- Do not accept a vulnerability automatically when a safe compatible update is
  available, and do not hide audit output.
- Separate major upgrades from feature work unless the feature requires them.

## Version bump conventions

FavLock uses Semantic Versioning and one shared product version across the
dashboard, shared package, and browser extensions from version 1.3.1 onward.

| Bump | Use when | Example |
| --- | --- | --- |
| PATCH | Shipping a backward-compatible fix, security correction, reliability improvement, or extension-store resubmission | `1.3.1` → `1.3.2` |
| MINOR | Shipping a backward-compatible feature, meaningful workflow, new browser extension, or additive compatibility capability | `1.3.1` → `1.4.0` |
| MAJOR | Shipping an intentional breaking workflow, removed behavior, incompatible public contract, or user-visible data migration | `1.3.1` → `2.0.0` |

When several categories apply, choose the highest: breaking change over feature,
feature over fix. Code size, effort, or the number of changed files does not
determine the bump.

Documentation, tests, refactors, CI changes, and development-only tooling changes
do not need a product bump unless they are included in a product release. Every
Chrome Web Store submission is an exception and requires at least a PATCH bump
because Chrome store versions cannot be reused.

A release bump must update these values together:

- root `package.json`;
- `dashboard/package.json`;
- `packages/shared/package.json`;
- `packages/shared/src/version.ts`;
- `extensions/chrome/manifest.json` `version` and `version_name`;
- the corresponding root and workspace records in `package-lock.json`.

Update the relevant dated changelogs, run the complete release quality gate, and
verify every value before creating `vX.Y.Z`. Use
`chore(release): bump FavLock to X.Y.Z` for a version-only release commit.

Internal database, cache, protocol, and encrypted-content schemas keep their own
compatibility versions. A product version bump never replaces an internal schema
version or migration plan.

## Documentation practices

- Keep setup and validation commands executable as written.
- Use repository-relative paths and verify links after moves.
- Distinguish current behavior from proposals and roadmap work.
- Keep public security and encryption language accurate about what is protected
  and what metadata or services may still observe.
- Use full calendar dates in changelogs.
- Update README, store listing, security guidance, and changelogs only when the
  affected behavior actually changes.

## Pull-request checklist

- [ ] The change is focused and the diff contains no unrelated work.
- [ ] Existing user changes were preserved.
- [ ] Tests cover the behavior and meaningful failure paths.
- [ ] Required test, lint, build, package, and audit commands passed.
- [ ] Accessibility, responsiveness, performance, and offline states were
      considered where relevant.
- [ ] No secrets, generated files, build output, or customer data are included.
- [ ] Security, encryption, message validation, and permissions were reviewed.
- [ ] Documentation and public claims match the implementation.
- [ ] The selected PATCH, MINOR, MAJOR, or no-bump decision follows the version
      convention.
- [ ] Release version fields and changelogs are synchronized when applicable.
- [ ] Compatibility implications are documented.
- [ ] The pull-request title follows the commit convention.
