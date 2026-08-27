# Local account access is independent of cloud sessions

Status: implemented locally; deployment is a separate operation.
Date: 2026-08-27.

## Context

Expiring or revoked cloud credentials must not destroy a user's saved local
environment. Bans, deletion, restrictions and plan changes are cloud policy,
not instructions to remove a local key or erase downloaded data. A local
identity must not allow data or keys to leak into a different cloud account.

## Decision

- Add a token-free local profile alongside the unchanged dashboard v1 session
  record and extension session record. Migrate existing valid user projections
  on-device without network access or a forced sign-in.
- Keep local identity, encryption unlock, and cloud availability distinct.
  Offline, rejected, restricted and temporarily unavailable cloud states retain
  local routing and cached browsing. Export controls are hidden while the
  browser is offline, and direct export-dialog links do not load lazy export
  tools until connectivity returns. Online users can still export their local
  data when cloud access is restricted or unavailable.
- Stop ordinary dashboard cloud work while unavailable. Display a non-blocking
  reconnect notice. On online startup, recheck a saved temporary failure even
  if the access token is still unexpired. Refresh attempts have an eight-second
  request deadline; transient failures retry after 30 seconds while online.
  Successful recovery clears the startup error. Persisted restrictions or
  rejected credentials require explicit recovery, and late network errors
  cannot restart automatic retries after a denial. Refreshing credentials is
  not proof of authorization: each subsequent cloud operation is checked by
  the server. Recovery never replays a failed mutation.
- Bind reconnect to the original account UUID. Reject switching UUIDs, even
  with an identical email. Preserve the old vault; offer export and explicit
  sign-out or a separate browser profile instead of silently migrating keys.
- Keep existing AES-GCM formats. Store an encrypted known-value verifier for
  offline recovery-key validation after a remembered key or verified online
  unlock initializes it. A device without this proof must reconnect once or
  retain its remembered key; do not accept an arbitrary offline key.
- Explicit sign-out/disconnect remains destructive by user intent. Invalidate
  late auth/key results; cancel and drain pending sync before clearing caches.
  Ordinary cloud denial never calls these cleanup paths.
- Create checkout through the server-owned billing endpoint using only bearer
  identity and an attempt UUID. Do not fall back to public product-link metadata
  or automatically retry uncertain checkout requests. Keep the billing portal
  reachable independently of cloud restrictions.

## Compatibility and rollout

Existing session and encrypted-content formats remain readable. Added local
profile/verifier records require no server migration. Existing valid sessions
do not need a forced re-login. Expired or revoked refresh credentials may still
require interactive authentication for cloud access, not for local browsing.

Deploy the backend live-account gate, structured quota errors and checkout
eligibility support first, then the matching API including server checkout,
then this dashboard/extension. Do not extend JWT lifetimes or disable revocation.
Older clients do not understand the new local/cloud distinction; mixed client
versions can still perform their previous explicit cleanup behavior. Rollback
to an older client does not provide the new local-access guarantees.

## Consequences and limits

Retained local data remains accessible after cloud account deletion or banning
by design. Cloud restrictions cannot remotely erase data already downloaded.
The local profile and browser-stored credentials are not a security boundary
against XSS, a compromised browser, or someone using an unlocked device.

The existing library cache is a decrypted IndexedDB projection, not an encrypted
local vault at rest. This milestone does not introduce a service worker,
durable Lists cache, passkey-metadata cache, offline write queue or guaranteed
storage retention. Local export clearly warns that unsynchronized data may be
missing. Production bans/deletion/plan-change and real multi-device/browser
scenarios still require controlled rollout validation.

## Alternatives and next work

Long-lived JWTs or disabled revocation would weaken cloud authorization and do
not solve offline asset/storage availability. A full multi-account vault
migration is deferred; exact-UUID reconnect with explicit switching is smaller
and avoids reusing another account's key. Next, encrypt the local projection at
rest and establish deliberate offline startup/storage behavior with a
forward-compatible migration and recovery tests.
