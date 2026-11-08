# Apex OS Implementation Tracker

**Baseline:** `3279107c03d757b5c0cf8d5ba18867ef2982a1d2` (2026-11-06)
**Working branch:** `fix/phase1-security-integrity-20261106`
**Scope:** incremental implementation, not a rebuild. Existing business/customer data must be preserved.

> **Evidence rule:** An implementation checkbox means source changed in this branch. It does **not** mean live deployment, CI, browser acceptance or a third-party provider has been verified.

## Status ledger

| ID | Priority | Item | Source implementation | Runtime verification | Next gate |
|---|---|---|---|---|---|
| BOOT-01 | P0 | Legacy passwordless admin removed from checked-in **empty template** | Implemented | CI / fresh setup pending | Test first-time enrollment |
| BOOT-02 | P0 | Production first-admin setup protected with server-provisioned one-time token | Implemented | Deploy test pending | Configure `APEX_INITIAL_SETUP_TOKEN` |
| SEC-01 | P1 | Production secure session cookie, no token in login JSON | Implemented | HTTP integration test pending | Login/logout, CSRF scenarios |
| SEC-02 | P1 | Basic browser Origin checks for writes | Implemented | Proxy/Hostinger test pending | Test forwarded host behavior |
| SEC-03 | P1 | RBAC on 48 API routes + role-scoped state collection filtering | **CI verified** | [16/16 role HTTP tests pass](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/42283191813) | Per-user/tenant row isolation, ownership & comprehensive threat modeling |
| SEC-04 | P1 | Block browser-generated authoritative audit events | Implemented | End-to-end test pending | Replace all remaining client audit producers |
| SEC-05 | P1 | Telegram webhook validates sender/chat, uses durable update-id replay ledger | Phase 3 coded; CI verified | Security fixture test | Live Telegram callback acceptance & retention review |
| DATA-01 | P0 | Existing `commit()` clone-before-write semantics retained | Already present at baseline | Disk-failure test pending | Durable backups & concurrent writes |
| INV-01 | P1 | Exact productId & safe quantity for stock consumption, server cost only | Implemented | UI/API test pending | Stock integration workflow |
| FIN-01 | P1 | Invoice settlement requires verified reference; duplicate blocked | Implemented | Bank evidence authenticity pending | Reconciliation and authorized finance workflow |
| FIN-02 | P1 | Receivable creation rejects forged SETTLED status, bank reference and invoice IDs | **CI verified** | [Run 42291102641: forged status test PASS](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/42291102641) | Real tax invoicing and reconciliation remain pending |
| QUOTE-01 | P1 | Server recalculates discount-adjusted pricing and per-line GST estimates | Phase 3 coded; CI verified | Mixed rate + missing tax tests | Verify HSN/SAC; actual tax filings not implemented |
| PROJ-01 | P3 | Project milestone completion persisted via API | Implemented | Reload test pending | Guard financial escrow claims |
| FIELD-01 | P3 | Diagnosis no longer silently creates fake customer/site/parts | Implemented | UI test pending | Explicit booking form |
| WORK-01 | P3 | Missing workflow execute route responds honestly with 501 | Implemented (fail closed) | API smoke pending | Actual audited action dispatcher |
| CI-01 | P4 | GitHub Actions typecheck/build/15 isolated tests | **Verified** | [Run 42257640364: green](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/42257640364) | Expand regression suite |
| CI-02 | P4 | Production-mode Express HTTP smoke suite (38 checks, temp DB) | **Verified** | [Run 42283191813: 38/38 PASS](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/42283191813) | Browser, live provider tests |
| CI-03 | P4 | Five-role HTTP access matrix (16 assertions, temporary seeded fixture) | **Verified** | [Run 42283191813: 16/16 PASS](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/42283191813) | Object-level authorization tests |
| CI-04 | P4 | Phase 3 quote/GST, PO, Telegram and safe invoice/BOM checks | **CI verified** | [Run 42291102641: 16/16 regression, 49/49 API, 21/21 roles](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/42291102641) | Browser / real provider acceptance |
| DOC-01 | P4 | Implementation report + tracker | Added | Reviewed with code | Keep synchronized per commit |
| PERSIST-01 | P3 | RMA, CRM, KB and disputes connected to typed server APIs and state | **API verified; browser pending** | [38/38 HTTP tests pass](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/42283191813) | Browser UX, screen-based save/reload and OEM evidence |
| INT-01 | P4 | Verified Razorpay/Cashfree transactions | **Pending / 501** | — | Real provider implementation |
| GST-01 | P4 | Verified NIC IRP / GST filing adapter | **Pending / 501** | — | Real provider implementation |
| RMM-01 | P4 | Authenticated real endpoint agent telemetry | **Pending** | — | Enrollment and ingestion |
| MS-01 | P4 | Microsoft Graph provisioning/licensing | **Pending** | — | Credentialed adapter and tests |
| TLG-01 | P4 | Real Bot API sendMessage adapter + durable callback replay; local vs external UI status | Phase 3 coded; CI verified | HTTP fail-closed & replay tests | Live provider acceptance / webhook registration unverified |
| PO-01 | P3 | Exact-supplier priced internal PO preparation, status PO_PREPARED/NOT_SENT | Phase 3 coded; CI verified | API tests incl duplicates | **External supplier dispatch still pending** |
| TAX-01 | P3 | Per-line declared rates and proportional discount allocation; missing rates = PENDING_CLASSIFICATION | Phase 3 coded; CI verified | Mixed rate / classification HTTP checks | Actual statutory validation and NIC/IRP filing pending |
| AUDIT-01 | P1 | Tamper-evident immutable audit and event/data atomicity | **Pending** | — | Central auditable transaction boundary |
| MULTI-01 | P4 | Actual tenant isolation and scalable durable DB | **Pending** | — | Dedicated persistent DB migration plan |
| AUTH-04 | P1 | Owner-only local staff creation / deactivation, all-session revocation and password rotation | Phase 4 code staged | CI HTTP role tests pending | MFA, invite expiry, initial password change enforcement, full external identity JML |
| DATA-04 | P0 | Production startup refuses implicit/in-checkout tracked JSON database | Phase 4 code staged | CI preflight pending | Maintenance-window migration to private absolute APEX_DATA_FILE |
| BACKUP-04 | P1 | Operator-only offline backup with exclusive create, SHA256 and 0600 | Phase 4 code staged | Isolated fixture CI pending | Encryption, offsite retention, tested restore and live database replacement |
| UI-04 | P2 | Staff Access / Change Password screen with real API feedback | Phase 4 code staged | Browser acceptance pending | Accessibility and role-specific UX testing |

