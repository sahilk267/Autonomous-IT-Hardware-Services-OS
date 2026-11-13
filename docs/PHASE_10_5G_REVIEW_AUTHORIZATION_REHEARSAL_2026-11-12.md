# Phase 10.5G — Independent Reviewer Sign-off Validation, Full Route-Level Authorization and Operator Rehearsal Gate

**Date:** 12 November 2026 (Asia/Kolkata). **Branch:** `fix/phase1-security-integrity-20261106`. **Release:** BLOCKED. Draft PR #1 remains unmerged; `main`, the JSON system of record and all deployed customer data are unchanged.


## Verified CI evidence (code SHA `3b7d56c`)

- [Push workflow #43253492203](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/43253492203): **completed SUCCESS** — backend `verify`, browser and `postgres-staging` all passed.
- [Draft PR workflow #43253506158](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/43253506158): **completed SUCCESS** — all three jobs passed.
- TypeScript route inventory: **95** normal routes and **39** PostgreSQL pilot route declarations; **90** anonymous-denial HTTP probes, **84** denied-role HTTP probes, **4** authenticated unrole-gated GET probes. Every pilot route is verified to require authentication and has an anonymous-denial probe in the SQL HTTP suite.
- Offline Ed25519 four-signature reviewer chain: **21/21 PASS** including signature tampering, out-of-band trust-pin mismatch, duplicate roles/keys, unregistered customer, source hash replay, incomplete review, RTO/RPO/write-freeze failures, and production refusal. A synthetically signed record returns **exit code 3 (BLOCKED)**.
- Full previous staging, genuine two-tenant SQL / independent CRM, authenticated SQL HTTP, and isolated restore/corrupt/rollback CI checks remained successful. **No real customer-data approval, signed corporate identity, or live migration was performed.**

## 1. Review sign-off — what is actually implemented

The **offline-only verifier** `scripts/postgres/review_signoff_gate.mjs` verifies a four-step ordered, SHA256-linked **Ed25519** attestation chain from distinct keys with externally pinned public-key registry. It never signs documents, accepts vendor credentials, migrates data, changes a database or authorizes deployment.

Required independent roles, in order: `DATA_CUSTODIAN`, `SECURITY_REVIEWER`, `DBA_RESTORE_REVIEWER`, `RELEASE_MANAGER`. Every signed message binds exact source JSON bytes SHA256, complete historical owner-only review JSON bytes SHA256, operator plan SHA256, actual restore-evidence JSON bytes SHA256, role, key ID, sequence and prior-record SHA256. Signatures carry an expiration at most 90 days ahead. The trusted registry requires four distinct persons, key IDs and actual Ed25519 public-key fingerprints. Any substitution/replay/role confusion/repeated reviewer/missing predecessor invalidates the chain.

For private offline assessment, provide six separate absolute files outside the repository checkout. Set `APEX_REVIEW_STAGING_ACK=OFFLINE_ONLY_NEVER_CUTOVER` and independently obtain/set `APEX_REVIEW_TRUST_SHA256`; then run:

```bash
npm run assess:review-signoff -- \
  --source /private/source.json \
  --review /private/review.json \
  --trust /private/trusted-public-keys.json \
  --signoffs /private/ordered-attestations.json \
  --plan /private/rehearsal-plan.json \
  --evidence /private/restore-evidence.json
```

The trust registry has `{"scope":"OFFLINE_REVIEW_ONLY","keys":[...four public-key entries...]}`. Each key entry specifies `role`, `keyId`, `principal`, and PEM-encoded `publicKeyPem`. Reviewer records have `sequence`, `prevSha256`, `role`, `keyId`, `attestation`, and `signatureBase64`. Attestation payloads contain `sourceSha256`, `reviewSha256`, `planSha256`, `restoreEvidenceSha256`, `decision:"REVIEWED_FOR_DISPOSABLE_REHEARSAL_ONLY"`, `scope:"OFFLINE_NO_PRODUCTION_CUTOVER"`, and `expiresAt`. The signed bytes are the UTF-8 domain prefix `APEX_OS_10_5G_REVIEW_ATTESTATION_V1\n` followed by recursively key-sorted JSON of sequence, previous hash, role, key ID and attestation. All input files are read-only, private and separately hash-checked.

**Crucial separation:** cryptographic correctness does not establish genuine staff identity or approval authority. The source and trust file are **not** substitutes for independent custodian authorization, legal review, hardware-protected private keys or verified organizational role assignment. This stage does **not** provide an official signing authority, key revocation/rotation, tamper-evident external log, human approval portal or operational workflow. Even a valid four-signature bundle **returns exit status 3** with `operatorRunAuthorized:false` and `productionCutoverReady:false`; no `--approve`, `--migrate` or `--send` action exists.

## 2. Operator-owned rehearsal plan with explicit recovery objectives

The separate plan `plan.json` has these **mandatory** fields:

```json
{
  "operation": "DISPOSABLE_REHEARSAL_REVIEW_ONLY",
  "sourceSha256": "<source hash>",
  "reviewSha256": "<review hash>",
  "restoreEvidenceSha256": "<restore evidence hash>",
  "rpoMinutes": 15,
  "rtoMinutes": 45,
  "maximumDowntimeMinutes": 60,
  "windowStart": "2027-01-05T00:00:00Z",
  "windowEnd": "2027-01-05T02:00:00Z",
  "writeFreeze": true,
  "rollbackOwner": "independently-approved-operator",
  "incidentOwner": "incident-response-owner",
  "rollbackTrigger": "Mismatched source digest or unauthorized record visibility"
}
```

**All values above are illustrative synthetic test inputs, not approved RPO/RTO SLAs or an actual booking.** RPO/RTO/downtime are explicitly bounded integers, RTO cannot exceed maximum downtime, window must be finite and no longer than 24 hours, write freeze is mandatory, incident/rollback responsibility must be declared. Proof must be the `INDEPENDENT_DISPOSABLE_RESTORE_REHEARSAL_EVIDENCE` format from `assess:pg:rehearsal` including **18 tables**, **16 FORCE-RLS**, **8 migration markers**, immutable source and original-tenant SHA, read-only comparison and `restoreEqual:true`. The signed plan binds that evidence hash. No operator-controlled rehearsal is executed by this tool; the Phase 10.5F clone-corrupt-recover CI drill remains the only verified recovery exercise.

To qualify a future real controlled rehearsal, require actual RPO/RTO measurements from an operator-managed, authorized customer snapshot, external signature identity and role custody, independent security/privacy and DBA sign-off, encrypted backup/offsite retention, read-only parity across *all* modules, validated cutback after write-freeze, comprehensive test results and incident plan. There is no production authorization or an automatic promotion switch.

## 3. Every business API authorization inventory and HTTP denial matrix

New `tests/business_route_inventory.mjs` uses the TypeScript parser to enumerate *every registered* `app.get/post/put/patch/delete('/api/...')` literal route from both `server.ts` and `server/postgres_pilot.ts`, failing if a nonpublic route lacks `requireAuth`. Exactly five known public endpoints (health, auth status/setup/login, signed Telegram webhook) are excluded from session-required checks; those use separate existing defenses.

`tests/business_api_authorization_matrix.mjs` starts a **disposable production-mode local server** and tests **every normal protected route** with no session (expects 401, no private record data). For each route with a role allowlist it tests a real cookie-authenticated role **outside that allowlist** (expects 403, no data). Routes with authenticated-but-no-role GETs additionally get an owner read probe. No privileged business mutation is executed by these negative tests. The PostgreSQL authenticated HTTP suite now independently tests every staged pilot route's anonymous denial before normal signed SQL regression. Route inventories fail when a new route is added without the corresponding auth coverage. Existing customer-object, role, browser and two-tenant PostgreSQL tests remain.

**Scope limitation:** these tests establish middleware authentication and route-level role denial, **not** object ownership or cross-tenant authorization correctness across every business route. The current main JSON store is still fundamentally single-tenant; only staged SQL and narrow CRM pilot have multi-tenant acceptance. Full authenticated cross-customer object matrix, conflicting ownership, edits and cross-process distributed sessions remain release blockers.

## 4. CI and deployment gates

In `.github/workflows/ci.yml`, verification runs the new exhaustive HTTP-route matrix and deterministic local Ed25519 negative suite. The PostgreSQL CI job runs the extended pilot-route coverage, customer historical reconciliation, multi-tenant SQL matrix and Phase 10.5F restore/corruption recovery workflow. All tests use disposable fixtures. All real external providers/payment/GST sending remain blocked; the outbox remains inert. The standalone read-only cutover readiness gate **always returns `BLOCKED` exit 3** even when every test is green.

**No production migration can be authorized by Phase 10.5G**. Remaining requirements include independently certified real reviewers, verified chain-of-custody and secure key management, real owner/customer mapping consent, all-module object authorization, full cross-instance shared sessions, actual approved recovery runbook and results, legal finance/provider integrations, and a formal Hostinger deployment approval. Next phase should implement a separately governed, operator-verified evidence collection and exhaustive object-level authorization testing **without adding new business read-through endpoints**.
