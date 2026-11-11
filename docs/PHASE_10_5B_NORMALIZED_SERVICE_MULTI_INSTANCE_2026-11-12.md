# Phase 10.5B — Normalized SQL service work orders and two-instance concurrency

**Date:** 12 November 2026 (Asia/Kolkata). **Staging-only incremental feature.** Development branch: `fix/phase1-security-integrity-20261106`; Draft PR #1 remains open.

## Executive result

Phase 10.5A idempotent internal procurement and unissued finance requests, the new 10.5B normalized work-order SQL repository, multi-instance concurrency and PostgreSQL backup/restore are verified on disposable PostgreSQL 16 and two independent loopback Express servers. This is **not** a production database migration. All normal `/api` business endpoints and the main customer application still use single-tenant JSON as the source of truth.

**Verified code SHA:** [`397f840b48a065f14096add8b3ca29f0d3532689`](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/commit/397f840b48a065f14096add8b3ca29f0d3532689).
- [Push workflow #43102224573](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/43102224573): COMPLETED SUCCESS — all `verify`, `browser`, `postgres-staging` jobs passed.
- [PR workflow #43102234533](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/43102234533): COMPLETED SUCCESS — all three jobs passed.

| Real CI checks | Result |
| --- | --- |
| Source JSON import, staging PostgreSQL forced-RLS / parity | **27 / 27 PASS** |
| Authenticated PostgreSQL HTTP, including eight concurrent procurement and eight finance POSTs | **155 / 155 PASS** |
| Separate Express processes racing the same SQL work-order version | **26 / 26 PASS** |
| Read-only SQL production cutover-denial gate | **8 / 8 PASS** |
| Real PostgreSQL dump to independent database and restore with auth/RLS | **29 / 29 PASS** |
| Node backend, TypeScript, production build, Chromium login/isolation | **PASS** |

## 1. Normalized PostgreSQL repository boundary

`migrations/postgres/007_staging_normalized_service_orders.sql` is installed after migrations 001–006 and adds the staging-only marker `10.5b-normalized-service`.

- `apex.pilot_service_work_orders`: first non-JSONB, typed relational service work-order table with tenant/customer composite scope, staff-creator FK, optional field-engineer FK, immutable title and creator, bounded four-state internal dispatch workflow, database-owned integer `revision` and timestamps. Role/tenant/customer/assignment is enforced in PostgreSQL FORCE RLS.
- `apex.pilot_service_work_order_events`: immutable append-only normalized transition ledger with `(tenant,order_id,revision)` primary key, same-customer FK to work order, signed actor and status/assignment transition metadata. Signed owner can read; runtime writer has SELECT only and cannot directly append, update or delete.
- `apex.validate_pilot_service_order_update()`: SECURITY DEFINER BEFORE UPDATE trigger validates signed current actor, immutable identifying columns, manager-only field reassignment, required active engineer customer grant, no-op refusal, valid sequential internal status, and increments revision exactly once in SQL. Runtime role cannot update `revision`, owner/customer/source IDs, title, timestamps or creator columns directly.
- `apex.capture_pilot_service_order_event()`: AFTER INSERT/UPDATE trigger creates one normalized history row and one standard SQL pilot audit event within the **same transaction**. A failed history/audit event rolls the entire business update back.
- Both new tables use FORCE RLS. Total staging FORCE-RLS business tables: **15**. Total schema markers checked: **7**.

## 2. Authenticated staging-only API

Only when the preexisting loopback isolated PostgreSQL staging pilot is deliberately enabled:

- `GET /api/pg-pilot/service-work-orders`: owner/IT head can list accessible customer orders; field role sees exact assigned order only while its customer grant is active.
- `POST /api/pg-pilot/service-work-orders`: manager creates an unassigned `SCHEDULED` order with server-generated ID/creator. Client cannot fabricate tenant, customer association, final status, engineer, revision or external completion.
- `PATCH /api/pg-pilot/service-work-orders/:id/assign`: owner/IT head must supply active engineer or null and `expectedVersion`, requiring customer membership; the DB controls revision increments and authorization.
- `PATCH /api/pg-pilot/service-work-orders/:id/status`: owner/IT head/assigned engineer supply only next internal state and `expectedVersion`. `SCHEDULED → EN_ROUTE → CHECKED_IN → DIAGNOSING`; `COMPLETED`, customer signoff and any externally verified status are not supported.
- `GET /api/pg-pilot/service-work-orders/:id/history`: owner only; full append-only SQL transitions.

**Optimistic concurrency:** `UPDATE ... WHERE order_id=$id AND revision=$expectedVersion` inside SERIALIZABLE transaction; a stale expected version is HTTP `409`, not a silent lost update. The Phase 10.5A bounded 40001/40P01 retry infrastructure retries only after confirmed ROLLBACK, releases its connection before backoff, and signs a fresh actor/transaction envelope on each attempt.

## 3. Two-instance test evidence and limitations

`tests/postgres/multi_instance_workorders.mjs` launches **two separate compiled Express processes** on two independently allocated loopback ports with **separate disposable JSON authentication fixtures** and independent local session stores. Both share the same isolated PostgreSQL 16 service and restricted SQL login. The fixture is not deployed customer data.

Test sequence: owner on server A creates a customer-B order; owner on server B immediately sees it; Sales denied; unassigned field hidden; ungranted engineer assignment denied; owner grants customer-B membership; IT Head on server B assigns field, revision becomes 2; owner on server A and field engineer on server B race `EN_ROUTE` with `expectedVersion=2`; **exactly one succeeds (HTTP 200) and the stale competitor receives HTTP 409**. DB stays at version 3, then valid `CHECKED_IN`/`DIAGNOSING` reach revision 5. An owner-only history query returns precisely revisions 1–5; SQL audit contains exactly 5 events. Premature completion, skipped status, unauthorized SQL revision/history mutation, unsigned raw SQL, and post-revocation field access all fail. The test covers 26 checks.

This proves **two test processes using one PostgreSQL database**, not production horizontal scalability. Independent fixture session stores are intentionally not shared; production distributed authentication/session persistence, public reverse proxy behavior, outage recovery, multiple tenants with distinct identity sources and load testing are still P0.

## 4. Migration, backup and readiness gates

- `.github/workflows/ci.yml` installs migration 007 after 006, then runs original 155 SQL HTTP tests followed by two-process service tests, read-only cutover gate, then independent pg_dump/pg_restore.
- `scripts/postgres/cutover_readiness_gate.mjs` requires the seventh schema marker and all **15 FORCE-RLS** tables. Its intended `gate: BLOCKED` and exit code `3` remain unchanged: even healthy stage database and all green CI do **not** authorize production rollout.
- `tests/postgres/restore_rehearsal.mjs` includes both normalized tables in the source/target full-row backup comparison (29 checks), not merely a schema-exists assertion; both contain real test records.
- Work-order test is run **after** the Phase 10.5A HTTP pilot fixture; it does not replace the source snapshot or perform bidirectional migration. SHA/row parity checker still applies only before staged SQL mutation, not to a real customer cutover.

## 5. Remaining production blockers and next engineering slice

**Still not done:** Full normalized PostgreSQL repositories for projects, tickets, assets, invoices, procurement orders and RMA; bridging normal Express/UI business routes from JSON to SQL with flags; cross-tenant historical customer record mapping; approved source/target migration and rollback; real provider/payment/OEM integrations, financial compliance, transactional outbox, production credential management, shared session/authentication infrastructure, immutable external audit store, managed backups and Hostinger staging/production deployment.

**Next recommendation: Phase 10.5C / 10.6** — select one existing real JSON business endpoint for controlled dual-read against PostgreSQL in an offline/shadow nonproduction fixture; build a transactionally consistent outbox for future provider event delivery while leaving delivery disabled; add approved migration parity checks and real multi-tenant independent process isolation. Require explicit release approval before any live cutover.

**Do not merge PR #1 or deploy SQL pilot to production. `main` remains unchanged.**

## Phase 10.5C staging continuation

An append-only, SQL-triggered **inert** service outbox now tracks one pending internal event per normalized work-order revision and rolls back with any failing service/audit mutation. Read-only shadow comparator checks actual JSON API route visibility against imported SQL, and a customer-specific SHA/grant manifest flags unapproved legacy ownership. There is no dispatcher or production cutover. [Full Phase 10.5C report](PHASE_10_5C_SHADOW_OUTBOX_RECONCILIATION_2026-11-12.md).
