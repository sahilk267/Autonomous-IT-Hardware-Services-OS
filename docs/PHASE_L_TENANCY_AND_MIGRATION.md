# Phase L — Tenant isolation, CSRF, storage integrity & migration plan

**Date:** 2026-11-11  
**Repository:** `sahilk267/Autonomous-IT-Hardware-Services-OS`  
**Dependencies:** Phase K changes in PR #2. Phase L is based on Phase K's branch, not the unpatched `main`.

## Release decision: MULTI-TENANT PRODUCTION IS NOT READY

### What Phase L actually changes

- **Fail-closed tenant handling for the existing JSON runtime.** Newly initialized data gets a random deployment-specific tenant identifier. All owned collections are tagged with that tenant identity at commit; any mismatched `tenantId` fails before persistence. Changing tenant identity through profile updates is rejected. Old `tenant-1` stores are read without changing their identity.
- **Explicit storage mode.** `APEX_STORAGE_MODE=single` remains supported; `multi` or `postgres` is rejected at startup. This makes the unimplemented multi-tenant mode impossible to enable accidentally.
- **Write-origin/CSRF policy.** Mutating browser API requests must include a trusted `Origin` equal to the deployment's explicit `APP_URL` or `APEX_ALLOWED_ORIGINS`. TLS is required for production origins. No wildcard, `null` origin, Host-based fallback or `X-Forwarded-Host` implicit trust. Pure bearer-token requests without the session cookie are separately treated as non-browser calls; login/setup are always origin checked. The Telegram webhook uses its independent secret and owner/chat allowlist, not cookie CSRF. Apps running from `file://` must instead use the HTTP(S) backend.
- **Durability guardrails.** Production requires an absolute `APEX_DATA_DIR` under private persistent storage. JSON replacement files use restrictive `0600` permissions and an fsync-before-rename; a `*.lock` file prevents a second same-host writer. A crash/SIGKILL may leave a stale lock; verify the original process is dead before manually deleting it. This is not a distributed lock or database transaction system.
- **Backup utilities.** `scripts/backup-data.mjs` creates a private, checksum-manifested copy and can verify/restore to a new path ONLY. No existing file can be overwritten; a tampered snapshot fails verification. Backup copy and restore tests run in temporary directories.
- **Proposed RLS schema.** `database/postgres/001_tenant_core.sql` describes PostgreSQL composite-tenant keys, row-level policies, owner/membership/session relationships, and insert-only audit policy. **It is a schema blueprint, NOT yet wired to any Express route and NOT a runtime migration.**

### How to run one authorized organization safely

The current server operates **one organization per running instance**. Do not share its JSON file between companies or instances, even if their user roles differ. To serve multiple customer tenants from one instance, a full PostgreSQL repository adapter, authenticated tenant routing and cross-tenant E2E isolation tests are still required.

For a new installation:

1. Provision a private durable directory **outside the webroot and source-controlled checkout** (for example `/home/<account>/private/apex-data`, or `C:\\ProgramData\\Apex\\data` on Windows). Do not use temporary Hostinger Node.js build directories.
2. Configure `NODE_ENV=production`, `APEX_STORAGE_MODE=single`, `APEX_DATA_DIR=<absolute-directory>`, `APP_URL=https://your-exact-public-origin`, and a high-entropy `APEX_SETUP_TOKEN`. If the product uses more than one approved public hostname, set `APEX_ALLOWED_ORIGINS` to a comma-separated **explicit HTTPS origin** list.
3. Configure a trusted TLS reverse proxy and ensure the actual browser page is served from one of those exact origins. Do not use wildcard CORS/CSRF bypasses. Restart the application after changing environment settings.
4. Complete the admin setup with the token (as detailed in `docs/PHASE_K_SECURITY_AUDIT.md`). Remove the setup token from the deployment after enrollment and restart. Use a non-owner user for least-privilege acceptance tests.
5. Check that owner and non-owner requests have correct 200/403 outcomes. Test a malicious cross-site POST/DELETE: it must return 403 before any record changes. Verify imported foreign-tenant rows and a second process on the same JSON file fail closed.

