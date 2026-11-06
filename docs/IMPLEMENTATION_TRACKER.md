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
| SEC-03 | P1 | Sensitive write routes require owner/operational roles | Partially implemented | Permission-matrix test pending | Role-scoped data reads and remaining writes |
| SEC-04 | P1 | Block browser-generated authoritative audit events | Implemented | End-to-end test pending | Replace all remaining client audit producers |
| SEC-05 | P1 | Telegram webhook fails closed without allowed user + chat | Implemented | Telegram live webhook pending | Replay IDs, outbound API, delivery receipts |
| DATA-01 | P0 | Existing `commit()` clone-before-write semantics retained | Already present at baseline | Disk-failure test pending | Durable backups & concurrent writes |
| INV-01 | P1 | Exact productId & safe quantity for stock consumption, server cost only | Implemented | UI/API test pending | Stock integration workflow |
| FIN-01 | P1 | Invoice settlement requires verified reference; duplicate blocked | Implemented | Bank evidence authenticity pending | Reconciliation and authorized finance workflow |
| QUOTE-01 | P1 | Frontend/backend discount, subtotal, margin and quote state harmonized | Implemented | API regression pending | Replace **provisional** tax assumptions |
| PROJ-01 | P3 | Project milestone completion persisted via API | Implemented | Reload test pending | Guard financial escrow claims |
| FIELD-01 | P3 | Diagnosis no longer silently creates fake customer/site/parts | Implemented | UI test pending | Explicit booking form |
| WORK-01 | P3 | Missing workflow execute route responds honestly with 501 | Implemented (fail closed) | API smoke pending | Actual audited action dispatcher |
| CI-01 | P4 | Automated GitHub Actions typecheck/build/isolated tests | Added | Workflow results pending | Fix any failed checks |
| DOC-01 | P4 | Implementation report + tracker | Added | Reviewed with code | Keep synchronized per commit |
| PERSIST-01 | P3 | RMA/CRM/KB/disputes UI wired to server CRUD | **Pending** | — | UI persistence wiring |
| INT-01 | P4 | Verified Razorpay/Cashfree transactions | **Pending / 501** | — | Real provider implementation |
| GST-01 | P4 | Verified NIC IRP / GST filing adapter | **Pending / 501** | — | Real provider implementation |
| RMM-01 | P4 | Authenticated real endpoint agent telemetry | **Pending** | — | Enrollment and ingestion |
| MS-01 | P4 | Microsoft Graph provisioning/licensing | **Pending** | — | Credentialed adapter and tests |
| TLG-01 | P4 | Real Telegram message delivery and callback replay store | **Pending** | — | Bot token and authorized IDs |
| PO-01 | P3 | Genuine purchase order dispatch with delivery proof | **Pending** | — | Supplier integration or verifiable manual evidence |
| TAX-01 | P3 | Accurate per-HSN/SAC GST + discount allocation | **Pending** | — | Server-side tax rules |
| AUDIT-01 | P1 | Tamper-evident immutable audit and event/data atomicity | **Pending** | — | Central auditable transaction boundary |
| MULTI-01 | P4 | Actual tenant isolation and scalable durable DB | **Pending** | — | Dedicated persistent DB migration plan |

## Rules for subsequent work

1. Preserve the existing UI and **never overwrite any deployed `data/app-store.json` with a starter file**.
2. A real installed environment with existing passwordless legacy accounts requires **offline administrator recovery**, not a public setup bypass.
3. Run tests against temporary files only; never point tests or resets at real workspace data.
4. Do not report `CONFIGURED` as `CONNECTED`. Do not claim external money movement or signed IRN without provider confirmation.
5. Security and deployment sign-off require actual build logs plus API tests, not agent narrative.
6. Update this table with commit SHA and evidence after every verified phase.

## Suggested milestone order

- **Gate A**: CI typecheck/build/test green; first-login and payment/stock smoke tests.
- **Gate B**: Complete RBAC and per-role data access; CSRF, webhook replay controls and audit safety.
- **Gate C**: RMA/CRM/KB/disputes persistence + correct quotations, tax, PO lifecycle.
- **Gate D**: Provider adapters and audited automation; tenant/data architecture and production checks.
