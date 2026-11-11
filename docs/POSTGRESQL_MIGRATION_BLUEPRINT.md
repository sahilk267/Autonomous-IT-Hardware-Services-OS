# PostgreSQL Migration Blueprint — Design Only, NOT IMPLEMENTED

**Status (2026-11-11):** Phase 10.1 has an actual isolated PostgreSQL 16 staging schema with forced RLS, offline one-way staging import and SQL integration tests. However **the Express application is still JSON-backed**, database writes/production migration are NOT implemented, and this blueprint remains the architecture for subsequent phases. See [Phase 10.1 implementation](PHASE_10_POSTGRESQL_STAGING_2026-11-11.md).

## Target schema (proposed)

- \`tenants(id uuid PK, name, created_at)\`; \`staff_users(id uuid PK, tenant_id FK, role enum, disabled_at, password_digest)\`; \`staff_sessions(id uuid PK, tenant_id FK, user_id FK, expires_at, revoked_at)\`.
- \`customers(id uuid PK, tenant_id FK, name, created_at)\`; unique \`(tenant_id, lower(name))\`; \`customer_staff_grants(tenant_id, customer_id, staff_user_id, granted_by, granted_at, revoked_at)\` with FKs.
- Business collections (project, proposal, ticket, job, endpoint, asset, RMA, CRM, AMC, quotation, lead, invoice, ledger) store tenant_id NOT NULL and customer_id NOT NULL **where customer-owned**, with same-tenant composite FKs \`(tenant_id, customer_id)\`. Optional internal shared catalog/supplier tables need explicit policy, not accidental unscoped access.
- \`project_collaborators(tenant_id, customer_id, project_id, staff_user_id, grantor, granted_at)\`. Field service assignments reference the authorized staff user of the same tenant/customer. RMA uses composite FK to its customer-owned asset; proposals use composite FK to project.
- \`audit_events\` append-only, \`actor_user_id\`, \`tenant_id\`, \`customer_id\`, \`object_type/id\`, timestamp, causation id and before/after hash; DB role cannot mutate stored history without a privileged audited maintenance workflow.
- Financial settlement and external integration evidence in dedicated tables, with signed provider event IDs and idempotency keys; don't mark transfers/IRN verified solely from app input.

## Isolation model

1. No cross-tenant query without DB transaction-scoped authorized tenant context. Use \`SET LOCAL app.tenant_id = ...\` and \`SET LOCAL app.actor_id = ...\` in a transaction for *each* request; never trust request body/header for these.
2. Enable \`ROW LEVEL SECURITY\` and \`FORCE ROW LEVEL SECURITY\` for tenant and customer-owned tables. API DB role must not have BYPASSRLS. Default deny when context is missing.
3. Policies require \`tenant_id = current_setting('app.tenant_id', true)::uuid\` and customer membership; owner bypass only *within* their authenticated tenant. For projects, add creator/collaborator relation and workflow-specific roles. For field assets/jobs/endpoints/RMA also check exact user assignment.
4. Use composite tenant-scoped FKs and transactions for customer grant/assignment, project award/proposal counter and audit. Unique indexes protect tenant customer names, serialized project awards and idempotent provider events.
5. Use separate read-only reporting role, app pool with minimum privileges and row-level tests for every business table, export, joined endpoint and user role.
6. The local \`customerId\` strings use \`cust-...\` UUID-ish prefixes today; mapping to target UUID columns must preserve an immutable source_id→new_id crosswalk and verify every FK. Do not reinterpret records based on customer display name.

## Data migration / cutover design

- **Inventory:** Read-only \`npm run preflight:customers -- --source /private/absolute/file.json\` (script expects \`--source\`; confirm command syntax when operating) should identify all unlinked customers, invalid grants, orphan RMA/proposals and legacy data, no writes.
- **Backup:** Stop writer, create private immutable snapshot + SHA256, verify a second copy and *restore it* offline, retain a tested rollback artifact. Encrypt and restrict access to raw data/credentials.
- **Staging:** Provision PostgreSQL with real TLS, encryption at rest, credentials and migrations. Import a copy into staging; use a locked migration version, immutable source ID crosswalk, deterministic mapping and dual checksums. Never claim completed migration without row counts and FK checks.
- **Cutover:** Freeze writes, take final snapshot, validate all target counts/integrity and 5-role/two-tenant denial matrix; switch runtime only after route and browser acceptance. On failure, roll back the app and source store while writes remain stopped.
- **Operations:** Restore drills, retention, point-in-time recovery, migrations with backward-compatible deploys, alerts for failed RLS context, concurrent writers load tests and backup monitoring.
- **Release gates:** Full customer/tenant coverage across invoices/quotes/leads/procurement/knowledge/event logs, historical data decisions, actual RLS tests, GDPR/Indian privacy policies as applicable, and operator sign-off.

No driver, SQL migration, RLS policy, PostgreSQL deployment, customer portal or live cutover is included in this Phase 9 implementation. This blueprint is future work.

## Phase 10.1 staging-specific implementation note

The verified staging schema uses `TEXT` IDs (preserving existing prefixed IDs) and a typed `customer_records` JSONB staging table rather than claiming fully normalized production UUID tables. It is deliberately **read-only for the application role**, with owner-only legacy data and a restricted local importer. Production grade SQL-backed auth, RLS writes, normalization and full multi-tenant release gates remain to be built. Do not treat the SQL staging schema as a drop-in replacement for `PersistentStore`.

## Phase 10.2 actual progress

A staging-only and authenticated PostgreSQL write pilot is implemented using migration 002, a NOLOGIN restricted writer role, customer/grant and CRM API subset, SQL transaction-scoped context and database triggers for same-transaction audit. Real HTTP+RLS and backup/restore tests pass. See [Phase 10.2 report](PHASE_10_2_AUTHENTICATED_PG_PILOT_2026-11-11.md).

**Not yet done:** complete SQL repository/domain migration, production database identity that cannot be impersonated via arbitrary SET LOCAL GUC statements, customer-data historical parity, all module workflows, production recovery, Hostinger connection or customer portal. PostgreSQL remains separate from JSON source of truth.
### Staging source/target parity implemented in Phase 10.2

The read-only `scripts/postgres/verify_staging_parity.mjs` now checks the staged JSON source SHA256, tenant identity, staff metadata, every customer-bound and owner-only staged payload, customer grants, project shares and original audit rows against PostgreSQL. It deliberately detects source or DB payload tampering without writing either side. **It is for quiescent, isolated staging snapshots only; production historical customer mapping and cutover parity remain unimplemented.** See [Phase 10.2 report](PHASE_10_2_AUTHENTICATED_PG_PILOT_2026-11-11.md).

## Phase 10.3 verified direction (staging, not production)

Staging migrations 003 and 004 implement a per-transaction signed PostgreSQL context and limited project/ticket/asset/field-job repositories with forced RLS, field assignment/customer membership, same-transaction audit and negative authorization tests. These are narrower than the full multi-tenant transactional domain repositories still required. Source/target parity remains pre-pilot-import-only. Details: [Phase 10.3 security and domain report](PHASE_10_3_SIGNED_CONTEXT_DOMAIN_REPOSITORIES_2026-11-11.md).

## Phase 10.4 staging-only draft progress

Migration 005 now contains composite tenant/customer-linked RLS rules for unissued quotes, internal project proposals and asset RMAs; separate immutable procurement request and owner finance preview ledgers use FORCE RLS and SQL audit. See [Phase 10.4](PHASE_10_4_COMMERCE_DRAFTS_2026-11-11.md). These are NOT production invoices, orders, verified provider submissions or payments. Normal Express runtime remains JSON; historical migration and cutover are still blocked.

## Phase 10.5A — transaction concurrency and readiness controls

A staging-only immutable request key ledger (`migrations/postgres/006_staging_idempotent_drafts.sql`) allows actor-scoped safe HTTP retries for internal procurement drafts and unissued finance previews. SERIALIZABLE transaction conflicts (40001) and deadlocks (40P01) retry only after rollback and with a newly signed PostgreSQL transaction context. The **read-only** `scripts/postgres/cutover_readiness_gate.mjs` verifies PG16 schema, role grants and import provenance but **always blocks production cutover** until full historical migration, normalized repositories, sandbox providers and disaster recovery are proved. [Phase 10.5A report](PHASE_10_5_TRANSACTION_RETRIES_CUTOVER_GATE_2026-11-12.md).

## Phase 10.5B — normalized work-order pilot with real cross-process revision race

`migrations/postgres/007_staging_normalized_service_orders.sql` introduces the first narrowly scoped **typed relational** service work-order domain and append-only versioned history under forced SQL RLS. Manager assignment requires customer membership, field updates require exact object assignment, and database trigger enforces SCHEDULED → EN_ROUTE → CHECKED_IN → DIAGNOSING while incrementing revision atomically. Two independently authenticated disposable Express processes share PostgreSQL and demonstrate a single winner of a revision-2 write (HTTP 200 vs stale HTTP 409), with exactly one audit event per actual write. [Full Phase 10.5B report](PHASE_10_5B_NORMALIZED_SERVICE_MULTI_INSTANCE_2026-11-12.md). Normal business API, JSON storage, production DB and historical import path remain unchanged; the read-only cutover assessor reports **BLOCKED** despite CI passing.

## Phase 10.5C — isolated HTTP shadow, customer historical digest and disabled outbox

[Phase 10.5C report](PHASE_10_5C_SHADOW_OUTBOX_RECONCILIATION_2026-11-12.md) adds real cookie-authenticated JSON GET vs read-only PG staged role-scope comparisons (18 fixture views, no runtime switch), original snapshot SHA checks and customer-specific/grant/owner-only digest manifest. Migration `008_staging_shadow_outbox.sql` adds one trigger-atomic internal pending outbox per normalized work-order revision, immutable `PENDING_REVIEW`/no delivery and no app-writer DML. Staging grows to eight migration markers and sixteen FORCE-RLS tables. Owner-only legacy rows still require approved ownership mapping; historical production migrations, bidirectional sync and live SQL cutover are NOT implemented.
