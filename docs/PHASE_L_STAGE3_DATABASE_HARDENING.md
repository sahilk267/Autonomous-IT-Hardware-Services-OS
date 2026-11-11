# Phase L Stage 3 — Normalized Critical PostgreSQL Ledgers

**Date:** 2026-11-12  
**Status:** Implementation on review branch. PostgreSQL 16 Stage 3 CI has passed, but production rollout **NOT approved** until a real data-migration, backup/restore and rollback rehearsal is verified.

## What Stage 3 changes

Stage 2 added the PostgreSQL runtime, but kept every business object inside a tenant-owned JSONB workspace snapshot. Stage 3 moves four high-risk collections to **authoritative normalized PostgreSQL tables**:

| API/state collection | Authoritative SQL object | Constraints |
| --- | --- | --- |
| Products / warehouse balances | `apex_catalog_products` | Composite tenant+product ID, unique tenant-scoped SKU, non-negative integer stock and reserved-stock limits |
| Invoices | `apex_finance_invoices` | Composite tenant+invoice number, amount precision, status validation, invoice ID uniqueness and settled-invoice finality |
| Immutable settlement proofs | `apex_invoice_settlements` | Composite invoice FK, no UPDATE/DELETE grants, deferred invoice/settlement pairing at transaction commit |
| Inventory movement journal | `apex_inventory_movements` | Product composite FK, exact quantity math, immutable append-only INSERT/SELECT RLS, indexed by product/time |
| Quotations | `apex_finance_quotes` | Tenant-scoped quote numbers/IDs, status and numeric checks |
| Cutover gate | `apex_critical_ledger_ready` | Explicit versioned readiness, DB trigger rejecting auto-marking legacy populated workspaces |

The existing Express APIs still use a per-request, tenant-scoped in-memory state facade for compatibility. **After Stage 3 starts, products, invoices, inventory movements and quotations load from and commit to the normalized tables within the SAME PostgreSQL transaction as the noncritical JSONB snapshot and append-only audit.** The JSONB snapshot intentionally stores empty arrays for these four collections to prevent divergent sources of truth.

Every new record is checked against the authenticated tenant. An attempted cross-tenant mutation, duplicate SKU/invoice, negative stock, mismatched journal, invalid financial amount or duplicate settlement fails the transaction. The database role cannot update/delete movement/settlement/audit entries. Invoice settlement carries a deferred matching proof, enforced at PostgreSQL transaction commit.

**Security improvements:** Early request authentication before business-state hydration; webhook-secret validation before loading expensive state; owner/procurement permissions for product management; owner/field-engineer permissions for spare-parts consumption; dedicated owner/procurement stock-adjustment endpoint with a matching inventory movement; browser reset cannot erase legal financial/inventory history.

## REQUIRED rollout sequence — PostgreSQL 16+

1. **Do not use this branch on live data without an offline trial.** Preserve an encrypted PostgreSQL backup and a verified, immutable JSON snapshot, plus a maintenance window. Test full restore to a different database.
2. Merge/review in order: Phase K PR #2, Phase L Stage 1 PR #3, Stage 2 PR #4, Stage 3 PR #5. All previous stages are dependencies.
3. Stop all application writers. Apply versioned migrations with a schema owner role, **not** the app runtime login:

   ```bash
   # In a PRIVATE operator shell, not in the running web service:
   export APEX_MIGRATION_DATABASE_URL='postgresql://migration-role:.../apex'
   node scripts/postgres-admin.mjs migrate
   node scripts/postgres-admin.mjs grant-runtime apex_runtime
   ```

4. For **existing PostgreSQL Stage 2 organizations**, explicitly backfill each tenant into normalized ledgers **while writes remain stopped**:

   ```bash
   node scripts/postgres-admin.mjs backfill-critical <verified-tenant-uuid>
   node scripts/postgres-admin.mjs verify-critical <verified-tenant-uuid>
   ```

   The command locks the workspace, refuses existing target ledger rows or repeated backfills, validates tenants/product IDs/SKUs/invoices/movement equations, writes normalized rows, scrubs duplicate workspace collections, inserts readiness marker and audits the operation **atomically**. Historical stock journal must reconcile with the final catalog balance. Failures roll back the whole transaction. Do not silence/rewrite mismatches automatically.

