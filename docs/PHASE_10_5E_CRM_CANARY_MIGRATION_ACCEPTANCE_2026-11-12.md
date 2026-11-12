# Phase 10.5E — Controlled CRM Read-Through and Customer Migration Acceptance

**Date:** 12 November 2026 (Asia/Kolkata)
**Development branch:** `fix/phase1-security-integrity-20261106` / Draft PR #1.
**Release decision:** **BLOCKED**. This phase is an isolated staging experiment, never a production or Hostinger permission to cut over.


## Verified GitHub CI evidence

- **Code SHA:** [e0d69cc2745a935da29ee892d990c1a04780fb40](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/commit/e0d69cc2745a935da29ee892d990c1a04780fb40).
- **Push:** [#43215153638](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/43215153638) — **completed success**, including `verify`, `browser`, and `postgres-staging`.
- **PR:** [#43215162295](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/43215162295) — **completed success**.
- The new independent real PostgreSQL 16 canary suite passed **18/18** two-tenant assertions. All tests used disposable, synthetic snapshots. No live customer snapshot or production permission was tested.

## Implemented read-through boundary

The selected existing business endpoint is `GET /api/crm`, not the experimental
`/api/pg-pilot/crm`. The normal cookie and
`BUSINESS_OWNER | SALES_MANAGER` role middleware are unchanged. No other normal
business route is routed to PostgreSQL. Feature flags default to off.

To authorize one test actor for PostgreSQL read-through, explicitly set
`NODE_ENV=staging`, `APEX_PG_PILOT_ENABLED=true`,
`APEX_PG_PILOT_ACK=LOCAL_STAGING_ONLY_NO_CUTOVER`, the existing PG staging
safety acknowledgement, isolated private absolute JSON path, loopback-only
`apex_stage_*` database and valid HMAC signing key; additionally set
`APEX_PG_CRM_READ_THROUGH=true` and
`APEX_PG_CRM_CANARY_STAFF_IDS=<explicit-staff-id-list>`.
The allowlist has no wildcard, must contain 1–20 unique safe staff IDs and is
not inferred from any request header. Production, absent SQL pilot, invalid
database credentials, missing allowlist or disabled staging ACK fail closed
at startup. Non-canary users retain the current JSON GET path.

A canary request starts a serializable read-only SQL transaction with the
existing transaction-bound HMAC tenant/actor signature and restricted
`apex_pilot_writer` role. PostgreSQL enforced RLS and explicit tenant
predicate filter CRM rows. A typed repository checks each SQL
`tenant_id`, `customer_id`, `source_id` against its CRM payload. The server
compares *all* actor-visible JSON rows (including customer grant visibility)
against SQL rows by canonical content and stable record ID, preserving the
original response order. An exact match permits SQL to serve the original
`{success:true,data:[...]}` response and a no-store read-source header.
A mismatch, revocation conflict or concurrent JSON mutation yields **409
with no CRM data**; a SQL problem yields **503 with no CRM data**.
Fallback to stale JSON on an SQL revocation would leak revoked customer
records, so it is intentionally forbidden for allowlisted actors.

This is a **read-only** prototype. It does not dual-write, stage missing
rows, resolve conflicts, enable the outbox, redirect `/api/state`, or move the
source of truth. The broader application remains a single-tenant JSON system.
Do not interpret a canary match as production-read readiness.

## Independent tenant authorization tests

`npm run smoke:pg:crm-tenants` uses a fresh PostgreSQL 16 disposable
`apex_stage_*` DB and creates **two independent tenants and two Express
processes**, each with its own private JSON session store. A/B intentionally
reuse the same customer IDs and CRM IDs but use different CRM payloads.
Checks include:

1. Both owners see only their own tenant's full CRM records; both sales users
   see only their customer grants. Nonallowlisted Sales stays JSON-only,
   Procurement gets 403, anonymous gets 401 and foreign-process cookies get 401.
2. A caller-supplied tenant header cannot override the signed session tenant.
   An untrusted SQL login setting actor/tenant GUCs without a transaction-bound
   HMAC receives zero cross-tenant records.
3. Revoking a customer grant in PostgreSQL but not JSON returns 409 with no
   records for the stale-grant user; revoking both returns empty verified rows.
   Tenant B stays unaffected by Tenant A revocation.
4. Deliberate SQL CRM payload tampering causes 409 for Tenant B while Tenant
   A continues to serve verified content; no reading action creates audit rows.
5. Named canary environment fails startup when detached from the pilot or
   lacking the allowlist; default business GET stays JSON for other sessions.

A CI pass is evidence only for these isolated, synthetic conditions, **not**
evidence of real production tenancy, live migrations or Hostinger readiness.

## Customer migration acceptance criteria (all mandatory)

| Gate | Pass threshold / evidence required | Current result |
| --- | --- | --- |
| Immutable authorized source | Owner-approved private source snapshot; source SHA-256 before/after identical; zero test writes to customer data; verified backup custody and retention | **PENDING** for genuine data |
| Customer identity and custody | 100% explicitly approved tenant/customer IDs, stable staff identity mapping, disabled account state, named grant owners; zero orphaned or inferred ownership records | **PENDING** |
| Scoped row parity | Every customer: 100% equality of canonical content digest and count for all 11 scoped classes, duplicates = 0, zero cross-customer FK mismatches | **PENDING** for genuine data |
| Cross-module graph | 100% reconciliation of proposals→projects, RMA→assets, customer staff grants, project collaborator grants, creator/assignee/reporter custody; zero unauthorized historical ownership changes | **PENDING** |
| Legacy owner-only decisions | All inventory, invoices, supplier/provider and other owner-only collections either remain restricted or have per-record independently signed customer mapping; **zero guessed mappings** | **PENDING** |
| Identity and authorization | Independent cross-tenant tests for **every** business endpoint/role, denied forged context and revoked access, production-reviewed non-impersonable identity, distributed session revocation | **PENDING**; CRM-only staging evidence |
| Operational rehearsal | At least one versioned, restore-tested authorized copy with documented downtime window, rollback point, checksums, RPO/RTO targets, tested reverse-write policy and incident ownership | **PENDING** |
| Change/release approval | Named customer data custodian, security/privacy owner and operations approver; reviewed retention, DPA/GST obligations, KMS credentials, monitoring, rollback and evidence links; explicit production sign-off | **PENDING** |

**Acceptance algorithm:** treat any missing approver, missing historical
customer ownership, unresolved digest mismatch, cross-tenant visibility,
unreconciled legacy record or failed restore as a hard NO-GO. The existing
read-only `verify:pg:customer-manifest` includes per-customer digests and
owner-only counts, but it intentionally sets
`ownerOnlyMappingApproved:false` and `productionCutoverReady:false`.
The `assess:pg:cutover` CLI must continue to report **BLOCKED** (exit 3).
An isolated canary match cannot override either.

## Commands and rollback

1. Run all migrations 001–008 and the existing staging import/manifest on
   **disposable, never production, snapshots**. In GitHub Actions the
   PostgreSQL job builds the binary, runs staging source+RLS parity,
   authenticated pilot checks, the independent two-tenant canary checks,
   isolated multi-instance work-order/outbox checks and separate dump/restore.
2. Use `npm run smoke:pg:crm-tenants` on a local disposable fixture with
   `APEX_PG_PILOT_*` and `PG*` CI-safe environment variables. The suite
   cleans its own temporary tenant records and local JSON fixture files.
3. If parity/authorization fails: disable
   `APEX_PG_CRM_READ_THROUGH` or remove the canary staff IDs, restart the
   **staging** instance, inspect the JSON/PG discrepancy privately, and
   restore the disposable stage snapshot if necessary. Never backfill live
   customer data or promote SQL to production on test results.

**Open P0 blockers:** whole-platform normalized SQL CRUD, independent
production tenant identity/session security, signed per-record legacy customer
crosswalk approval, a production-grade outbox and audited dispatch providers,
verified live historical snapshot/restore, legally compliant finance/GST
workflows, and signed operational Hostinger acceptance. Keep PR #1 Draft;
do not merge, deploy or modify real customer data.
