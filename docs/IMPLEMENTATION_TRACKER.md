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
| CI-05 | P4 | Phase 4 identity, role and data-safety suites | **CI verified** | [Run 42499544462: 16/16 regression, 49/49 HTTP, 39/39 roles, 9/9 data](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/42499544462) | Browser, migration and live provider acceptance |
| CI-06 | P4 | Phase 5 login throttling, CSRF and object-authorization suites | **CI verified** | [Run 42609402631: auth 7/7, regression 16/16, API 62/62, roles 56/56, data 9/9](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/42609402631) | Browser, multi-instance and real reverse-proxy testing |
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
| AUTH-05 | P1 | In-memory username + socket peer failed-login throttling | **CI verified** | [Run 42609402631: auth unit 7/7, API 62/62](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/42609402631) | Shared persistent limiter, trusted proxy policy, independent security review |
| CSRF-05 | P1 | Block cross-site Fetch Metadata and forged X-Forwarded-Host Origin bypass | **CI verified** | [Run 42609402631: HTTP checks PASS](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/42609402631) | Complete CSRF/session architecture and real reverse-proxy acceptance |
| OBJ-05 | P1 | Field engineer ticket/job row scoping, manager assignment endpoints | **CI verified** | [Run 42609402631: role suite 56/56](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/42609402631) | Further row controls for assets, endpoints, projects and all modules |
| UI-05 | P2 | Manager assignment dropdowns from real staff registry and no fake sign-offs | **Built and typechecked** | [Run 42609402631: build PASS](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/42609402631) | Browser E2E + accessibility testing |
| AUTH-04 | P1 | Owner-only local staff creation/disable, atomic audit, session revocation and password rotation | **CI verified** | [Phase 4 role suite 39/39](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/42499544462) | MFA, invite expiry, initial password change enforcement, full external identity JML |
| DATA-04 | P0 | Production rejects absent, relative or checkout-local JSON data path | **CI verified** | [Phase 4 data-safety suite 9/9](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/42499544462) | Controlled Hostinger migration to private absolute APEX_DATA_FILE |
| BACKUP-04 | P1 | Operator-only offline backup with exclusive create, SHA256 and 0600 | **CI verified** | [Phase 4 data-safety suite 9/9](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/42499544462) | Encryption, offsite retention, verified restoration |
| UI-04 | P2 | Staff Access / Change Password screen with real API callbacks | **Built and typechecked** | Browser acceptance pending | Accessibility and role-specific UX testing |

## Phase 2 — 7 November 2026

Phase 2 implementation was pushed as commit `c714f7f5a7bd2206af6a055a589e5fddd27a11b3`. Independent [GitHub Actions run 42283191813](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/42283191813) verified **type-check PASS, build PASS, isolated regression 15/15, production HTTP 38/38, role permissions 16/16**. Browser/Hostinger testing remains pending.

- Role-based collection-level reads and route-level permissions (still **single tenant**, not per-user ownership/tenant isolation).
- RMA: real registered assets only; `FAULT_LOGGED` initial status; verified OEM case/AWB needed for stage progression.
- Knowledge Base: validate title/summary/verified steps; persist creation and atomic self-resolution acknowledgments.
- CRM: real client/opportunity values; server-side stage transitions; no fabricated win probabilities or staff names.
- Disputes: create from genuine projects; save internal recommendations only, not pretend escrow transfers.
- CI: expanded HTTP persistence checks and separate multi-role access smoke suite. See [Phase 2 report](PHASE_2_IMPLEMENTATION_2026-11-07.md).

## Phase 5 — 9 November 2026

Phase 5 was pushed to draft PR #1; **no production deployment was performed**. Independent [GitHub Actions run 42609402631](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/42609402631) verified TypeScript/build PASS, regression **16/16**, login limiter **7/7**, production-mode HTTP **62/62**, role/ownership **56/56**, and data-safety **9/9**.

