# Phase 6 — Project Integrity and Honest Operations UI

**Date:** 10 November 2026  
**Working branch:** `fix/phase1-security-integrity-20261106`  
**Status:** Candidate source implementation; GitHub Actions acceptance to be recorded after push.

## Scope
1. Project creation validates real client details, finite budget, declared category, optional authentic milestone dates and totals, and sets server-generated identifiers, timestamps and lifecycle statuses.
2. Project mutations use an explicit allowlist. Owner controls budget; other permitted project editors cannot modify financial budget. Client cannot overwrite milestones or project lifecycle/financial evidence.
3. Owner-only new milestone creation accepts title/amount/date only. Status transitions are `PENDING_FUNDING -> IN_PROGRESS -> COMPLETED` for **internal work only**; no endpoint claims an escrow hold, release or payment.
4. React project form does not invent milestone schedules. Owner can submit an actual first milestone; empty milestones remain empty. Legacy money-related statuses are not presented as verified payments.
5. CMDB explorer no longer invents Trading API / PostgreSQL outages, customer counts, failover or Telegram notifications. Workflow rule inspection is a static definition viewer with no executed actions.
6. Workflow creation stores `active=false`; activation and execution return explicit `501` until audited workers exist.
7. HTTP smoke tests cover role denial, field tampering, dates, budget caps, milestone sequencing and financial proof guards.

## Safe verification
Run `npm run lint && npm run build && npm test && npm run test:auth && npm run smoke && npm run smoke:roles && npm run smoke:data`. All scripts use isolated fixture data; never run tests on actual `APEX_DATA_FILE`.

## Known limitations
No browser E2E or live external connectors were validated by this source change. Project/proposal/customer record ownership, escrow verification, payment reconciliation, actual service impact engine and encrypted restore-tested backups are still pending. Keep PR #1 Draft and main unchanged.