## Phase 2 — 7 November 2026

Phase 2 implementation was pushed as commit `c714f7f5a7bd2206af6a055a589e5fddd27a11b3`. Independent [GitHub Actions run 42283191813](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/42283191813) verified **type-check PASS, build PASS, isolated regression 15/15, production HTTP 38/38, role permissions 16/16**. Browser/Hostinger testing remains pending.

- Role-based collection-level reads and route-level permissions (still **single tenant**, not per-user ownership/tenant isolation).
- RMA: real registered assets only; `FAULT_LOGGED` initial status; verified OEM case/AWB needed for stage progression.
- Knowledge Base: validate title/summary/verified steps; persist creation and atomic self-resolution acknowledgments.
- CRM: real client/opportunity values; server-side stage transitions; no fabricated win probabilities or staff names.
- Disputes: create from genuine projects; save internal recommendations only, not pretend escrow transfers.
- CI: expanded HTTP persistence checks and separate multi-role access smoke suite. See [Phase 2 report](PHASE_2_IMPLEMENTATION_2026-11-07.md).

## Phase 4 — 8 November 2026

Implementation underway in the existing draft PR. **No production Hostinger environment modified.** Independent CI evidence will be recorded only after a green run.

- Owner-only **local** staff identity creation and disable, four non-owner roles; passwords are scrypt-hashed and never returned to the browser in API responses.
- Disabled staff lose all sessions in one DB transaction; `GET /api/state` remains collection-filtered. Every user can change their own password; old sessions are revoked and reauthentication required.
- Account create, disable and password rotation append server audit events in the same JSON commit as the identity mutation. The underlying JSON store is still **not tamper-evident**.
- New Account Security & Staff UI. This is **not Microsoft 365/Entra provisioning**, invite email delivery, SSO, MFA or per-object tenant access control.
- Production `APEX_DATA_FILE` must be explicit and outside application checkout. Existing deployments running from the tracked default path **will refuse startup**, not silently reset business data.
- Offline backup CLI generates a non-overwriting `0600` snapshot and SHA256 digest only when writes are stopped. It is not an encrypted/offsite automated backup or a verified restore.
- Deployment migration checklist: [Deployment Data Safety](DEPLOYMENT_DATA_SAFETY.md); [Phase 4 report](PHASE_4_IMPLEMENTATION_2026-11-08.md).

