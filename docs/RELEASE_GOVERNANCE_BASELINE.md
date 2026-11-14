# Release governance baseline (review branch)

Status: **PARTIAL — NOT DEPLOYABLE**. This document reconciles repository reality against previously discussed Phase 10.5J/10.5K plans.

## Verified repository baseline
- Default branch: `main`; observed head: `3279107c03d757b5c0cf8d5ba18867ef2982a1d2` (2026-11-06).
- `package.json` runs `tsx tests/zero_mock_data.test.ts` as its only npm test command.
- `server.ts` uses Express and `server/db.ts` persistent JSON store.
- PostgreSQL repository abstraction, transactional outbox, release approval storage, and production migration authorization are **not verified**.
- Earlier phase completion claims are **not accepted as evidence**.

## Work introduced
- `server/release-governance.ts`: pure, fail-closed decision evaluation; no I/O, no execution.
- `tests/release-governance.test.ts`: initial independent decision tests (not yet executed).

## Mandatory controls before production
1. Immutable, signed evidence with verified digest and provenance, bound to a specific release artifact.
2. Server-side authenticated human approval and distinct operator identity; no self-attested request body.
3. Independent recovery rehearsal and measured RTO/RPO evidence.
4. Cross-tenant negative tests, historical customer ownership reconciliation, migration rollback.
5. PostgreSQL concurrency, transactional outbox and idempotent dispatcher validation.
6. CI verification and reviewed PR; protected branch release controls.
7. Separate, explicit deployment authorization. A `GO` evaluation alone MUST NOT trigger production deployment.

## Current decision
**PENDING_EVIDENCE**. No migration, outbox delivery, or production cutover authorized.

## Next work
Integrate trusted evidence storage and authenticated approvals, add negative and tamper tests, update npm test command, then run full CI. Do not mark this phase complete until those steps pass.
