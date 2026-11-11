# Phase 10.2 — Authenticated PostgreSQL Staging Pilot

**Date:** 11 November 2026
**Branch:** fix/phase1-security-integrity-20261106 (Draft PR #1)
**Readiness:** STAGING-ONLY VERIFIED IN ISOLATED CI. Production readiness BLOCKED.

## Shipped

1. PostgreSQL migration [002_staging_authenticated_pilot.sql](../migrations/postgres/002_staging_authenticated_pilot.sql): restricted writable RLS for customer registration, owner customer staff grants/revokes and CRM document INSERT/UPDATE only. It adds tenth FORCE-RLS table `apex.pilot_audit_events` with no user-level insert/update/delete privileges. It is installed after the verified 10.1 staging import.
2. Staging SQL writer role `apex_pilot_writer`: NOLOGIN, NOINHERIT, NOBYPASSRLS, non-superuser, with narrowly granted SELECT plus customer INSERT, grant INSERT/DELETE, CRM INSERT and UPDATE(payload). Authoritative tenant, customer, record IDs and audit history cannot be directly changed using this writer.
3. Same-transaction DB audit: AFTER triggers on customer registration, membership changes and CRM create/update. They save actor ID, tenant, action, collection/object identifiers and transaction ID (not raw PII payloads). If an audit trigger fails, the associated business write is rolled back.
4. [server/postgres_pilot.ts](../server/postgres_pilot.ts) exposes separately authenticated, cookie-protected, parameterized `/api/pg-pilot/*` endpoints. Each operation starts a SERIALIZABLE SQL transaction, switches to the fixed writer role, binds tenant and staff IDs from the server-authenticated session (never request inputs), verifies staging schema marker and *compares SQL staff role with the local authenticated role*, then commits or rolls back.
5. Supported pilot operations: GET status; GET/POST customer registry; owner PATCH customer staff grant/revoke; GET/POST CRM opportunity; PATCH CRM stage; owner GET trigger audit. Customer names derive from registered SQL identities and CRM stages are restricted. Role and grant revocations take effect on the next DB transaction.
6. Strict guard: pilot is disabled by default, refuses NODE_ENV=production and any non-loopback database, non-apex_stage_* database, missing staging acknowledgment, wrong SQL role login, unsafe checkout JSON file or DATABASE_URL. The staging Express listener binds localhost only. Ordinary /api/state and existing business endpoints remain backed by the existing private JSON file.

## Verified tests and evidence

- PostgreSQL 16 staging policy, migration/import and rollback: **23/23**.
- Real staging PostgreSQL-backed authenticated HTTP pilot: **41/41**. Five local login roles, anonymous denial, owner-only customer CRUD/grants, SQL CRM writes, cross-origin CSRF rejection, spoofed user/tenant headers, mass-assignment denial, JSON/SQL role drift, disabled staff, direct writer without context, denial of direct audit writes, actual audit-trigger failure and whole-transaction rollback.
- Real PostgreSQL pg_dump → independent PG16 restore: **17/17**, including all ten RLS tables (new trigger audit included), row equality, FORCE RLS, tenant boundaries, grant revocation and SHA provenance.
- Original TypeScript/build, Node HTTP/role regression and Chromium UI flows remain in separate CI jobs; all tests use throwaway private data.
- Verified source: [push CI 42996562963](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/42996562963) and [PR CI 42996571429](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/42996571429), code SHA da0e65cc.

## Critical limitations

- **NOT the production runtime:** JSON stays the business system of record, including all normal customers, CRM, tickets, jobs, invoices, inventory, projects, proposals, finance and /api/state. New pilot SQL records do not appear in normal JSON business APIs; never create real production business data in the pilot.
- **No complete migration parity:** Only customer records, grants and CRM subset have writable PostgreSQL APIs. Historical owner-only records, invoices, payouts, RMA linked workflow, provider integrations, all transactional operations and cross-collection service logic are still pending SQL parity. Generic JSONB customer_records is interim staging, not fully normalized production tables.
- **DB trust boundary:** PostgreSQL custom GUCs are NOT database authentication. A person who possesses the pilot SQL login and can execute arbitrary SQL could set impersonating custom GUC values. The application never accepts arbitrary SQL/context from clients, but the pilot database login must be kept private and must not become a public production database role. Production authorization requires a separately reviewed, non-impersonable database identity design and credential isolation.
- **Audit limits:** Trigger audit is transaction-atomic for pilot writes, but PostgreSQL superusers/schema owners can still alter tables or audit history. Tamper-resistant audit/export, WORM retention and privileged-operator monitoring are not implemented.
- **No production restore/cutover:** pg_dump/pg_restore tests use only temporary PostgreSQL CI databases. No Hostinger or live/customer data was accessed, migrated, restored or overwritten. Live backup recovery, encrypted offsite copies and deployment rollback remain release gates.

## Safe developer/operator workflow

1. Install a throwaway PostgreSQL 16 service, then migration 001. Import only a preflight-approved *disposable* JSON snapshot outside Git with `npm run stage:postgres -- --source /absolute/private/fixture.json --apply` after its explicit staging guards. No production snapshot use is authorized by this phase.
2. Install migration 002 in that disposable database. Create a distinct local non-superuser `apex_pilot_login`, grant only `apex_pilot_writer`, and store the generated password outside Git. This is done by GitHub Actions for CI fixtures.
3. Run compiled Express with `NODE_ENV=staging`, an outside-checkout disposable APEX_DATA_FILE matching the staged tenant and users, and explicit `APEX_PG_PILOT_ENABLED=true`, `APEX_PG_PILOT_ACK=LOCAL_STAGING_ONLY_NO_CUTOVER`, `APEX_PG_STAGING_ACK=STAGING_ONLY_NO_PRODUCTION`, `APEX_PG_PILOT_DB=apex_stage_*`, `APEX_PG_PILOT_HOST=127.0.0.1`, `APEX_PG_PILOT_USER=apex_pilot_login`, and separate pilot password. Never route real customer traffic to this local listener.
4. CI creates/destroys the fixtures and validates the full HTTP, RLS, rollback and restore matrix. Keep Draft PR #1 unmerged until the remaining production gates pass.

## Next priority — Phase 10.3

Build an authenticated production-trustworthy SQL repository abstraction and normalize all business collections with correct tenant/customer composite FKs, atomic audit, migration crosswalk and source/target checks. Then verify non-PII staging cutover/rollback, multi-instance concurrency, managed database credentials, backups and real restore drills before any Hostinger deployment.

**Release decision:** Keep PR #1 Draft; main and deployed JSON unchanged. This is an implemented and CI-verified *partial Phase 10.2*, not complete platform migration.
