# Phase 10.5D — Nonproduction PostgreSQL Repository Read Adapter, Cross-Module Graph and Outbox Design Gate

**Date:** 12 November 2026 (Asia/Kolkata). **Branch:** `fix/phase1-security-integrity-20261106`. **Scope:** disposable local PostgreSQL 16 staging only; **never** live migration, production runtime switch, provider dispatch or Hostinger deployment. Draft PR #1 remains open/unmerged.

## Executive status

Phase 10.5D's **code** is CI-green. The original JSON business routes continue to be the system of record. The new typed PostgreSQL read adapter is diagnostic only behind an explicitly enabled nonproduction flag, historical cross-module links are reconciled against private fixture snapshots, and the outbox is assessed by a read-only, deliberately BLOCKED preflight. **No external delivery worker or outbox dispatch is installed.**

**Verified implementation SHA:** [`8f09da7dc94c9e63a3504c2318bb2b81606f8565`](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/commit/8f09da7dc94c9e63a3504c2318bb2b81606f8565).

| Real GitHub Actions CI | Result |
| --- | --- |
| [Push #43180700209](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/43180700209) | SUCCESS: backend `verify`, `browser`, `postgres-staging` |
| [PR #43180707071](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/43180707071) | SUCCESS: backend `verify`, `browser`, `postgres-staging` |
| PostgreSQL stage, authenticated shadow, source/customer graph & negative tests | **35 / 35 PASS** |
| Authenticated PostgreSQL HTTP pilot incl. repository feature-flag isolation | **160 / 160 PASS** |
| Two separate Express processes / normalized work-order and inert outbox | **33 / 33 PASS** |
| Read-only outbox dispatch-design rejection tests | **8 / 8 PASS** |
| Read-only production cutover denial tests | **8 / 8 PASS** |
| Independent PostgreSQL dump/restore with forced RLS | **30 / 30 PASS** |

## 1. Explicitly flagged read-only PostgreSQL repository abstraction

**Source:** `server/staging_read_repository.ts`, consumed by `server/postgres_pilot.ts`. The `StagingReadRepository` typed interface defines a bounded `readDomain(client, domain)` contract. `PostgresStagingReadRepository` is its implementation for **five allowlisted domains**: `customers`, `projects`, `assets`, `tickets`, `crmOpportunities`. Customer rows use the named SQL ID/name projection; the remaining four read imported JSONB business payloads via a bound `$1` domain parameter with PostgreSQL FORCE RLS. There is no arbitrary SQL from client-supplied domain strings.

Set `APEX_PG_REPOSITORY_SHADOW_READS=true` **only together with** existing `APEX_PG_PILOT_ENABLED=true`, `NODE_ENV=staging`, the loopback/private `apex_stage_*` database and pilot credentials, HMAC signing key, external private JSON path and staging acknowledgement. If flag is disabled (default), the route does not exist. If the flag is enabled without the pilot or outside staging, startup fails closed.

**Endpoint:** `GET /api/pg-pilot/repository-shadow`, authenticated `BUSINESS_OWNER` only. It executes inside the pre-existing per-transaction HMAC-validated PostgreSQL actor/tenant RLS envelope, but starts the **shadow's** transaction as `BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY`; adapter additionally checks `SHOW transaction_read_only` is `on`. No SQL write is issued and no new API writes to JSON. Source JSON is still authoritative. For each of five domains, the module canonicalizes + hashes source/SQL rows in server memory, returning only `match`, `jsonCount` and `postgresCount`, **not business data or row hashes**.

**Drift handling:** `matched:false` is a diagnostic, not an automatic backfill or a license to flip the source of truth. In the isolated HTTP fixture, JSON and independently mutated stage SQL intentionally differ; test confirms that drift is reported, that an owner can inspect counts but Sales/anonymous users cannot, and that the actual `/api/customers` JSON response is identical before and after. Normal `/api/*` routes are not wrapped or replaced by this adapter. This does **not** implement a production tenant-wide read repository or real-time dual-read consistency system.

## 2. Additional historical cross-module reconciliation

**Source:** `scripts/postgres/customer_reconciliation_manifest.mjs`, with real PostgreSQL tests in `tests/postgres/staging_rls_smoke.mjs`. Extends the existing immutable-source SHA256 and per-customer manifest to verify:

- Original source `project -> proposal` and `asset -> rmaClaims` parent/customer ownership; SQL `related_kind` / `related_id` / `customer_id` must match those source relationships.
- `created_by_staff_id`, `assigned_staff_id`, `reported_by_staff_id` must equal the source creator, engineer-custody and reporter references for every scoped business record; cross-tenant/customer links are not silently inferred.
- Source project collaborators must exist in the staff directory **and** have customer membership. PostgreSQL `project_shares` must exactly match source customer/project/staff tuples; a deliberate share drift must fail reconciliation.
- A SQL attempt to move a proposal to a project owned by another customer must fail the composite FK constraint. The stage manifest compares exact scoped per-customer digests and owner-only legacy rows while returning **only hashed customer IDs and aggregate counts**.

All checks are performed against a disposable fixture in `REPEATABLE READ READ ONLY` transactions. **Owner-only legacy financial/inventory/provider collections remain unmapped** to customers; `ownerOnlyMappingApproved:false` and `productionCutoverReady:false` are intentional. There has been no real customer-data migration or backfill.

## 3. Auditable outbox dispatch *design*; no delivery implementation

**Source:** `scripts/postgres/outbox_dispatch_plan.mjs`, `tests/postgres/outbox_dispatch_plan_smoke.mjs`, and [pre-approval dispatcher design and release gates](OUTBOX_DISPATCH_PREAPPROVAL_DESIGN_2026-11-12.md). Run only in local disposable PG16 staging with `npm run assess:pg:outbox-plan`. The assessment is a read-only PostgreSQL transaction; it inspects the existing **sealed Phase 10.5C outbox** and normalized service history, verifies **one pending outbox row per accepted work-order event**, consistent JSON event keys/status/revision/customer, FORCE RLS, and **no INSERT/UPDATE/DELETE grant** for the app writer. It never exposes business rows in output.

**Exit code 3 means intentionally BLOCKED**, not a failed test. The dedicated CI smoke script expects exit code 3 and checks no DB side effects, unsafe DB refusal, production refusal, attempted enable-delivery flag refusal, and the absence of any `--send` command. Eight smoke assertions pass. Any event/history drift produces integrity failure (exit code 1), and unsafe context exits 2.

`pilot_service_outbox` remains structurally locked to `PENDING_REVIEW`, `delivery_enabled=false` and `delivery_attempts=0`. Neither this script nor the staging HTTP pilot creates leases, picks a provider, invokes external APIs or sends notifications. Future operational design includes provider sandbox certification, secure lease fencing, tenant-scoped service identity, replay-safe consumer idempotency, signed receipts, retries/dead letters and emergency kill-switch; **these are requirements, not implemented features**.

## 4. CI, rollbacks and expected staging commands

1. Build the app, stage **only disposable private snapshots** in local `apex_stage_*` PG16, and run full source parity, authenticated JSON HTTP shadow and per-customer manifest **before** any SQL pilot write. Run migrations 001–008 in order and use disposable local pilot identity/signing key. Normal `/api/*` remains JSON-only.
2. To opt in to repository diagnostics for a throwaway instance, explicitly set `APEX_PG_REPOSITORY_SHADOW_READS=true` alongside all existing pilot safety flags. Check the **owner-only** GET and `matched`/counts. SQL drift should halt any proposed migration approval; do not auto-sync or correct customer mappings.
3. Run `npm run smoke:pg:pilot`, `npm run smoke:pg:multi-instance`, `npm run smoke:pg:outbox-plan` and `npm run smoke:pg:cutover`, then independent PG dump/restore. The two assessment scripts return BLOCKED (exit 3) even when safe; their smoke wrappers verify this expected outcome.
4. If discrepancies arise, stop the experiment and restore the disposable staging DB/snapshot. Do not copy real customer files into test fixtures; do not merge Draft PR or alter live JSON or Hostinger.

## 5. Explicit non-deliverables and next steps

**Not complete:** normalization of every business domain, migration of normal routes from JSON, production PostgreSQL identity management / KMS, approved customer-level mapping of owner-only legacy records, distributed sessions, production tenant-isolation tests, real outbox dispatcher, provider/OEM/payment validation, legal invoices/GST, encrypted managed backup and recovery proof, and live rollout/rollback.

**Recommended Phase 10.5E / 10.6:** design a narrow per-tenant read-through repository rollout for a single existing business endpoint with no switch-on by default; independent two-tenant acceptance, golden JSON vs SQL visibility contract, safe owner-only canary telemetry; prepare but do **not enable** delivery ledger/lease schema until provider sandbox, audit, legal/privacy and operations approval.

**Production SQL cutover: BLOCKED. Main branch unchanged. Keep Draft PR #1 open and unmerged.**
