# Phase 10.5A — Transaction-safe draft retries and a fail-closed cutover gate

**Date:** 12 November 2026 (Asia/Kolkata). **Branch:** `fix/phase1-security-integrity-20261106` (Draft PR #1).
**Deployment status:** BLOCKED. Stage-only incremental verification, NOT a general production PostgreSQL cutover.

## Delivered architecture

1. **Immutable idempotency ledger** `migrations/postgres/006_staging_idempotent_drafts.sql` adds `apex.pilot_request_keys`, the 13th FORCE-RLS staging business table. It enforces a unique `(tenant_id,actor_staff_id,request_key)` claim with trusted server-authenticated actor, customer access, operation, SHA-256 request digest, and generated resource ID. `apex_pilot_writer` only has SELECT/INSERT, never UPDATE/DELETE. The SQL schema has tenant/customer and staff composite FKs. No payment credentials or customer request bodies are stored in this ledger.
2. **Opt-in HTTP retry key** only on `POST /api/pg-pilot/procurement-drafts` and `POST /api/pg-pilot/finance-previews`. Provide an `Idempotency-Key` header of 12–80 URL-safe characters to create/replay the exact same authenticated request. The same key and same canonical payload returns the original existing draft as HTTP **200**; its first committed creation returns **201**. Reusing the same authenticated staff key for a changed payload, customer, or different draft operation returns **409**. Without the header, previous semantics remain (no general deduplication for procurement, existing quote-unique constraint for finance).
3. **Atomic request claim and business audit**: request key claim, customer-bound draft INSERT and trigger-generated audit are inside one SERIALIZABLE DB transaction. A failed audit trigger rolls back both new business row and request-key claim; retrying the exact key after recovery may create the single record. A replay never creates another audit event.
4. **Bounded serialization retries**: `server/postgres_pilot.ts` retries PostgreSQL `40001` serialization failure or `40P01` deadlock up to three additional attempts after SQL ROLLBACK. Each attempt uses a **new signed transaction envelope** tied to PostgreSQL `txid_current()` and `pg_backend_pid()`. Operations are staging-local DB-only. There are **no external side effects** and no indefinite retry loop. Exhausted conflicts return an error; no claim of exactly-once delivery or cross-system distributed transactions is made.
5. **Cutover readiness gate**: `npm run assess:pg:cutover` is a read-only, local-only PostgreSQL 16 assessment. It checks six schema version markers, all **13 FORCE-RLS staging tables**, restricted writer privileges, import SHA-256 provenance and aggregate staged record/draft counts. It returns a machine-readable `gate: BLOCKED` with explicit release blockers; **exit code 3 means safely blocked**, not failed verification; exit 1 means assessment/integrity failure and exit 2 unsafe environment refusal. It has no option to promote the database, deploy or flip the runtime.
6. **CI/test coverage**: `tests/postgres/authenticated_pilot_http.mjs` now tests eight concurrent same-key purchase-request HTTP posts and eight finance-preview posts, immutable request/one-audit replay, per-actor uniqueness, cross-operation and payload conflict, malformed key rejection, and a deliberately failed audit whose key claim rolls back. `tests/postgres/readiness_gate_smoke.mjs` requires BLOCKED, verifies it ran read-only, rejects production/default DB and ensures report never prints DB/HMAC secrets. `tests/postgres/restore_rehearsal.mjs` independently restores and compares all 13 FORCE-RLS tables, including retry keys.

## What the safe retry mechanism does NOT do

- It does not automatically deduplicate old requests without a supplied key, import historic finance/payment transactions, retry external provider calls, or process any payment/PO. It is only for **internal staging drafts**.
- It does not make JSON-backed runtime PostgreSQL-backed. Ordinary `/api/state`, customer dashboards and the bulk of business workflows still use the JSON system of record.
- It does not deliver fully normalized SQL records, non-impersonable managed production DB authentication, multi-instance shared session storage, high-availability migration, full domain parity, or a certified disaster-recovery/cutover plan.
- All PostgreSQL work uses isolated CI/test fixtures with signing keys generated for staging only. No Hostinger customer database was accessed or production secrets used.
- A PostgreSQL superuser or the app/DB key owner can still alter data or audit. The audit is transaction-atomic for pilot writes but is NOT an external immutable compliance ledger.

## Operator recipe (local disposable DB only)

1. Start a fresh disposable `apex_stage_*` PostgreSQL 16 DB, install migrations `001 → 002 → 003 → 004 → 005 → 006` in the workflow-defined sequence, stage a private throwaway snapshot and validate source parity BEFORE pilot mutations. Install/rotate a private 32-byte HMAC context key as described in the Phase 10.3 runbook.
2. Start compiled Express with `NODE_ENV=staging` and the existing private JSON auth fixture outside checkout; enable only the loopback staging pilot with explicit safeguards and local non-superuser login. No public endpoint or live customer database.
3. For a retryable draft `POST`, send one authenticated user's stable `Idempotency-Key`. Use exactly the same JSON field values when replaying; compare returned resource `id`. A 409 requires investigation of the changed request. A 503 may be retried with the same key; first check server/database health.
4. Run `npm run smoke:pg:pilot`, `npm run smoke:pg:cutover` and the independent pg_dump/pg_restore suite. `npm run assess:pg:cutover` **will exit 3 while correctly BLOCKED**. Destroy test credentials and rotate keys after any clone/backup.

## Release gates / next priority

**Production blocked** until all normal business operations move to reviewed PostgreSQL repositories, historical per-customer migration mapping/parity is approved, external finance/provider APIs are sandbox certified, production credentials/session isolation and signed context are independently reviewed, transactional outbox/idempotency is designed for real external effects, recovery points are tested against approved copies and Hostinger staged rollback is demonstrated.

**Suggested next incremental priority (Phase 10.5B / 10.6):** normalized domain schema, application-level repository abstraction replacing selected JSON routes behind audited flags, real concurrency across separate service instances, and an external-event outbox with no live delivery until provider approval.

**Merge/deploy gate remains closed. Keep Draft PR #1 open and main unchanged.**
