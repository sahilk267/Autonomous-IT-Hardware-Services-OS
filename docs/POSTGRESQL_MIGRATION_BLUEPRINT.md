# PostgreSQL Migration Blueprint — Design Only, NOT IMPLEMENTED

**Status:** Architecture design / future Phase 10 release gate. Source-of-truth remains a single-process JSON file. This document does NOT certify PostgreSQL support.

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
