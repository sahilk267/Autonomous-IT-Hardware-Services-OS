# Phase 10.5C — JSON HTTP Shadow Parity, Transactional Outbox, Historical Customer Reconciliation

**Date:** 12 November 2026 (Asia/Kolkata). **Environment:** disposable, local PostgreSQL 16 CI / private JSON fixtures only. **Release status: STAGING ONLY, production cutover BLOCKED.**

## 1. Implementation

### A. Real authenticated JSON API → read-only SQL shadow comparison

- New `scripts/postgres/shadow_route_parity.mjs --source /absolute/outside-checkout/snapshot.json` boots the actual compiled Express JSON application on a temporary loopback port, using an **outside-checkout COPY of the already-imported private fixture**, never the authoritative snapshot file.
- It verifies the SHA-256 of the immutable original source against `apex.staging_imports` before comparing, checks the imported customer-to-staff grant crosswalk, logs in five synthetic staff identities with test-only hashed credentials, and performs **18 actual authenticated JSON GET-route/actor pair comparisons** for `/api/customers`, `/api/projects`, `/api/assets`, `/api/tickets`, `/api/crm`.
- Each PostgreSQL side of the comparison runs a fresh `REPEATABLE READ READ ONLY` transaction with the dedicated `apex_stage_reader` role and the matching test actor's **staging RLS context**. Only normalized digest and record-count comparisons are performed. The source snapshot is never mutated; no JSON business endpoint is redirected to SQL; no customer data, credentials or entire collection is printed.
- The shadow test runs **immediately after migration 001 and source staging import** and before any PostgreSQL pilot mutation or later RLS policy migration. It intentionally examines the legacy JSON route's current projection against the imported row/permission model under a controlled fixture; this is **not** a production identity, eventual-consistency or live dual-read comparison. Signed production-grade SQL identity has separate later tests.
- CI fails on any SHA mismatch, SQL row tamper, missing/extra visible record, customer name/ID drift or unsafe DB/source path. A negative control intentionally tampers a staged SQL CRM payload and proves the shadow comparator catches the mismatch, then restores the synthetic record.

### B. Historical per-customer mapping and quarantine reconciliation

- New `scripts/postgres/customer_reconciliation_manifest.mjs --source /absolute/outside-checkout/snapshot.json` independently checks original source-file SHA against SQL staging import provenance, tenant identity, customer count, registered customer names, all customer membership grants, and **per-customer canonical SHA-256 of every imported customer-scoped record**.
- It resolves legacy `proposals` to their source project and `rmaClaims` to their source asset, verifies same-customer links, rejects missing/duplicate/cross-customer records and compares every imported `owner_legacy_records` row against the original source. It runs only inside a read-only PostgreSQL transaction.
- Output contains **hashed customer identities, per-customer record/grant counts and digests, not raw customer names, secret tokens, payloads or usernames**. It flags `ownerOnlyMappingApproved: false` and `productionCutoverReady: false` even if the fixture reconciles, because legacy invoices, suppliers, inventory and other owner-only historical collections **still lack an approved customer-ownership crosswalk**.
- A synthetic SQL tamper and an unsafe default DB target are both negative tests. This is a reconciliation *manifest*, not an importer, account merger, migration promotion or approval for real customer data.

### C. Inert transactional service event outbox

- New PostgreSQL migration `008_staging_shadow_outbox.sql`, after 001–007, adds `apex.pilot_service_outbox` as the **16th FORCE-RLS table** and records schema marker `10.5c-shadow-outbox` (eight markers total). Each `(tenant, work_order_id, revision)` is unique and references the normalized work-order event and same-customer work order with SQL foreign keys.
- A `SECURITY DEFINER` event trigger attached to `apex.pilot_service_work_order_events` creates **one internal outbox record per accepted work-order revision in the same transaction** as the versioned work order, append-only event, and SQL audit. Trigger enforces current signed actor. If any outbox validation/insert fails, the entire work order, event, outbox and audit write are rolled back.
- `delivery_state` is schema-fixed to `PENDING_REVIEW`, `delivery_enabled` schema-fixed `false`, `delivery_attempts` fixed zero. Outbox payload contains only work-order ID, revision, internal operation and internal status. No external provider, customer notification, webhook, worker, API dispatch, payment, supplier PO or OEM integration exists.
- `apex_pilot_writer` can **SELECT** own-tenant/current-customer outbox for an authenticated owner, with **no INSERT/UPDATE/DELETE permissions**. SQL table and policy independently forbid the runtime from setting delivery enabled, sending or removing pending evidence. Optional owner-only `GET /api/pg-pilot/service-outbox` is localhost-staging-only and read-only.
- Real two-independent-server PostgreSQL CI tests prove exact one outbox row for each of five committed revisions; field cannot enumerate it; SQL writer cannot toggle delivery/delete. A forced outbox SQL constraint failure aborts all four related tables atomically.