### Existing installation migration / safe rollback

1. **Take an offline backup first.** With old processes stopped or quiescent, run `node scripts/backup-data.mjs backup /absolute/path/app-store.json /absolute/private/backup-dir`.
2. Run `node scripts/backup-data.mjs verify /absolute/private/backup-dir/NAME.json.manifest.json`. Save the checksum and manifest outside Git/webroot. Restrict the backup directory and encrypt it at the infrastructure level.
3. Keep the existing tenant ID and data. Set `APEX_DATA_DIR` to the directory containing the existing live `app-store.json`; do not mix a new empty checkout with a production data path.
4. Start **one** process. If it rejects a record carrying a mismatched tenantId, do not rewrite it automatically: investigate the source and prepare a reviewed data correction, with backups.
5. For rollback, stop the application. Restore to an **empty new path** with `node scripts/backup-data.mjs restore-new <manifest> <new-absolute-file>` and manually select the restored directory after verification. Never overwrite a running database or restore to an existing path.

### How PostgreSQL migration must be implemented next

The proposed migration defines `apex_tenants`, `apex_memberships`, `apex_sessions`, `apex_records` and `apex_audit`, all with tenant-scoped keys or RLS. Before enabling a genuine multi-tenant mode:

1. Add a dedicated PostgreSQL connection pool and **non-owner, non-BYPASSRLS runtime role**. Run migrations using a separate controlled schema owner. Require a supported PostgreSQL version (15+ for the column-list foreign-key `ON DELETE SET NULL` syntax).
2. Build one authenticated tenant-resolution path from a verified account/membership. Use a transaction for every business read and write, with `SET LOCAL apex.tenant_id = <verified UUID>` (or parameterized `SELECT set_config('apex.tenant_id', $1, true)`). Never derive a tenant ID from arbitrary request JSON.
3. Replace **every** `dbStore` call site and report/AI/Telegram/worker path. Migrate finance and inventory to normalized tables with constraints and real transaction boundaries. Move raw session tokens to SHA-256 token hashes in database; audit entries require an append-only process with controlled grants.
4. Validate old `tenant-1` data, assign new UUID identities only via an audited, backed-up migration, and map foreign keys. Do not switch traffic between JSON and PostgreSQL sources within one request.
5. Verify cross-tenant denial for list, details, write, workflow, audit, report, Telegram, and AI paths. Include forged foreign IDs and races; test PostgreSQL RLS **as the actual application role**, not superuser. Verify restore, migrations, rollback, session rotation, CSRF, and concurrent writers.
6. Only then may `APEX_STORAGE_MODE=postgres` be supported and multi-tenant production acceptance reconsidered.

### Verification matrix

| Gate | Status |
| --- | --- |
| Static TypeScript check, new security tests, app build | GitHub CI result to be recorded |
| Origin/CSRF pure middleware regression | Added |
| JSON single-tenant cross-record and per-install UUID regression | Added |
| Strict backup checksum + safe restore-new tests | Added |
| Live Windows/Hostinger HTTPS browser integration | **NOT RUN** |
| PostgreSQL RLS schema applied/tested on real database | **NOT RUN** |
| Full production multi-tenant cross-boundary E2E | **OPEN RELEASE BLOCKER** |
| Zero data loss across real migration/rollback | **OPEN RELEASE BLOCKER** |

### Operating cautions

- The current single-process JSON backend is an interim deployment shape, **not a substitute for PostgreSQL/transaction isolation**.
- Browser auth still uses 24-hour JSON-persisted sessions; distributed revocation, session token hashing and distributed password-attempt throttling remain open.
- Role controls must be applied server-side across every sensitive mutation; client role toggles are not security boundaries.
- The backup tool handles JSON only. Never assume it captures emails, uploads, cloud integration credentials, files on other hosts or PostgreSQL data.
- Do not expose JSON snapshots or lock files from a public path. The README's prior generic "production ready" language is not a release signoff.