- Login throttling: conservative **8 failed attempts/account** and **80 failed attempts/socket peer** in 15 minutes; sends HTTP 429/Retry-After. In-memory **single process only** and not a substitute for MFA / shared distributed limits.
- Browser cross-site mutation protection using Fetch Metadata + Origin comparison. An attacker-controlled `X-Forwarded-Host` no longer overrides the expected origin; optional `APEX_PUBLIC_ORIGIN` is recommended for a known reverse-proxy origin. CSRF review is not complete.
- Field engineer ticket/job results are filtered to stable `assignedUserId` (tickets also visible to original reporter); unassigned legacy records do not automatically grant technician access. Managers can assign explicitly to a real enabled local field-engineer user ID.
- Assigned engineers can update ticket status/root-cause or progress their own field job one stage at a time. Customer digital signature is **not** auto-certified by status changes. Cross-record stock consumption is blocked.
- Existing generic endpoint/asset/project row isolation and full multi-tenancy remain pending. See [Phase 5 report](PHASE_5_IMPLEMENTATION_2026-11-09.md).

## Phase 4 — 8 November 2026

Implementation pushed to draft PR #1. **No production Hostinger environment modified.** [GitHub Actions run 42499544462](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/42499544462) confirmed **TypeScript/build PASS, isolated 16/16, HTTP 49/49, role/identity 39/39 and production data-safety 9/9** against temporary stores.

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

## Phase 6 — 10 November 2026 (source implemented; initial CI verified)

**Focus:** Project/milestone integrity, honest topology/automation UI and fail-closed workflow activation. Work is restricted to the existing draft branch, with `main` and production data untouched.