## 2. Actual tests and status

- **FINAL IMPLEMENTATION CI GREEN:** Full Phase 10.5C code revision `2c9e58712feef56a9598a803efe6efcd957ec702`: [Push CI #43107048558](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/43107048558) and [PR CI #43107057579](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/43107057579) both `completed success`. All `postgres-staging`, `verify` and `browser` jobs PASS. Real staging import + HTTP shadow + customer mapping/grant digest/tamper **33/33**; authenticated PG HTTP **155/155**; two-process/outbox race + audit rollback **33/33**; blocked cutover checks **8/8**; PostgreSQL dump/restore **30/30**.
- The reconciliation manifest's negative controls were verified with fixture-derived owner-only legacy counts. Its `productionCutoverReady:false` and `ownerOnlyMappingApproved:false` flags remain intentionally unchanged even though all staging tests pass. The final documentation commit is independently subject to GitHub Actions.
- CI uses a true PostgreSQL 16 service, a separate `pg_dump` / `pg_restore` database and actual compiled Express HTTP/browser processes. Backup parity now includes **16 FORCE-RLS tables**, including the new outbox; cutover gate checks eight migration markers and refuses any outbox update/insert/delete grant, attempted delivery or nonzero delivery count.

## 3. Staging operator precautions

1. Only in a disposable local `apex_stage_*` PostgreSQL 16, install schema 001 and stage a private throwaway JSON source fixture. Build compiled `dist/server.cjs` first; run immutable source/target parity, `verify:pg:shadow -- --source <absolute-file>` and `verify:pg:customer-manifest -- --source <absolute-file>` **before** the pilot mutates SQL. Test hashed user credentials stay private in the outside-checkout disposable fixture and are excluded from PostgreSQL staff imports.
2. Install migrations 002, 003 (signed transaction key), 004, 005, 006, 007 and 008 in order. Use only local loopback pilot with explicit staging ACK and restricted SQL writer. Never set `APEX_PG_RUNTIME_ENABLED`, `NODE_ENV=production`, a public DSN, or real customer secrets.
3. Test authenticated SQL HTTP workflows, work-order multi-instance concurrency and trigger-induced rollback. Verify outbox remains `PENDING_REVIEW`, zero deliveries and zero external attempts, and ensure key/writer/table permissions cannot dispatch or clear the queue.
4. Run read-only cutover gate, then independent PostgreSQL dump/restore compare across all 16 tables. Cutover assessor is intentionally `BLOCKED` (exit code 3); `git push` or green CI is not approval to change production.

## 4. Open production blockers

- Ordinary dashboard and non-pilot business routes still use JSON data. This is **read-only offline shadow validation**, not real-time dual-read nor bidirectional sync, and is not production multi-instance shared auth.
- **Unmapped owner-only legacy records require explicit human-approved customer ownership.** Do not infer invoice/supplier/procurement/stock records from customer names or pricing.
- No outbox dispatcher exists; delivery is **permanently disabled** in migration 008. Real external transactions would require verified provider sandbox, idempotency, signed delivery evidence, retry/dead-letter, payload privacy/legal review and controlled operational approval.
- Production-grade PostgreSQL secret isolation/KMS, multi-tenant history crosswalk, encrypted managed backups, disaster recovery, traffic migration, client-side consistency, observation/rollback and Hostinger deployment are still blocked.

**Next recommended phase 10.5D / 10.6:** reviewed repository abstraction for a selected existing business route, gated nonproduction shadow reads under authenticated tenant context, reconciled customer-specific crosswalk without PII, and audited provider-independent outbox dispatcher *design* (delivery still off) before any staged customer cutover.

**Keep Draft PR #1 unmerged, `main` unchanged, live Hostinger and customer production data untouched.**

## Phase 10.5D follow-on verification

The staging-only **typed** PostgreSQL repository adapter adds an owner-only, feature-gated, SQL READ ONLY comparison endpoint for five JSON business domains. Historical reconciliation additionally verifies project/proposal, asset/RMA and staff custody/share links. A separate read-only outbox preflight checks existing pending events but **cannot send**, and future dispatch remains design-only. [Phase 10.5D report](PHASE_10_5D_REPOSITORY_CROSSMODULE_DISPATCH_DESIGN_2026-11-12.md).