## Phase 3 follow-up — draft safety checks

- Printable BOM is a clearly marked draft without fabricated GSTIN, bank account, seller registration or fixed 18% calculation.
- Internal receivable creation never trusts client-forged `SETTLED` status or payment references.
- Independent [CI #42291102641](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/42291102641) green; browser and deployment acceptance remain outstanding. See [Phase 3 report](PHASE_3_IMPLEMENTATION_2026-11-07.md).

## Phase 3 — 7 November 2026

Phase 3 code and follow-up safety fixes are on the same draft PR. [GitHub Actions run 42291102641](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/42291102641) verified **typecheck/build PASS, isolated regression 16/16, HTTP API 49/49, role/webhook 21/21**. Not deployed.

- `PO_PREPARED` records supplier quotation, quantity and cost as an internal ledger draft. Legacy `/dispatch-po` route is retained for backwards-compatible UI but **never actually sends the PO**.
- Quote taxes are no longer blanket 18%. Tax is an **unverified estimate** using explicit per-line GST rate and HSN/SAC, with proportional discount allocation. Missing classification sets `PENDING_CLASSIFICATION` and quote total excludes unknown GST; it is **not a final payable invoice**.
- Finance tax preview requires manual rate entry; NIC/IRP adapter remains not implemented.
- Live Telegram outbound endpoint calls official sendMessage and records acceptance only after a positive provider response. No credentials are present in CI, so **external delivery has not been verified**.
- Telegram webhook now stores update IDs for duplicate protection. Retention is bounded; long-term anti-replay and provider integration testing remain pending.
- See [Phase 3 report](PHASE_3_IMPLEMENTATION_2026-11-07.md).

## Rules for subsequent work

1. Preserve the existing UI and **never overwrite any deployed `data/app-store.json` with a starter file**.
2. A real installed environment with existing passwordless legacy accounts requires **offline administrator recovery**, not a public setup bypass.
3. Run tests against temporary files only; never point tests or resets at real workspace data.
4. Do not report `CONFIGURED` as `CONNECTED`. Do not claim external money movement or signed IRN without provider confirmation.
5. Security and deployment sign-off require actual build logs plus API tests, not agent narrative.
6. Update this table with commit SHA and evidence after every verified phase.

## First independent CI evidence

- **Run:** [Apex OS verification #42256237304](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/42256237304)
- **Node 20:** npm install PASS; `npm run lint` PASS; `npm run build` PASS; `npm test` **15/15 PASS**.
- **Subsequent verified run:** [CI #42257640364](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/42257640364) — typecheck PASS, build PASS, isolated tests 15/15 PASS, production-mode HTTP smoke 21/21 PASS against a temporary database.
- **Still unverified:** external provider integrations, multi-role access control matrix, browser UX and Hostinger deployment.

## Suggested milestone order

- **Gate A**: CI typecheck/build/test green; first-login and payment/stock smoke tests.
- **Gate B**: Complete RBAC and per-role data access; CSRF, webhook replay controls and audit safety.
- **Gate C**: RMA/CRM/KB/disputes persistence + correct quotations, tax, PO lifecycle.
- **Gate D**: Provider adapters and audited automation; tenant/data architecture and production checks.
