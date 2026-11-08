# Deployment Data Safety & First Administrator Setup

## Phase 4 deployment guard (breaking, fail-closed)

Production server startup now **refuses** to run if `APEX_DATA_FILE` is absent, blank or points inside the application checkout (including `data/app-store.json`). This prevents deployments from accidentally using the repository-tracked starter database. Existing production instances using the old default path will **not start** after upgrading until an authorized operator explicitly migrates the data. This is intentional: the server refuses rather than overwriting it.

**Migration procedure (maintenance window):**
1. Stop Apex OS and all writers; locate the currently deployed `data/app-store.json`. Never replace it with repository content.
2. Create a private directory OUTSIDE the application checkout/web root, accessible only to the server/operator account.
3. Run the offline snapshot tool with absolute paths:
   `node scripts/backup_data.mjs --source /OLD/DEPLOYED/data/app-store.json --out /PRIVATE/BACKUPS/apex-before-migration.json`.
4. Verify that the command printed SHA256 and that the backup exists with `0600` permissions. Verify its JSON and record counts offline. Store a separate copy in secured backup storage.
5. Manually copy the **deployed populated** JSON file into the new private runtime directory, preserving ownership, mode and file content; don't copy the checked-in starter.
6. Set `APEX_DATA_FILE=/PRIVATE/RUNTIME/app-store.json` as a production environment variable. Point to the new copy; verify exact SHA256 against the original before starting the service.
7. Start one instance, log in, check real customers/invoices/users and verify session/logout. Keep the old copy and backup until recovery is proven.
8. Confirm the new private path is outside `public_html`, static `dist`, Git checkout and all CI checkout roots. Never upload the backup into Git or send it through chat.

**Operational constraints:** The backup tool requires an operator-provided existing source path and target outside the checkout. It uses exclusive create (will never overwrite an existing snapshot), SHA256 digest, and private file permissions. It is an **offline file copy**, not a live database snapshot, automatic recovery or encrypted offsite backup; service writes must be stopped.


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
