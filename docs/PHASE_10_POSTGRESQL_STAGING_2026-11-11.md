# Phase 10.1 — PostgreSQL Forced RLS and Transactional Staging (11 November 2026)

**Implementation scope:** Source pushed to the existing draft development branch only. Actual PostgreSQL 16 schema/policy and stage-importer CI tests run on isolated temporary databases. **Not a production DB adapter, migration or customer cutover.**

## Implemented

1. **Concrete PostgreSQL schema** — [migrations/postgres/001_staging_rls.sql](../migrations/postgres/001_staging_rls.sql) defines tenant and staff identities, customers, customer grants, tenant/customer-keyed generic records, project collaboration, owner-only legacy collection rows, audit events and read-only staging provenance. Source ID columns remain TEXT to preserve existing `tenant-1`, `cust-...` and `proj-...` identifiers without inventing an ID crosswalk.
2. **Composite integrity** — Customer-owned rows must refer to the customer in their tenant. Proposal links to a project and RMA links to an asset are protected by composite tenant/customer/type/ID foreign keys. Project shares require both a same-customer project and an existing customer grant, with cascade revocation.
3. **RLS** — `ENABLE ROW LEVEL SECURITY` **and `FORCE ROW LEVEL SECURITY`** across nine staging tables; no broad write policies. A dedicated `apex_stage_reader` is NOLOGIN, NOINHERIT, NOSUPERUSER and NOBYPASSRLS, granted only SELECT and the necessary context-check functions. Absent/invalid actor or tenant context denies rows. Read role checks owner, customer grant, role and project/field assignment as applicable.
4. **Trusted-context boundary** — DB policies currently read transaction-local `apex.tenant_id` and `apex.actor_id`. These are **not authentication by themselves**: custom GUCs can be set by a client able to issue arbitrary SQL. They must be populated ONLY by a future trusted request adapter after session authentication and with strictly parameterized SQL, no raw SQL endpoint. The stage reader is deliberately not provisioned as a login and **Express still reads the JSON store**.
5. **Staging-only import** — [scripts/postgres/stage_json_to_pg.mjs](../scripts/postgres/stage_json_to_pg.mjs) defaults to preflight **dry-run without a DB connection**; explicit `--apply` requires a local `apex_stage_*` database, a matching environment acknowledgment, the installed 10.1 staging schema marker and an **empty** target. It validates stable customer bindings, record IDs, staff assignment/grants, cross-customer links, expected display names, source SHA256, and original read-only Phase 9 preflight. Credential-shaped fields in any staged record cause a fail-closed refusal rather than a silent secret copy; this is a conservative field-name check, not general DLP. A `SERIALIZABLE` SQL transaction stages all rows and grants or **rolls back everything**.
6. **Sanitized credentials** — Only local staff IDs, roles and disabled timestamps are staged. Password hashes, salts, session cookies/tokens, production provider keys and raw identity sessions are **not** imported to PostgreSQL. App sign-in continues to depend on the existing guarded JSON store.
7. **Owner-only legacy** — Unreviewed invoices, disputes, product/supplier/RFQ, license, knowledge, event/message/connector data are not accidentally customer-shared; they remain in explicitly owner-only staging tables pending a complete future model review. Events have owner-only SELECT and no app-reader mutation privilege.
8. **Real DB acceptance** — A PostgreSQL 16 GitHub Actions service checks read-only startup, data counts, 5 roles/two customers, cross-tenant rejection (including reused IDs), exact field assignment, proposal/project visibility, RMA/asset linkage, disabled users, revoked membership, DML denial, and foreign keys. Restore rehearsal also takes a PostgreSQL 16 custom-format dump to a **separate throwaway database**, checks full row equality, RLS FORCE, grant revocation, foreign keys and provenance. No external/production DB is contacted.

## Reproducible safe operator workflow

**Before any DB work:** stop all writers to a source JSON copy; follow [Deployment Data Safety](DEPLOYMENT_DATA_SAFETY.md). Do not pass the checked-in `data/app-store.json`, overwrite a deployed file, or commit snapshots/logs with PII.