- P0-PROJ-06: Server-generated project and milestone identifiers, safe editable project field allowlist, validated amounts, calendar dates and budget totals. No caller-provided lifecycle status, milestone financial evidence or client project codes. Owner-only milestone creation and sequential internal work progression; `ESCROW_HELD` and `RELEASED` cannot be forged or implied by work completion.
- UI-06: New projects no longer create two fictional milestones or past-dated deadlines. Optional actual first milestone can be supplied explicitly. Legacy escrow states are shown as unverified, not a real payment.
- CMDB-06: Removed fictional cascading incidents, customer impact and Telegram/failover claims. Topology explorer states what-if only.
- AUTO-06: Workflow rules are persisted as inactive definitions, not live automation; activation and execution fail closed (`501`). UI inspection never reports trigger evaluation or external dispatch.
- CI-06B: [GitHub Actions #42713764341](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/42713764341) and [PR run #42713771860](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/42713771860) were green at commit `4681536`: TypeScript/build PASS, isolated 16/16, auth 7/7, HTTP 76/76, role 60/60, data 9/9. The expanded workflow draft/activation checks also passed in the subsequent green run #42714106305 (HTTP 78/78).
- Remaining: project ownership across customers/tenants; genuine payment/GST/provider adapters; audit atomicity; browser E2E; production migration and backups.


### Phase 6 final verification (10 November 2026)

Commit `ac27a4e` completed [CI #42714106305](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/42714106305) and [PR verification #42714114832](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/42714114832), both green: TypeScript/build PASS; regression **16/16**; auth **7/7**; HTTP **78/78**; roles **60/60**; data safety **9/9**. No browser, payment, tenant-isolation or live-provider acceptance was conducted. This evidence refers only to isolated GitHub Actions.


## Phase 7 — 10 November 2026 (proposal integrity / single award; CI verified)

- **PROPOSAL-07 (P1):** Server validates project-linked bid details; never accepts client-supplied proposal identity, vendor verification, rating, fabricated AI match or privileged award status. Existing project must still accept bids. **Source implemented, CI verified.**
- **AWARD-07 (P1):** Proposal creation + project count + audit occur in one JSON commit. Exactly one project award; competing bids, project status and audit event persist together. Duplicate, competing and late awards fail closed. **Source implemented, CI verified.**
- **UI-07 (P2):** Removed fabricated provider certifications/ratings/default bid costs and matching scores; show unverified disclosures and server-authoritative award results. **Typechecked/build verified; browser E2E pending.**
- **CI-07:** [Push run #42715294577](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/42715294577) and [PR run #42715304850](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/42715304850) both green at [commit `a386046`](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/commit/a386046b654d72fbfed1bb6bb6893dd7d0423f66): typecheck/build PASS, regression **16/16**, auth **7/7**, HTTP **88/88**, roles **64/64**, data **9/9**.
- **Still blocked:** real per-customer/project/proposal row-level ownership, multi-tenant database, verified provider interactions, tamper-evident audit, browser and Hostinger acceptance. **Do not merge PR #1 or deploy as production-ready.** See [Phase 7 report](PHASE_7_PROPOSAL_INTEGRITY_2026-11-10.md).

## Phase 8 — 10 November 2026 (staff-object authorization; CI verified)

- Field service assets and endpoints use explicit engineer identity; private/unassigned assets and linked RMA claims cannot be enumerated by field staff. Manager-only assignment APIs update audit and authorization together.
- Projects: server-assigned creator IDs and owner-managed collaborator grants, consistent filtering across direct project/proposal endpoints and /api/state. Proposals save submitter identity, with visible-project checks for submission and award.
- Owner project-sharing UI and manager engineer-assignment controls added. RMM terminal no longer asserts verified TLS session, IP address or user consent when no agent exists.
- No production data rewritten. Legacy records lacking trusted ownership remain inaccessible to ordinary nonowner users unless explicitly granted. No customer-tenant isolation or real RMM adapter is implemented. CI/browser/Hostinger acceptance still pending.

### Phase 8 verification and merge gate

- Green [GitHub Actions push run #42719314182](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/42719314182) and [PR run #42719323407](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/42719323407) for `a23e8d4`: TypeScript/build PASS; isolated tests **16/16**, auth **7/7**, API **91/91**, role **95/95**, data-safety **9/9**.
- CI acceptance is **not production sign-off**. Keep PR #1 draft and `main` unchanged; next gates are customer ownership, browser end-to-end access tests, database-level tenancy and recovery.

## Phase 9 — 11 November 2026 (customer-bound access, read-only migration preflight and real browser checks)

- **CUSTOMER-09 (P0):** Owner-registered `customers` with UUID identifiers, existing tenant ID, staff grants and server-authored audit. Member data returned only to owner/granted staff; no external customer accounts created.
- **AUTH-09 (P0):** Customer membership AND object assignment/creator grants checked on projects, proposals, assets, endpoints, linked RMA, jobs, tickets, CRM, AMC and quotations across direct endpoints and `/api/state`. Lead state is hidden from nonowners if missing customer IDs; legacy rows remain owner-visible, never automatically relabeled. Staff grant revocation immediately removes visibility and project collaborator grants.
- **UI-09 (P1):** Owner registry/grant/revoke controls; registered-customer dropdowns in project/CRM/BOM, asset/AMC, ticket/endpoint and dispatch forms. RMM still non-executing.
- **TEST-09 (P1):** Two-customer negative access tests with disposable HTTP stores; real Chromium role-based UI tests using ephemeral production-mode server; read-only migration preflight detects orphan/missing customer IDs, RMA link inconsistency and dangling proposals with source SHA256 without mutation.
- **MIGRATE-09 (P0):** PostgreSQL/RLS cutover is only a documented blueprint, **not implemented**. See [Phase 9 implementation report](PHASE_9_CUSTOMER_ISOLATION_2026-11-11.md) and [PostgreSQL architecture plan](POSTGRESQL_MIGRATION_BLUEPRINT.md). No Hostinger/live migration and no customer data rewritten.
- **RELEASE GATES OPEN:** Customer-facing authentication, tenant-level DB isolation, remaining auxiliary customer references, rollback rehearsal and restore verification, in-browser end-user approval/denial scenarios, and external provider integration acceptance. CI run evidence is recorded separately after successful completion.


### Phase 9 final isolated CI and browser evidence — 11 November 2026

- [GitHub Actions push #42902830813](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/42902830813) and [Draft PR #42902844014](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/42902844014) both completed **success** on [code commit `bb01caf`](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/commit/bb01caf995e067cfd08be4833d4117660df1b47f).
- Node20 TypeScript/build **PASS**, regression **16/16**, login limiter **7/7**, production-mode HTTP **96/96**, role/customer authorization **133/133**, data safety **9/9**, read-only customer mapping preflight **5/5**; separately, real Node22 Chromium Playwright **7/7**. Browser tests cover five roles plus anonymous denial and owner customer/project access grant → cross-session revocation against isolated fixtures.
- Verified only on disposable CI stores. Deployment **not performed**; DB-level tenant enforcement/RLS, historical customer mapping, additional legacy customer-linked collections, backup restore validation and live providers remain release blockers. **Keep PR draft.**

## Phase 10.1 — 11 November 2026 (PostgreSQL staging DB and forced RLS; not runtime cutover)

- **P10-DB-STAGE:** PostgreSQL 16 staging schema in `migrations/postgres/001_staging_rls.sql`, full tenant/customer composite FK for proposal→project and RMA→asset, customer grants/share cascade, owner-only legacy records and staging SHA provenance. All nine tables protected with forced RLS; read role NOLOGIN/NOBYPASSRLS/NOINHERIT.
- **P10-IMPORT:** Offline dry-run + acknowledged local staging-only `SERIALIZABLE` import, source SHA256, real customer checks, strict empty target, rollback on errors. Credentials/auth sessions not imported. Existing Express runtime remains **JSON-only**.
- **P10-VERIFY:** GitHub Actions has a PostgreSQL 16 service and isolation suite. Tests cover five staff roles/two customers/two tenant identifiers, disabled identities, missing request context, revocation, cross-customer FK denial and owner-only records. Staged custom-format dump/restore to an independent disposable DB compares data, RLS and grants.
- **Still blocked:** safe production connection and transaction-scoped auth context, SQL injection hardening, full authorization parity and remaining legacy collections, DB-backed API writes and append-only audit, production-size data validation, actual Hostinger migration and separate backup recovery drill. PR #1 remains Draft; main unchanged.
- [Detailed Phase 10.1 implementation/runbook](PHASE_10_POSTGRESQL_STAGING_2026-11-11.md). Verified run evidence is appended after successful CI.


### Phase 10.1 CI verification — 11 November 2026

- Code commit [`38a570c`](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/commit/38a570c76907c0c8a64b3a6d9e22ed4d42aa52b0) passed [push Actions #42929292843](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/42929292843) and [PR Actions #42929301929](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/42929301929). Both include backend, Chromium and actual PostgreSQL 16 service jobs.
- **PostgreSQL 16 staging 23/23:** source SHA256, no DB dry-run, denied unsafe targets and spoofed tenant/customer/credential fields, nonempty-target refusal, explicit atomic import, real SQL RLS under five roles, disabled actor denial, unauthorized cross-tenant/cross-customer joins, grant revocation and SQL-induced full transaction rollback.
- **Separate dump/restore 16/16:** matching PG16 client binaries, backup taken from staging DB, restored into another disposable PG16 DB; nine table rowsets compared, `FORCE RLS` verified on nine tables, revoke/tenant scope tests replayed and staging import provenance checked.
- **Original runtime CI:** TypeScript/build PASS; regression **16/16**, authentication **7/7**, HTTP API **96/96**, role/customer API **133/133**, data safety **9/9**, customer source preflight **5/5**, Node22 Chromium browser **7/7**.
- No production PostgreSQL instance, customer records, Hostinger credentials, real payment provider or live deployment was used. These numbers are evidence of isolated source/CI acceptance only.

## Phase 10.2 — 11 November 2026 (staging-only SQL authenticated CRUD and audit)

- **P10.2-WRITE:** Migration `002_staging_authenticated_pilot.sql` restricts SQL writes to owner-created customers, owner grants/revokes and CRM insert/update(payload). The NOLOGIN/NOBYPASSRLS SQL role cannot insert/edit audit directly; SQL AFTER triggers create minimal audit in the same transaction. All ten tables use RLS.
- **P10.2-HTTP:** `server/postgres_pilot.ts`: staging-only opt-in, cookie authentication, strict SQL role parity checks, trusted server-identity transaction context, parameterized SQL, customer registration and grant/revoke, CRM create/list/stage update, owner-only audit.
- **P10.2-FAILCLOSED:** Disabled by default; cannot start pilot in production or on nonloopback/untrusted DB, inappropriate DB name or checkout JSON store. No app-wide runtime switch, no public SQL or tenant/actor GUC input endpoint. Audit failure rolls back whole operation.
- **P10.2-CI:** Real PostgreSQL 16 staged import/RLS **23/23**, actual authenticated PostgreSQL HTTP **41/41**, separate PostgreSQL dump/restore **17/17**; existing TypeScript/build, HTTP/role/Chromium suites green. [Push CI 42996562963](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/42996562963) and [PR CI 42996571429](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/42996571429) passed for code SHA `da0e65cc`.
- **Remaining P0:** Full PostgreSQL CRUD/domain transaction migration across all modules, secure non-impersonable DB session identity, historical customer/tenant mapping and parity, cross-module audit integrity, actual authorized restore/rollback, Hostinger readiness and integration acceptance. Current runtime remains JSON. Keep Draft PR.
- [Phase 10.2 scope, security and operations report](PHASE_10_2_AUTHENTICATED_PG_PILOT_2026-11-11.md).


### Phase 10.2 additional staging source-parity gate

- `scripts/postgres/verify_staging_parity.mjs` is a separate read-only offline comparator for an explicitly selected local `apex_stage_*` PostgreSQL instance and an original private JSON source snapshot. It compares import SHA-256 and SQL source provenance, tenant identity, staff roles/disable state (never raw passwords), customer IDs/names, customer grants, all 11 scoped record collections including proposal/RMA derived associations, project shares, 12 owner-only legacy collections and original audit payloads.
- It detects both **source SHA drift** and **database payload tampering even when source SHA still matches**. Tests restore their ephemeral fixture after deliberately corrupting it; no deployed file or real database changed.
- Usage: `npm run verify:pg:parity -- --source /absolute/private/verified-staging-snapshot.json` against the **same isolated staging DB before any pilot writes**. This verifier intentionally fails once the separate PostgreSQL pilot has written new customer/CRM records, because JSON source and PostgreSQL diverge; that is expected and must not be treated as a production synchronization mechanism.
- This improves **staging source/target row parity**, not full production migration parity: source tenant metadata beyond ID/name, credentials/sessions and other non-staged runtime fields are intentionally excluded from the SQL target, and real deployed data has not been reconciled. Never promise full cutover or omit required historical mapping.
- [GitHub Actions push #42997972470](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/42997972470) and [PR #42997981644](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/42997981644) green at code commit `ab399322`: isolated staging RLS/import+parity **27/27**, authenticated SQL HTTP **41/41**, second-database SQL restore **17/17**; original TypeScript/build, existing API/role, auth, data safety and real Chromium browser verification also green.

## Phase 10.3 — 11 November 2026 (partial: signed identity and expanded staged transactional repositories)

- **AUTH-PG-10.3:** Database transaction attestation: HMAC(tenant, actor, PostgreSQL transaction ID, backend PID), verified in SECURITY DEFINER `apex.pilot_context_is_attested` through `apex.active_role` on every RLS permission. Separate database secret table, no SQL writer SELECT, CI-generated ephemeral key, SQL-replay/impersonation tests.
- **SQL-PROJECT-TICKET:** Customer-scoped project create/list, owner share grant/revoke with same-customer composite FKs; tickets create/list/status transitions with trusted actor ID; SQL-trigger audit and transaction rollback.
- **SQL-ASSET-FIELD:** Asset and field-job create/list, manager-only active field engineer assignments requiring customer grants, field-only exact-assignee reads/status, tenant-wide case-insensitive assetTag uniqueness, assignment JSONB projection constraint and immediate access revocation. External job completion remains unsupported.
- **CI-10.3:** PostgreSQL 16 source import/parity, five-role/staff signed context HTTP security, cross-customer object access, forced audit failure/rollback and independent restore verification added to existing Node/Chromium regression matrix.
- **OPEN P0:** Full module SQL CRUD/transaction parity, normalized tenancy tables, production attestation/credential policy, real customer mapping + source/target data safety, workflow invariants, signed provider evidence, actual Hostinger DB deployment and rollback/restore rehearsal. Normal runtime is still JSON, PR #1 remains Draft.
- [Detailed Phase 10.3 implementation report](PHASE_10_3_SIGNED_CONTEXT_DOMAIN_REPOSITORIES_2026-11-11.md).

## Phase 10.3 verified CI evidence — 11 November 2026

- **Code SHA:** [`68b0376`](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/commit/68b0376463578a439eb87d8aee6d5ee104c39262).
- [GitHub Actions push #43042984912](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/43042984912) PostgreSQL 16 staging **27/27**, authenticated SQL HTTP including project/ticket/asset/job workflows and signed context replay **93/93**, PostgreSQL dump/restore with attestation **18/18**. The same commit's existing TypeScript/build and Node backend job completed successfully.
- Real PostgreSQL service checks include HMAC signature of tenant+actor+transaction+backend, rejection of unsigned/forged/replayed context, owner-only project sharing, field-assigned asset/job custody, customer membership grant/revoke, SQL audit and failure rollback, source SHA/parity, backup and restored RLS.
- These verification numbers refer to **ephemeral CI fixtures, not a live Postgres deployment or a completed multi-tenant cutover**. Existing JSON application and production customer data were unchanged.
