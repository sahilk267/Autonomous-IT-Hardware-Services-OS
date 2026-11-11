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

## Phase 10.1 PostgreSQL staging safeguard (2026-11-11)

A local-only PostgreSQL staging import and forced-RLS schema now exist at `scripts/postgres/stage_json_to_pg.mjs` and `migrations/postgres/001_staging_rls.sql`. This **does not** change production JSON storage or authorize deployment. Do not repoint `APEX_DATA_FILE`, production site config or any Hostinger connection to a staging import. Staging source must be a private, verified, quiescent snapshot outside the repository, and import is refused without explicit local `apex_stage_*` database ACK. Original JSON is read-only. See [Phase 10.1 runbook](PHASE_10_POSTGRESQL_STAGING_2026-11-11.md).

## Phase 10.2 PostgreSQL pilot is NOT production deployable

The optional `APEX_PG_PILOT_ENABLED` path exists only for the loopback `NODE_ENV=staging` SQL pilot and a separate, disposable private authentication store. Enabling it in production aborts startup. Do not point any public Hostinger application or deployed customer data at this pilot; normal API storage still uses JSON. See [Phase 10.2 safety/runbook](PHASE_10_2_AUTHENTICATED_PG_PILOT_2026-11-11.md).

## Phase 10.3 context signing and database safety

The 10.3 staging SQL pilot uses a separate 32-byte HMAC secret stored in privileged PostgreSQL staging data and supplied through the application runtime environment, not HTTP headers. The key binds actor/tenant to one PostgreSQL transaction and backend. Database dump/restore includes this staging key: **rotate or destroy the key after any copy**; never place it in Git, logs, public Hostinger files or end-user data. Stage assets/projects/tickets/jobs are NOT live customer records; normal JSON APIs remain authoritative. See [Phase 10.3 runbook](PHASE_10_3_SIGNED_CONTEXT_DOMAIN_REPOSITORIES_2026-11-11.md).

## Phase 10.4 commerce pilot safety

All PG pilot procurement items are `REQUEST_DRAFT` and finance rows `PREVIEW_UNISSUED` with tax `PENDING_CLASSIFICATION`. Do not issue/send them as real POs or invoices, charge funds or initiate OEM returns. Local PG pilot continues to require private 32-byte context key, disposable outside-checkout auth data and loopback staging only. No production Hostinger deployment is authorized. See [Phase 10.4 report](PHASE_10_4_COMMERCE_DRAFTS_2026-11-11.md).

## Phase 10.5A — immutable staging retry keys, explicit BLOCKED cutover

The `pilot_request_keys` table stores only tenant/customer, authenticated actor, operation, SHA256 request digest and draft resource reference; no payment credentials or full request bodies. It is protected by FORCE RLS and not mutable by the runtime writer. `assess:pg:cutover` is read-only and **must report BLOCKED (exit 3)**; this is not a switch, approval or deployment action. All live payment, invoice, PO, OEM and finance processing remain disabled; ordinary production data is still JSON-backed. See [Phase 10.5A operator guidance](PHASE_10_5_TRANSACTION_RETRIES_CUTOVER_GATE_2026-11-12.md).

## Phase 10.5B — normalized SQL staging safety

Two compiled Express instances in CI use independent private throwaway JSON auth files and an isolated local PG16 database; the work-order rows, revision conflicts and event history are synthetic. No real customer, OTP/identity integration, provider dispatch, completion certificate, production DB, invoice, payment, supplier PO, or Hostinger cutover is touched. The SQL pilot still refuses `NODE_ENV=production` and runtime switch flags; `main` and live JSON records remain authoritative and untouched. Read [Phase 10.5B documentation](PHASE_10_5B_NORMALIZED_SERVICE_MULTI_INSTANCE_2026-11-12.md).
