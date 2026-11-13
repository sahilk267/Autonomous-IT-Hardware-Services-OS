# Phase 5 — Authentication Throttling & Object-Level Access Controls

**Date:** 9 November 2026
**Baseline:** `fix/phase1-security-integrity-20261106@186f791d461964dbae729f1cf54bcca5a4c82f42`
**PR:** [#1 (Draft)](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/pull/1)

## Changes implemented in source

### Login and request origin hardening
- Login failure throttling: fixed 15-minute window with a threshold of 8 failed attempts per normalized username, 80 failed attempts per socket IP address; excessive attempts respond 429 and `Retry-After`.
- Avoid trusting attacker-provided `X-Forwarded-For` when choosing a peer address, or `X-Forwarded-Host` for Origin validation. An optional explicit `APEX_PUBLIC_ORIGIN` is available behind a known reverse proxy. Cross-site Fetch Metadata mutations are rejected.
- **Limitations:** per-process state resets on restart and does not coordinate across replicas. Proxy deployments may concentrate users behind a single peer IP. An attacker can trigger temporary per-account login lockouts. Complete CSRF and multi-origin session threat assessment, upstream/WAF throttling, MFA and credential breach controls are still outstanding.

### Record-level authorization for service delivery
- `ITSMTicket` supports `assignedUserId` and `reportedByUserId`; `FieldJob` supports `assignedUserId`. Display-only names are never used for authorization.
- Field engineers see assigned jobs only, and tickets assigned to them or originally submitted by them, consistently in `GET /api/state`, `GET /api/jobs` and `GET /api/tickets`.
- Only assigned field engineers may change the status/root-cause of assigned tickets or progress their own jobs. Field engineers cannot alter arbitrary object fields, assign themselves, self-certify signatures, skip job status stages, or consume parts on unrelated jobs.
- Owner / IT manager can use authenticated assignment endpoints `PATCH /api/jobs/:id/assign` and `PATCH /api/tickets/:id/assign`. Assignees must be active local field engineers in the same single tenant. Assignments and server events are persisted together.
- The manager UI uses `GET /api/field-engineers` to populate real eligible staff rather than fabricated technician names. Internal completion does NOT claim a verified customer e-sign or payment/settlement.
- **Legacy records:** missing `assignedUserId` remains unassigned, and is not automatically mapped from display names. Explicit manager reconciliation is required.

### Regression coverage
- Test forged forwarded-host, modern browser Fetch Metadata, same-origin requests, case-folded username limit, rate-limit Retry-After, other-account unaffected; dedicated 7-case time-window and peer-budget limiter suite.
- Test field state and direct endpoint row filters, unassigned job and ticket denial, customer signature forging, unauthorized part consumption, manager assignment, status progression and field record edits.
- All tests use throwaway local JSON stores, no production data or external services.

## Independently verified CI

[GitHub Actions run #42609402631](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/42609402631) completed successfully on the Phase 5 branch: **TypeScript lint PASS, production build PASS, 16/16 isolated regressions, 7/7 deterministic limiter unit tests, 62/62 production HTTP checks, 56/56 multi-role/object-access tests and 9/9 data-safety checks**.

CI tested only disposable local stores and a synthetic reverse-proxy header. It does **not** prove browser-level usability, trusted proxy configuration, live Hostinger deployment or real multi-instance rate-limiting. Never treat test fixture endpoints or passwords as deployed credentials.

## Open blockers and next acceptance gate
- The new controls cover ticket/job records **only**. Other modules (assets, endpoints, RMA, projects, client data) still need per-object ownership and authorization; real multi-tenant isolation is **not implemented**.
- Shared distributed login limiter / MFA, complete cookie-CSRF handling, production reverse-proxy smoke tests, and browser E2E tests are pending.
- Hostinger migration must use the [private-store checklist](DEPLOYMENT_DATA_SAFETY.md); no migration, live secrets or provider acceptance is claimed.
- Supplier delivery, GST/NIC, Microsoft 365, RMM, Telegram live provider and payment reconciliation remain pending.

**Evidence rule:** Independent GitHub Actions checks will be cited only once they complete. Keep this PR in Draft and do not merge to production until release gates pass.
