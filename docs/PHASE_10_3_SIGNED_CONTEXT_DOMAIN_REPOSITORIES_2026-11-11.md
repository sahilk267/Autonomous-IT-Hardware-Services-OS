# Phase 10.3 — Signed PostgreSQL Transaction Identity and Service Domain Repositories

**Implementation:** 11 November 2026 — incremental staging-only development work (10.3A/10.3B).
**Branch:** `fix/phase1-security-integrity-20261106`; PR #1 remains Draft.
**Production decision:** BLOCKED. Normal application and `/api/state` still use the existing single-tenant JSON store.

## Implemented

1. **Transaction-bound signed SQL context** (`migrations/postgres/003_staging_signed_context_domains.sql`, `server/postgres_pilot.ts`): the backend reads the PostgreSQL `txid_current()` and `pg_backend_pid()` for the current transaction. Using a per-run 256-bit secret, it HMAC-signs an exact tenant ID + actor user ID + transaction ID + backend PID envelope. A SECURITY DEFINER verifier reads the separately installed, non-readable DB secret and compares the HMAC on every `apex.active_role()` authorization check. Invalid, unsigned, changed-actor and replayed session contexts are denied by RLS.
2. **Private secret and least privilege:** `apex.pilot_context_secrets` is not readable by the local pilot login/SQL writer or staging reader. CI generates an ephemeral random secret per run and masks it. DB superusers, migration owners and any attacker compromising both application-side and DB-side keys remain outside this protection. No actual production key management is configured.
3. **Project repository (staging only):** authenticated `GET/POST /api/pg-pilot/projects` with customer membership plus creator/owner/project collaborator RLS, authoritative IDs and client name. `PATCH /api/pg-pilot/projects/:id/access` is owner-only and requires an existing same-customer staff grant, backed by composite tenant/customer FKs. Sharing/revocation creates SQL-triggered audit records in the same transaction.
4. **Ticket repository (staging only):** authenticated `GET/POST /api/pg-pilot/tickets` and `PATCH /api/pg-pilot/tickets/:id/status`; owner/IT Head can create incidents and update permitted internal states. Field staff cannot self-create unverified work or access unassigned/out-of-customer tickets. The DB validates the server-authored reporting user and tenant/customer identity.
5. **Asset and field-job repositories (staging only):** `migrations/postgres/004_staging_assets_field_jobs.sql`, `GET/POST /api/pg-pilot/assets`, `GET/POST /api/pg-pilot/jobs`, manager-only `PATCH /:id/assign` for each, and authorized `PATCH /:id/status` for both. Assigned engineers need **explicit customer membership AND exact object assignment** for read/status updates. Deactivation/revocation immediately removes access; direct client-supplied assignee identities in create routes are rejected. Case-insensitive asset tags are unique inside a tenant. Assignment column and JSONB projection are checked together.
6. **No fake customer completion claims:** staged field jobs may only move through internal `SCHEDULED`, `EN_ROUTE`, `CHECKED_IN`, `DIAGNOSING` states. `COMPLETED` and other external proof/approval claims are not accepted without real service evidence. Asset statuses remain internal inventory records.
7. **Transactional audit/rollback:** inserts and changes to projects/tickets/assets/jobs, project grants and previous CRM/customer operations are trigger-audited with minimal IDs, actor, tenant, operation and transaction ID. A trigger failure aborts the associated business mutation. The SQL pilot role cannot directly rewrite or insert audit events.
8. **Staging-only guard:** project/ticket/asset/job APIs run only when the optional loopback staging pilot is explicitly enabled, with an outside-repository disposable JSON auth file, local `apex_stage_*` database and restricted SQL login. A production-mode pilot flag aborts process startup. The original JSON business endpoints are never replaced.

## Security and CI acceptance

