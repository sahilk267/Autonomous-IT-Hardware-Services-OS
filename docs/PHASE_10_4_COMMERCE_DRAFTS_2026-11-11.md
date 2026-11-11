# Phase 10.4 — PostgreSQL Commerce Drafts, Linked RMA and Procurement/Finance Pilot

**11 November 2026.** Branch `fix/phase1-security-integrity-20261106`, Draft PR #1.
**STATUS: Staging-only implementation; NOT production-ready; no live records migrated.**

## Implemented

1. **Migration 005** — `migrations/postgres/005_staging_commerce_finance_drafts.sql` adds signed-actor RLS inserts for customer-scoped quotation drafts, internal project-linked proposals and asset-linked RMA intake, plus two new PostgreSQL tables: `apex.pilot_procurement_drafts` and `apex.pilot_finance_previews`. All **12 staging business tables** use FORCE RLS. PostgreSQL composite customer/tenant foreign keys tie proposals to projects, RMAs to assets and finance previews to quotations.
2. **Quotation pilot** — owner, Sales and Procurement roles may create visible-customer quotations with server-generated identity, name and two-decimal subtotal. Status is always `DRAFT` with tax classification `PENDING_CLASSIFICATION`. No certified GST calculation, acceptance, payment, invoice, dispatch or provider verification.
3. **Proposal pilot** — staff may create *internal unverified* submissions only for accessible, proposal-open projects. Project share and customer grant are both necessary for nonowner access; DB SECURITY DEFINER predicate avoids recursive RLS and checks the signed actor. `providerVerified=false` and `externalSubmission=false` are enforced by database RLS, with no external provider account or bid dispatch.
4. **RMA pilot** — owner, IT Head, or an engineer explicitly assigned to a customer asset can log a `FAULT_LOGGED` internal intake. Warranty is `UNVERIFIED`; OEM case number is empty; `externalOemCaseOpened=false` is enforced by RLS. Cross-customer asset references violate composite DB FK. No OEM courier/shipment, warranty confirmation or return settlement.
5. **Procurement request drafts** — owner or customer-granted Procurement Lead may create immutable `REQUEST_DRAFT` rows with bounded quantity and nonnegative two-decimal unit estimates. This is not an RFQ to real suppliers or a prepared/dispatched purchase order. Database role grants SELECT/INSERT only.
6. **Unissued finance previews** — owner-only and INSERT-only. A preview has status `PREVIEW_UNISSUED`, tax `PENDING_CLASSIFICATION`, unique same-customer quotation reference. Database trigger requires the original quote to remain unverified `DRAFT` and subtotal to match exactly. No invoice number/tax verification, bank details, payment capture or `SETTLED` update is possible.
7. **Same-transaction audit** — quote, proposal, RMA, procurement and finance preview inserts create SQL trigger records. If the trigger fails, the business mutation rolls back. The restricted SQL pilot role cannot modify these audit rows. Valid signed owner SQL is additionally forbidden from forging verified external payments, providers or OEM status.
8. **Runtime containment** — all pilot routes remain opt-in `/api/pg-pilot/*`, require session identity/role parity and HMAC-bound SQL transaction attestation, and refuse production startup. Normal application, `/api/state`, customer data, and existing JSON business APIs remain unchanged.

## Test coverage and release gates

- CI retains PostgreSQL 16 source import/row parity, verified transaction HMAC, field and project-share authorization, two-tenant denial, negative actor/role tests, legacy Node/Chromium regressions.
- Extended authenticated HTTP test cases cover customer grant/revoke, quote GST/payment forgery refusal, project share→proposal access, field asset→RMA relation, procurement draft-only and finance unissued-only rows, cross-customer composite FKs and forced finance-audit transaction rollback.
- Direct authenticated SQL negative controls exercise payment/provider/OEM claim restrictions at the RLS layer, not merely at Express input validation.
- A separate actual PostgreSQL 16 `pg_dump`→`pg_restore` rehearsal compares **12 RLS tables** and verifies signed owner finance visibility, revoked procurement membership and unauthenticated denial after restore.
- **Do not claim last CI green until current commit's push and PR workflows complete.** Successful earlier commerce code smoke: staging 27/27, HTTP 138/138, restore 20/20. Later hardening adds further negative and restore tests.

## Production blockers

**Full finance/procurement still missing:** real invoice/credit note/GST/e-invoice service provider; supplier RFQ/quote/PO approval and dispatch; inventory reservation and receipt; payments, refunds, bank and escrow reconciliation; marketplace provider identity and award; OEM case creation/return; financial idempotency and legal/compliance review.

**Platform migration still missing:** all-module PostgreSQL transactional repositories, normalized multi-tenant customer schema, production DB secret/attestation architecture, signed external provider evidence, approved historical customer data crosswalk, source/target reconciliation on nonproduction copies, multi-instance concurrency, encrypted backups, real DR rehearsals and Hostinger cutover/rollback.

**NO PRODUCTION CUTOVER:** do not enable staging on live Hostinger, present finance preview as invoice, treat RMA as OEM acceptance or interpret draft PO as supplier dispatch. Main remains unchanged and PR #1 Draft.

## Safe staging operator sequence

Use a disposable local `apex_stage_*` PostgreSQL16 database, staging-only JSON authentication fixture outside the repository, migrations **001 → source import/parity → 002 → 003 + private 32-byte HMAC key → 004 → 005**, local non-superuser SQL pilot credentials and `NODE_ENV=staging`. Run real PostgreSQL HTTP, cross-tenant, audit failure and independent backup/restore tests. Never include customer production secrets or actual transactional payments. Rotate staging attestation keys after a copy.

**Next recommended phase 10.5:** secure fully normalized PostgreSQL domain transactions and validated external sandbox adapters; historical migration parity and production-grade authorization/recovery gates before any customer cutover.
