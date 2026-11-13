# Phase 10.5F — Historical Ownership Review, Independent Migration Rehearsal and Tenant Isolation

**Date:** 12 November 2026, Asia/Kolkata  
**Branch:** `fix/phase1-security-integrity-20261106`, Draft PR #1  
**Production decision:** **BLOCKED**. Only disposable PostgreSQL 16 data is used. Do not merge, deploy, execute a customer-data migration, or enable outbox delivery.


## Verified implementation CI

**Code SHA:** [`2a20b0941708f37499fc3c64156f9a5ba9c3b554`](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/commit/2a20b0941708f37499fc3c64156f9a5ba9c3b554).

- [Push CI #43228070837](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/43228070837): **completed success**, `verify` / `browser` / `postgres-staging`.
- [Draft PR CI #43228083159](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/43228083159): **completed success**.
- Actual disposable PostgreSQL 16 staging + historical review negative controls: **41/41**.
- Authenticated SQL HTTP: **163/163**; two independent Express processes: **33/33**; two-tenant CRM read-through: **18/18**.
- New independent two-tenant **six-domain** role/customer RLS matrix: **79/79**.
- Read-only cutover BLOCKED preflight **8/8**, inert outbox safety preflight **8/8**, initial and repeated SQL restore acceptance **30/30** each.
- The independent full-clone evaluator compared **18** SQL tables, **16** FORCE-RLS tables, **8** schema markers and read-only canonical hashes. Insertion of a dummy tenant into the **restored clone only** was detected; the immutable archive SHA256 remained the same; rebuilding that clone restored exact parity.
- All evidence is synthetic staging; there is no externally verified human approval or live customer migration.

## Scope and exact safety boundary

This phase strengthens *planning evidence*, not production cutover. The normal
application remains JSON primary; Phase 10.5E's single opt-in CRM canary is
unchanged and still staging-only. There is **no new business endpoint rollout**
and no SQL mutation of live customer data.

## 1. Historical owner-only record review preparation

**Script:** `scripts/postgres/owner_legacy_review.mjs` via
`npm run verify:pg:owner-review -- --source /absolute/private/source.json --review /absolute/private/review.json`.

The separate review file MUST use the same immutable source SHA256, tenant ID,
and one explicit decision for **every** record in all 12 owner-only kinds:
invoices, marketplace disputes, knowledge articles, inventory transactions,
products, suppliers, RFQs, Telegram messages, licenses, providers, workflows,
connectors. An individual proposal has exactly these keys:

```json
{
  "kind": "invoices",
  "id": "private-historical-record-id",
  "disposition": "RETAIN_OWNER_ONLY",
  "customerId": null,
  "evidenceSha256": "<64-character-hex-evidence-digest>",
  "reviewerRefs": ["external-data-owner-record", "external-security-review-record"]
}
```

The alternative `PROPOSE_CUSTOMER` requires a registered customer ID and
the same two distinct external evidence references. The script checks:
source hash, source/SQL import provenance, row/payload equality, nonduplicate
decisions, exact record coverage, valid proposed customer, reviewer reference
**format** and immutable source/review bytes. It runs a `REPEATABLE READ READ
ONLY` SQL transaction and outputs only **hashed** row/customer identifiers
plus aggregate counts; it cannot modify PostgreSQL, customer mapping, grants
or the source. Source/review files must be private absolute files outside
checkout; default/remote/production databases are refused.

**Critical distinction:** `reviewerRefs` are **claims**, not signatures.
No external reviewer identity, signature, chain of custody, permission to
migrate or legal basis is cryptographically verified. The report always sets
`externalSignatureVerified:false`, `customerMappingApplied:false`,
`productionCutoverReady:false` and `decision:REVIEW_ONLY_BLOCKED`.
Even 100% internal format coverage does **not** mean records are approved
for customer reassignment.

The existing `customer_reconciliation_manifest.mjs` additionally checks
the complete historical staff ID, role and disabled-status mapping; duplicate
source grants/project shares are refused. Its scoped 11-domain/customer
content hashes, related project/proposal and asset/RMA graph, assigned
engineer/reporter/creator custody and legacy owner-only equality remain.

## 2. Independent PostgreSQL rehearsal, tamper detection and rollback proof

**Verifier:** `scripts/postgres/rehearsal_evidence.mjs`,
`npm run assess:pg:rehearsal`. Requires `APEX_PG_STAGING_ACK`,
`APEX_PG_REHEARSAL_ACK=DISPOSABLE_RESTORED_COPY_ONLY`, loopback PGHOST,
two distinct `apex_stage_*` database names and no production/remote URL.
It never executes any SQL mutation. Its primary and restored-copy
`REPEATABLE READ READ ONLY` transactions compare:

- **All 18** schema/data tables, including the secret-key table (compared
  as a **hash only**, never printed), 16 FORCE-RLS tables, 8 staging migration
  markers, original import SHA, exact record counts and canonical SHA256.
- Policy definitions, FK/CHECK constraints and indexes; restored copies
  differing in authorization policy or business data hard-fail.
- Explicit PostgreSQL 16 and source-vs-restored database isolation checks.

CI performs the *write/restore drill* on a throwaway clone only:

1. Build PG16 staging fixture, run the existing import/source/customer digest
   checks, authenticated SQL tests and 2-process/2-tenant suites.
2. Make one PostgreSQL custom-format archive of disposable stage data; record
   its SHA256; restore into distinct `apex_stage_restored`. Run existing
   30-case restore smoke and independent full-clone digest verification.
3. Deliberately add a dummy tenant **only to the restored clone**, require
   the independent digest verifier to exit 1 on corruption, then drop/recreate
   that disposable clone and restore **from the original immutable archive**.
4. Recheck archive SHA256, full schema/data digest, forced RLS, and the
   existing restored auth/customer isolation test suite. An unexpected
   success after tamper or any recovery mismatch makes the CI step fail.

These prove that synthetic restore data and SQL isolation survive one
controlled throwaway damage/recovery exercise. They **do not** prove a live
Hostinger RPO/RTO, real snapshot retention/encryption, coordinated application
write freezes, legitimate customer authorization or deployment rollback.

## 3. Independent two-tenant six-domain authorization

`npm run smoke:pg:tenant-matrix` uses two separately named,
disposable tenants with **identical** customer IDs and record IDs across
CRM, projects, assets, tickets, jobs and quotes. It creates Sales,
Procurement, IT-head, Field and disabled-role identities under signed
transaction-bound SQL actor context.

Authorization must be the intersection of valid signature + tenant + role
+ current registered customer grant + object assignment or project share.
The matrix tests owner isolation, Sales project shares, Procurement read
limits, IT-head scope, field assignee visibility, disabled staff denial,
forged/altered actor context refusal, cross-tenant insert denial, inability
to rewrite customer custody and immediate revocation without affecting
a second tenant. All temporary tenants/data are removed after the test.
This is **database-enforced staging RLS evidence**, not a proof that all
runtime JSON endpoints are tenant-safe.

## 4. Manual acceptance & independent reviewer sign-offs (NOT granted)

| Gate | Evidence required | Status |
| --- | --- | --- |
| Source provenance and authorization | Authorized private customer snapshot, immutable hash, named data custodian and legal basis | **PENDING** |
| Historical ownership | Every owner-only record has a defensible separate custodian/security mapping decision; verified signatures and evidence attachments | **PENDING** |
| 11-domain customer record parity | Per-customer exact counts and hash equality, staff roles/disabled state, project/proposal + RMA/asset + customer grants, no orphan/foreign data | **PENDING for genuine data** |
| Tenant isolation | Independent real-identity end-to-end tests for all runtime API roles and all modules, not only PG SQL and CRM pilot | **PENDING** |
| Recovery playbook | Encrypted backup, retention, restored customer-snapshot SHA, tested RPO/RTO, private offsite key custody, reversal/forward-write strategy | **PENDING** |
| Approval and operations | Signed data owner, independent security/privacy reviewer, DBA restore reviewer and release manager; deployment window, kill switch, incident handoff | **PENDING** |

No approval records have been supplied or signed in this repository.
The only provided signatures in the SQL pilot are **staging transaction HMACs**,
which are unrelated to legal customer migration approvals. Do not convert
`REVIEW_ONLY_BLOCKED` into an approval merely because CI passes.

## 5. CI runbook and rollback

Run `npm run smoke:postgres` first (after migration 001 and isolated source
import), then all staging SQL migrations/pilot, `smoke:pg:tenant-matrix` and
normal restore steps. The full clone evidence verifier is run only after
`PGRESTORE_DATABASE` has been created by the CI job.
If an artifact differs or customer ownership lacks verified human approval,
record the mismatch as NO-GO, preserve authorized encrypted evidence,
disable the CRM canary in staging, and leave the live JSON source untouched.
The read-only cutover gate **must** continue to return
`gate:BLOCKED` (exit status 3). No outbox worker or external payment/provider
connector is enabled.

**Next candidate:** Phase 10.5G independent reviewer sign-off workflow,
full API authorization matrix and operator-run rehearsal with authorized
copy and approved recovery objectives. **No additional read-through endpoints
until the above safety gates are approved.**