First, run read-only source preflight:

```bash
node scripts/customer_migration_preflight.mjs --source /absolute/private/verified-snapshot.json
npm run stage:postgres -- --source /absolute/private/verified-snapshot.json
```

For a disposable local-only PostgreSQL 16 staging installation, create a *fresh empty* `apex_stage_...` database, install [001_staging_rls.sql](../migrations/postgres/001_staging_rls.sql), and only after source preflight succeeds:

```bash
PGHOST=127.0.0.1 PGPORT=5432 PGDATABASE=apex_stage_sandbox \
  PGUSER=YOUR_LOCAL_ADMIN PGSSLMODE=prefer \
  APEX_PG_STAGING_ACK=STAGING_ONLY_NO_PRODUCTION \
  npm run stage:postgres -- --source /absolute/private/verified-snapshot.json --apply
```

Pass the database password through your secret manager/process environment, never command history or a Git-committed `.env`. The importer **refuses** non-loopback hosts, default production DB names, missing ACK, `DATABASE_URL`, a runtime PostgreSQL switch, or populated targets. No replication or production read/write cutover is initiated.

## Verification and release gate

- Application/runtime tests: existing Node/Chromium CI remains active and uses throwaway JSON stores; no change to `server/db.ts` or live deployed system.
- Real PostgreSQL 16 staging: isolated `smoke:postgres` RLS/import negative tests, plus dump/restore job `smoke:pg:restore`. Results/links are tracked in [Implementation Tracker](IMPLEMENTATION_TRACKER.md) after successful runs.
- **Release-blocking items:** Actual PostgreSQL-backed API adapter and migration crosswalk for legacy/customer and auxiliary records; authenticated transaction context and SQL injection review; safe writable RLS and transactional audit; source-to-target reconciliation on real *copies* of deployed data; independently validated encrypted backups, actual production recoverability, load and multi-instance testing, verified provider adapters and Hostinger deployment approval. **Keep PR #1 Draft.**

## What the code DOES NOT do

It does not migrate current production users/data, expose new PostgreSQL login, enable SQL storage for Express, perform rollback of a production service, certify legal audit immutability, or prove tenant isolation for the rest of the JSON runtime. A successful staging restore is **not** a production restore drill.

### Phase 10.1 CI verification — 11 November 2026

- Code commit [`38a570c`](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/commit/38a570c76907c0c8a64b3a6d9e22ed4d42aa52b0) passed [push Actions #42929292843](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/42929292843) and [PR Actions #42929301929](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/42929301929). Both include backend, Chromium and actual PostgreSQL 16 service jobs.
- **PostgreSQL 16 staging 23/23:** source SHA256, no DB dry-run, denied unsafe targets and spoofed tenant/customer/credential fields, nonempty-target refusal, explicit atomic import, real SQL RLS under five roles, disabled actor denial, unauthorized cross-tenant/cross-customer joins, grant revocation and SQL-induced full transaction rollback.
- **Separate dump/restore 16/16:** matching PG16 client binaries, backup taken from staging DB, restored into another disposable PG16 DB; nine table rowsets compared, `FORCE RLS` verified on nine tables, revoke/tenant scope tests replayed and staging import provenance checked.
- **Original runtime CI:** TypeScript/build PASS; regression **16/16**, authentication **7/7**, HTTP API **96/96**, role/customer API **133/133**, data safety **9/9**, customer source preflight **5/5**, Node22 Chromium browser **7/7**.
- No production PostgreSQL instance, customer records, Hostinger credentials, real payment provider or live deployment was used. These numbers are evidence of isolated source/CI acceptance only.

## Phase 10.2 follow-up

The staging-only PostgreSQL API write pilot and transaction-atomic audit are now implemented and tested. See [Phase 10.2 implementation](PHASE_10_2_AUTHENTICATED_PG_PILOT_2026-11-11.md). This does not change the existing JSON-backed runtime.
