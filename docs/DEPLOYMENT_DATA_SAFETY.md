# Deployment Data Safety & First Administrator Setup

Apex OS currently persists runtime data in `data/app-store.json` and that filename is also tracked in the source repository. This is an operational risk that must be resolved with a controlled deployment migration.

## For new empty installs

1. Deploy into a **new, empty, server-writable data directory**. Do not point first-run installation at a customer's existing database.
2. Provision `APEX_INITIAL_SETUP_TOKEN` as a long, randomly generated secret in the **server environment** before exposing the setup page publicly.
3. Complete initial administrator enrollment, using a unique strong password and setup token. Remove the one-time token after enrollment.
4. Confirm `/api/auth/me` returns 401 anonymously, then succeeds after login; verify logout and role-restricted endpoints.
5. Use HTTPS in production; authenticated cookies use `Secure`.

## For existing installations

**NEVER** overwrite, commit, reset or regenerate an existing populated `data/app-store.json` from the checked-in starter file.

1. Stop writes during maintenance.
2. Create a verified, private file backup (including permissions and ownership) outside the web-accessible directory.
3. Compare source starter and deployed state carefully; preserve users, invoices, quotes, jobs, events, sessions and custom fields.
4. If a legacy passwordless `admin` user exists, keep the file intact. Current API intentionally forbids a public admin takeover. Plan a separate offline credential recovery performed by an authorized operator.
5. Migrate to an external persistent DB or per-install environment-managed store before multi-instance scaling.
6. Do not expose `/api/state/reset` in production; the endpoint is disabled by default.

## CI vs deployment

CI tests use temporary isolated DB paths and must never be configured with production storage. Passing CI does **not** imply third-party API functionality or regulatory tax certification.
