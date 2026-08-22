# Optional branded Auth domain rollout

FavLock uses Supabase Auth for its existing users, identities, Google OAuth,
PKCE, and JWT issuance. Supabase's supported custom-domain feature optionally
replaces the default project hostname in the Google authorization and callback
flow. It is not required to build or deploy FavLock and is a paid add-on on
supported paid projects.

Choose a dedicated subdomain that is not already used by the FavLock API. For
example, `auth.favlock.app` is a suitable name if it is available; the commands
below deliberately use placeholders and do not assume that hostname is active.

## 1. Register and verify the domain

Authenticate the Supabase CLI, then register the selected hostname:

```sh
supabase login
supabase domains create --project-ref <project-ref> --custom-hostname <auth-domain>
```

Add the CNAME and verification TXT records returned by Supabase to the
authoritative DNS provider. The CNAME must resolve from `<auth-domain>` to the
project hostname specified by Supabase. Do not remove or improvise any returned
verification record.

Ask Supabase to recheck the records until verification and certificate issuance
complete:

```sh
supabase domains reverify --project-ref <project-ref>
```

## 2. Prepare Google before activation

In the existing Google OAuth client's authorized redirect URIs, add this exact
callback while retaining the existing project-domain callback:

```text
https://<auth-domain>/auth/v1/callback
```

Do not replace the FavLock dashboard redirect allowlist or the existing Chrome
Identity callback. The custom-domain callback is the Google-to-Supabase Auth
callback; Supabase Auth still redirects to the established dashboard or exact
Chromium callback afterward.

## 3. Activate and verify

Activate only after DNS, TLS, and the Google redirect URI are ready:

```sh
supabase domains activate --project-ref <project-ref>
```

Use test accounts to verify all of the following before deploying the new
client configuration:

- dashboard Google sign-in and account creation;
- dashboard sign-out, refresh, and password recovery;
- Chrome Google sign-in with exact callback and state validation;
- dashboard-to-extension email pairing; and
- existing-user login without creating a duplicate identity.

Keep the previous Google callback registered during rollout. Supabase documents
that the project domain remains active, which permits a staged client rollout.

## 4. Deploy FavLock clients

Set the public client value to the activated origin, with no path or query:

```dotenv
VITE_AUTH_URL=https://<auth-domain>
```

Keep the FavLock API's server-side `SUPABASE_URL` unchanged. Rebuild and deploy
the dashboard and Chrome extension. Production validation rejects HTTP,
credentials, paths, query strings, and fragments for `VITE_AUTH_URL`; it also
accepts the existing HTTPS project Auth origin when no custom domain is enabled.

The dashboard does not require a provider publishable key and does not bundle
the Supabase JavaScript SDK. Its FavLock Auth client sends email and session
lifecycle requests only to `VITE_API_URL`; `VITE_AUTH_URL` is used solely for
interactive Google authorization. During the first upgraded load, a valid
legacy `sb-auth` browser cookie is migrated into the new FavLock session
storage. Invalid legacy values are left untouched so a failed migration does
not silently destroy a recoverable login.

Retain a known-good pre-change client artifact until dashboard and extension
sign-in are verified. Removing or deactivating the custom domain before clients
are rolled back will break those deployed OAuth URLs.