- Migration order: `001_staging_rls.sql` → source import and read-only parity → `002_staging_authenticated_pilot.sql` → `003_staging_signed_context_domains.sql` → install a fresh 32-byte secret → `004_staging_assets_field_jobs.sql` → run actual HTTP/domain tests.
- PostgreSQL 16 RLS and staging import, read-only full source/row parity, five-role/two-customer denial, customer grant revocation, and original safety gates continue running.
- Real HTTP tests include successful project, ticket, asset and field-job writes, project shares, assigned engineer workflows, unassigned asset/job denial, role escalation/impersonation attempts, fraudulent completion/status denial, customer name/ID spoofing, cross-customer access, same-transaction audit and forced rollback.
- Signed-context tests check raw SQL login with forged GUCs, forged HMAC, secret SELECT privilege denial, actor ID change within a signed transaction and signature replay across transactions.
- Database backup/restore runs on a second disposable PostgreSQL 16 database and validates RLS and transaction-attestation after restoration. Test counts are recorded in tracker after full CI success.

## Technical limitations / unresolved production gates

**Partial Phase 10.3**: Only customer registry, CRM, projects, tickets, assets and field jobs have a *limited* staged PostgreSQL write API. SQL-backed invoices, payments, procurement, proposals/award, RMA lifecycle, inventory stock ledger, endpoint telemetry, customer portal and the other cross-module operations **are not implemented**. Existing JSON production endpoints remain authoritative.

The current source import uses generic JSONB `apex.customer_records` and an isolated private-file authentication fixture. It is not a normalized, multi-instance production application. The 10.2 staging parity checker compares the imported source **before** pilot-side SQL writes; once the pilot diverges, it intentionally fails and is **not** a bidirectional sync engine.

Per-transaction HMAC substantially narrows the risk of arbitrary SQL clients spoofing custom GUC actor/tenant settings, but this is a local-stage trust boundary, not a certified production identity system. Compromise of app attestation key or superuser remains critical; signed context alone does not prevent SQL injection from mutating objects that the *current* authenticated actor can legitimately mutate. The key is stored in the staging DB and therefore included in its backup; rotate it after restoring to anything outside the isolated CI fixture.

Immutable external audit/WORM backups, normalized SQL records, production credential management, code-level injection review, complete historical customer ownership mapping, real snapshot migration, host/DB hardening, backups with verified production-scale restore, multi-instance concurrency tests and controlled Hostinger cutover/rollback remain BLOCKED.

## Safe test and operator sequence

Use **only isolated PostgreSQL 16 CI fixtures**. The GitHub workflow stages a throwaway JSON snapshot, runs the RLS parity test before pilot mutations, installs migrations 002–004 and generates an ephemeral 32-byte context secret under a privileged staging administrator connection. The compiled staging-only server reads its own secret via `APEX_PG_PILOT_CONTEXT_KEY` (64 hex chars), authenticates local staff via a separate disposable JSON file and binds `127.0.0.1`. No public access, production URL, Hostinger environment or real customer data should use this pilot.

For any future environment, use a proper key-management system. Never commit or print the context secret; the SQL pilot login must not receive database ownership, BYPASSRLS, access to context secrets or direct audit write privileges. See [Phase 10.2 runbook](PHASE_10_2_AUTHENTICATED_PG_PILOT_2026-11-11.md), [Data Safety](DEPLOYMENT_DATA_SAFETY.md), and [Migration Blueprint](POSTGRESQL_MIGRATION_BLUEPRINT.md).

**Next release priority:** Phase 10.4 — full PostgreSQL domain repository coverage, transactional financial/work-order invariants, provider evidence, authenticated production trust boundary, historical migration and real rollback rehearsal. Keep PR #1 Draft until completion.

## Phase 10.3 verified CI evidence — 11 November 2026

- **Code SHA:** [`68b0376`](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/commit/68b0376463578a439eb87d8aee6d5ee104c39262).
- [GitHub Actions push #43042984912](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/43042984912) PostgreSQL 16 staging **27/27**, authenticated SQL HTTP including project/ticket/asset/job workflows and signed context replay **93/93**, PostgreSQL dump/restore with attestation **18/18**. The same commit's existing TypeScript/build and Node backend job completed successfully.
- Real PostgreSQL service checks include HMAC signature of tenant+actor+transaction+backend, rejection of unsigned/forged/replayed context, owner-only project sharing, field-assigned asset/job custody, customer membership grant/revoke, SQL audit and failure rollback, source SHA/parity, backup and restored RLS.
- These verification numbers refer to **ephemeral CI fixtures, not a live Postgres deployment or a completed multi-tenant cutover**. Existing JSON application and production customer data were unchanged.
