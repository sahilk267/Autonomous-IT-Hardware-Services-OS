# Phase 7 — Proposal Integrity and Single-Award Transactions

**Date:** 10 November 2026  
**Working branch:** `fix/phase1-security-integrity-20261106`  
**Implementation commit:** [`a386046b654d72fbfed1bb6bb6893dd7d0423f66`](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/commit/a386046b654d72fbfed1bb6bb6893dd7d0423f66)  
**Release:** Draft PR #1 only. No production merge/deployment.

## Implemented and verified

- `POST /api/proposals` now requires an existing unawarded project, non-empty provider name, positive finite commercial bid, explicit integer turnaround days and bounded optional technical approach.
- Server assigns proposal IDs and `SUBMITTED` status. Caller-supplied verification flags, OEM certifications, ratings, match score, match explanation, approval status and IDs are **not authoritative**. Provider data is explicitly unverified; no supplier email or external dispatch occurs.
- `PersistentStore.submitProjectProposal()` commits proposal, linked project proposal count and server-authored event in one atomic JSON-state commit.
- `PATCH /api/proposals/:id/accept` enforces one accepted proposal per project; competing `SUBMITTED` bids become `REJECTED`. Project status changes to `IN_PROGRESS` and a server-authored event is recorded in the **same** commit. Repeat award, competing award and post-award submissions fail closed.
- React project marketplace no longer generates fictitious vendor ratings, certifications, pre-filled bids or matching scores; users must enter actual bid/turnaround values. Legacy provider verification/matching fields are displayed as unverified until a real provider adapter exists.
- React award UI uses the persisted server response instead of locally assuming a successful award; failures show a message.

## Independently verified CI

- [GitHub Actions push run #42715294577](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/42715294577) — **SUCCESS**.
- [GitHub Actions PR run #42715304850](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/42715304850) — **SUCCESS**.
- TypeScript check and production build: PASS.
- Isolated regression: **16/16**.
- Deterministic authentication limiter: **7/7**.
- Production-mode HTTP API smoke (temporary data): **88/88**.
- Multi-role permissions smoke (temporary data): **64/64**.
- Private data path and offline backup smoke: **9/9**.

The new HTTP checks cover missing projects, negative bids, forged verification, atomic proposal counting, single-award behavior, repeat/competing award rejection, late-bid rejection and persisted audit. Role tests cover field-engineer rejection, sales submission restrictions, sales award denial and owner award.

## Outstanding acceptance and operational limitations

- Still a **single-tenant single-process JSON prototype**, not a scalable database. Atomic JSON commits do not constitute tamper-evident audit or durable multi-node transactions.
- No project/customer/provider **row ownership** beyond existing role-level controls. This remains the next P1 security gate.
- Provider verification, real supplier transmission, contract signature, escrow, payments, GST filing, browser E2E and Hostinger production migration have **not** been performed.
- Legacy proposals can contain pre-existing self-reported/fictional fields; the UI avoids presenting provider/match values as independently verified, but a data-quality review/migration remains pending.
- This increment does not certify production readiness. **Keep PR #1 Draft, main untouched**, and never overwrite a deployed `data/app-store.json`.

## Next priority

Extend per-object authorization to projects/proposals, RMA/assets and customer-linked records; validate cross-role row isolation; then address distributed persistence and recovery. All tests must use temporary fixtures, not production customer data.
