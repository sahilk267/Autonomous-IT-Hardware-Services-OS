# Phase L Stage 2 — PostgreSQL-backed Express runtime

**Implementation status:** Preview branch only. **Not a production multi-tenant release certification.**

Stage 2 introduces a real PostgreSQL data plane for the existing Node/React application, separately from the legacy `APEX_STORAGE_MODE=single` JSON path.

## What is actually wired

The `postgres` runtime:
- Uses `DATABASE_URL` with a **non-superuser, non-BYPASSRLS database role**, and binds every process to a **pre-provisioned** `APEX_TENANT_ID` UUID.
- Refuses to start when the tenant is missing/disabled or RLS is not enabled and forced on all protected tables. There is **no JSON fallback**.
- Moves initial administrator setup, scrypt password verification, account membership, token hashing, session expiry and logout/revocation to `apex_memberships` and `apex_sessions`.
- Executes existing Express business endpoints within a tenant-specific PostgreSQL transaction. Each HTTP request hydrates a private in-memory `PersistentStore` facade from `apex_records`; writes lock and atomically update the tenant's `workspace_state` JSONB row before the response is sent. This is **not** a normalized relational repository for each business entity.
- Writes generic HTTP mutation audit entries into `apex_audit` within the same database transaction. The application role receives INSERT/SELECT audit permissions, **not UPDATE/DELETE**.
- Prevents cross-tenant record injection by enforcing tenant IDs on every supported collection, and verifies cookie sessions within the configured tenant context. Auth JSON never returns raw session tokens.
- Preserves organization identity and administrator membership when an owner uses the business-data reset endpoint.

**Important limitation:** The web process currently serves **one configured organization**. Two different instances can connect to the same PostgreSQL database using different provisioned tenant UUIDs and remain isolated by RLS; single-instance dynamic tenant routing and self-service company signup are **not implemented**. For that, use a tenant-aware session/workspace resolver validated across every API, rather than accepting a user-supplied tenant header.

## Operator provisioning (new tenant, empty database)

Run all commands from a private operator console with PostgreSQL 16+ and a securely provisioned database. The database owner and runtime roles must be separate. Do not log credentials or put either URL in Git.

1. Create the application database and a schema owner/migration role. Use a dedicated **non-superuser, non-BYPASSRLS** app login. The runtime role must not own protected tables.
2. In an operator shell only, set `APEX_MIGRATION_DATABASE_URL` to the privileged schema/migration connection. Run:
   ```bash
   node scripts/postgres-admin.mjs migrate
   node scripts/postgres-admin.mjs provision my-company "My Company"
   node scripts/postgres-admin.mjs grant-runtime apex_runtime
   ```
3. The provision output includes a **UUID**. In the running application environment configure:
   ```dotenv
   NODE_ENV=production
   APEX_STORAGE_MODE=postgres
   APEX_TENANT_ID=<UUID returned by provision>
   DATABASE_URL=<runtime-only connection string>
   APP_URL=https://your-exact-public-domain.example
   APEX_SETUP_TOKEN=<fresh random 32+-character token>
   ```
4. Restart the backend; startup checks are intentionally fail-closed. Open the HTTPS site, complete first-time administrator enrollment using the setup token, confirm login/logout, role restrictions, cross-origin 403 and persistence across restart.
5. Remove `APEX_SETUP_TOKEN` from deployment configuration after enrollment, restart and verify that enrollment stays blocked. Only edit organization profile afterward using the authenticated owner-only settings endpoint.

For Windows, use equivalent PowerShell `$env:NAME` values or the service manager's protected environment configuration. **Never put migration-owner credentials into the running Windows service or Hostinger environment.**

### Existing JSON installation — no destructive cutover

1. **Stop writes** and take an offline, private, versioned snapshot of the original `app-store.json` using `scripts/backup-data.mjs`. Verify the generated checksum manifest. Preserve the source and manifest; do not delete original data.
2. Provision a **new empty tenant** in PostgreSQL (do not point to an existing populated tenant).
3. Run `node scripts/postgres-admin.mjs import-dry-run <new-tenant-uuid> <absolute-backup-manifest>` with `APEX_MIGRATION_DATABASE_URL` set in the operator shell. Review collection counts and users.
4. Existing users must have valid `salt` and `passwordHash`; passwordless bootstrap records are intentionally rejected. **Do not manually fabricate hashes.** Use a reviewed account-recovery process before import.
5. After manual approval and verification, run `node scripts/postgres-admin.mjs import-confirm <new-tenant-uuid> <absolute-backup-manifest>`. The import is one PostgreSQL transaction; it refuses any destination with users or workspace data and rotates all sessions. The legacy JSON source is never overwritten.
6. Point one test deployment at the new tenant using `APEX_STORAGE_MODE=postgres`; verify accounts, product/stock, quote, invoice, ticket, workflow, exports/AI, and integration paths. Compare record counts and reconcile cross-object references.
7. For rollback **before accepting writes in PostgreSQL**, stop the new service and point the old single-tenant process at the unchanged JSON copy. **Once users have written to PostgreSQL, never switch back to stale JSON without a validated reverse migration/reconciliation plan.**

### Acceptance verification

```bash
npm install
npm run lint
npm test
npm run build
# On a disposable PostgreSQL test service only:
npm run test:postgres
npm run test:stage2
```

`test:stage2` creates a disposable `apex_stage2_ci` database on localhost, runs SQL migrations, configures a non-bypass RLS runtime role, starts two actual production Node bundles with separate tenant IDs, checks first-run auth, tenant session boundaries, cross-tenant writes/reads, SQL durability, restart, protected reset, logout and append-only audit. **Never point this test at production.**

## Open release blockers — next Stage 3 work

- Normalize finance/inventory and other high-risk entities into independently constrained PostgreSQL tables (the Stage 2 JSONB workspace row is a transactional compatibility bridge, not row-per-entity data design).
- Support dynamic tenant switching/workspace membership inside one server only after central tenant-aware auth and cross-tenant IDOR testing for **all** APIs, including AI, Telegram callbacks and async workers.
- Implement durable distributed login throttling and resource budgets. Request-wide tenant row locks can hold open during long AI calls, causing backpressure; move external API calls outside write transactions.
- Add tenant lifecycle, invitations, password recovery, operator MFA, tenant deletion/retention and legally compliant audit retention.
- Validate all business object schemas, nested foreign keys, audit append-only tamper controls and concurrent financial stock/invoice transactions.
- Run a **real** Windows and Hostinger deploy, HTTPS proxy, restart, backup-restore and rollback rehearsal. This code has not been deployed to production.

**Review order:** Phase K PR #2 → Phase L Stage 1 PR #3 → Stage 2 PR #4. Keep staged branches unmerged until their CI and data-migration review gates pass.