5. For a **new empty tenant**, provision using the operator utility and then enroll an administrator using `APEX_SETUP_TOKEN` over the exact HTTPS origin. The first setup creates an empty readiness marker; imported tenants instead require explicit backfill.
6. For a **legacy JSON import**, use `import-dry-run` → `import-confirm` → `backfill-critical` → `verify-critical`. Keep the original JSON offline and never permit concurrent writers or a mixed JSON/PostgreSQL source of truth.
7. Start a single test instance with `APEX_STORAGE_MODE=postgres`, `APEX_TENANT_ID`, limited-role `DATABASE_URL`, and exact HTTPS `APP_URL`. Startup refuses a tenant with unbackfilled finance/inventory data, missing policies or RLS-bypass credentials.
8. Verify owner setup/login, operator role restrictions, product receipt/stock adjustment, field engineer consumption, quote approval/rejection, invoice issue/settlement, historical queries, repeated settlement rejection, cross-tenant denial, restart persistence and SQL-versus-API totals.
9. Run `verify-critical` again **after** acceptance tests. Review audit events and database health. Enable production only after a separate complete migration/restore signoff.

## Runtime behavior and changed API contract

- `POST /api/products/:id/stock-adjust` (BUSINESS_OWNER or PROCUREMENT_LEAD), JSON `{ "delta": -2, "reason": "Documented warehouse movement" }`. `delta` must be a nonzero safe integer; it records an IN/OUT inventory movement matching the stock change. Physical/reserved stock must never become invalid.
- Direct `PATCH /api/products/:id` with `stockAvailable` or `stockReserved` is rejected in PostgreSQL mode. Product creation may establish an initial opening stock balance; opening balance approval is an outstanding control.
- `POST /api/products`, `PATCH /api/products/:id` and `DELETE /api/products/:id`: BUSINESS_OWNER or PROCUREMENT_LEAD only. Catalog deletion after referenced inventory journal activity is denied by FK.
- `POST /api/jobs/:id/consume-part`: BUSINESS_OWNER or FIELD_ENGINEER only, with stock deduction + movement insert inside one transaction.
- Invoice creation is restricted to positive two-decimal amounts and active status; settlement requires BUSINESS_OWNER. Repeated settlement returns 409; database triggers prohibit altering already-settled invoice finance fields or an unmatched settlement.
- `POST /api/state/reset` returns 409 in PostgreSQL mode to protect financially significant records. **The UI reset workflow is intentionally disabled for SQL mode.** Use an audited retention/archive workflow instead.

## Verification and explicit blockers

| Check | Status |
| --- | --- |
| Stage 3 TypeScript/build | **PASS — GitHub Actions** |
| Stage 3 core validation and transition unit tests | **PASS — GitHub Actions** |
| PostgreSQL 16 real RLS, composite FK, invoice settlement and journal immutability integration | **PASS — GitHub Actions** |
| Two-tenant real production-bundle HTTP acceptance, including stock adjustment, settlement, restart and legacy import/backfill | **PASS — GitHub Actions** |
| Windows service/Hostinger HTTPS behind real reverse proxy | **NOT RUN** |
| Migrating a real production dataset and verifying rollback/restore | **NOT RUN** |
| Single-process dynamic tenant routing and self-service workspace switching | **NOT IMPLEMENTED** |
| Normalization of remaining ITSM/projects/CRM/AI/Telegram records | **NOT IMPLEMENTED** |
| Durable cross-instance rate limits, DB connection load shedding and payment gateway reconciliation | **OPEN** |

**Operational cautions:** Each running application instance remains bound to one provisioned tenant UUID, though one PostgreSQL cluster may host multiple RLS-isolated organizations. The generic JSONB snapshot persists noncritical records and is still held within a transaction during API operations. Long external AI calls may therefore hold DB locks. A release-grade migration needs load tests, query budgets, observability, encryption/key rotation, offsite encrypted backups and tested recovery objectives.

**Do not configure multi-tenant public hosting, remove old backups, or switch production DNS solely because lint/build/tests eventually pass.**


## CI evidence

[Complete Stage 3 PostgreSQL 16 acceptance](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/43105839742) succeeded on commit `6ad37cfb3754aba35f90abdaf3ef6cf479a4fbab`: TypeScript lint, unit tests, build, RLS baseline, two-tenant HTTP integration and Stage 3 SQL constraints all passed. Later documentation-only commits require their own final CI verification. This test run uses **disposable** databases and is not a production migration/restore certification.
