# Phase 10.5J — Externally Governed Release-Acceptance Dossier and Operator Rehearsal Preparation

**As of 13 November 2026, Asia/Kolkata.** Branch `fix/phase1-security-integrity-20261106` under Draft PR #1. JSON remains the business system of record. No production cutover, new SQL-backed business rollout, real migration, outbox delivery, finance approval, external purchase-order dispatch, or Hostinger deployment is permitted.


## Verified implementation and CI evidence — 13 November 2026

**Verified hardening SHA:** [`075769eb`](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/commit/075769ebcd7712ceb78be79951345f0c6082f035).

- [Push CI #43404580231](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/43404580231) **SUCCESS** and [Draft PR CI #43404587089](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/43404587089) **SUCCESS**, all backend verify, Chromium browser and PostgreSQL staging/rehearsal jobs.
- Phase 10.5J composite release dossier **35/35 PASS**: rechecks cryptographic Phase H and I evidence from actual private artifact bytes, authenticates source/evidence linkage, 4 independently pinned offline release authority roles, 2 signed/revocable operator credentials, signed data processing terms and complete historical ownership dispositions. Added independent-personnel anti-overlap across the prior four data reviewers, and explicit revocation checks for oversight authority keys.
- Previous signed reviewer identity/custody **18/18**, operator/witness handoff **18/18**, monotonic recovery smoke **19/19**, API smoke **96/96**, role authorization **133/133**, independent SQL domain-tenancy **79/79**, PostgreSQL RLS/import **41/41**, cutover BLOCKED gate **8/8**, and PostgreSQL restore **30/30** before and after deliberate clone-only corruption.
- Disposable PG16 CI observed initial clone restore **520 ms**, rollback restore **960 ms**, detected corruption → independently verified rollback **970 ms**, synthetic no-write window **1,960 ms**, frozen snapshot age surrogate **180 ms**, and maximum monotonic↔UTC drift **726 ms**. Declared synthetic benchmarks (RPO-age 10 min, RTO 5 min, no-write window 10 min) were met. These are **runner-only timings**, not measured customer transaction loss or approved corporate RPO/RTO.
- An exclusively synthetic 1-row historical source was exercised both `RETAIN_OWNER_ONLY` and, after rebuilding and re-signing the full reviewer/custody chain, `PROPOSE_CUSTOMER`; neither caused a customerId write. No real customer snapshot, verified corporate human credential, lawful-process authorization, external ticket verification, independently observed live run, or production deployment occurred.

**Decision remains `EXTERNAL_GOVERNANCE_INTAKE_CRYPTO_VALID_PRODUCTION_BLOCKED`** even when every private signature and cross-evidence hash matches. Actual authority validation requires an independent corporate IdP, HR, data controller and privacy office, real artifact custody, live authorized recovery and an explicit human-controlled release process separate from this code.

## Scope and authority boundary

This phase delivers an **offline, cryptographically verified evidence intake** so qualified real personnel and data controllers can later assemble an independently audited nonproduction rehearsal. It does **not** issue corporate credentials, verify actual HR or IdP membership, contact an identity provider, certify a legal processing basis, obtain operator permission, read a genuine customer dataset, invoke `pg_restore`, or produce a production go-live token.

A valid signed dossier returns **exit status 3 (release BLOCKED)**. Invalid/altered documents exit **1**. Inappropriate invocation or unsafe environment exits **2**. There is no code path to success exit 0 and no apply, migrate, restore or deploy subcommand.

## 1. External operator identity and credential authorization requirements

**Four organizational authorities are mandatory** in an out-of-band SHA256 pinned `OFFLINE_EXTERNALLY_GOVERNED_RELEASE_AUTHORITIES` registry, in this exact order:

1. `EXTERNAL_PERSONNEL_IDENTITY_ISSUER` — verifying claimed employee organizational identity.
2. `EXTERNAL_SECURITY_IDENTITY_ISSUER` — verifying claimed personnel key, current access and hardware MFA evidence.
3. `DATA_CONTROLLER_CUSTODIAN` — approving the narrow source/copy purpose.
4. `PRIVACY_DATA_PROTECTION_OFFICER` — independently reviewing processing and deletion terms.

Their 4 Ed25519 keys, key IDs and principals must all differ; they must not share key material with the previously pinned four data reviewers, two reviewer identity issuers, DBA operator or security recovery witness. Their exact registry file SHA256 is provided separately in `APEX_RELEASE_AUTHORITY_ROOT_SHA256`, never taken from untrusted dossier JSON or derived by this program.

The 2 operator/witness certificates bind independently signed values `role,keyId,principal,publicKeySha256,corporateSubjectSha256,idpAccountSha256,mfaAssertionSha256,identityState,lastVerifiedAt,expiresAt,operatorPlanSha256,revocationsSha256,authorityRootsSha256` against the existing separately pinned 10.5I operator public-key registry. Each certificate is signed by **both** independent personnel and security identity issuers, with strict Ed25519 domain separation `APEX_10_5J_OPERATOR_IDENTITY_CREDENTIAL_V1\n`. Both subjects and identity provider accounts must differ, be classified as current active hardware-MFA assertions, valid, and verified **before** the recorded rehearsal began. A current personnel/security jointly signed revoked public-key digest list is mandatory (no older than 24 hours), with domain `APEX_10_5J_REVOKED_OPERATOR_KEYS_V1\n`. Old, future, suspended, duplicate, revoked, tampered, unsigned or self-certified claims fail closed.

**External truth limitation:** an Ed25519 signature can prove authorship relative to a trusted public key. A company must itself confirm that the pinned key genuinely belongs to the corresponding HR/IdP/DP officer, that the hashed employee and MFA assertions match **live** system records, that the certificate has not been suspended, and that the person was entitled to authorize this precise exercise. This program cannot do those out-of-band checks. Its output always has `realHumanIdentityProviderQueried:false`.

## 2. Authorized nonproduction source custody, private files and historical customer ownership

A second, independently signed statement `OFFLINE_NONPRODUCTION_DATA_PERMISSION` binds the immutable JSON source, complete historical row review, exact 10.5H custody receipt SHA256, operator identity certificates, 10.5I recovery witness permit, measured recovery plan/observations, verified SQL schema/data evidence, original PostgreSQL custom archive, precise tenant fingerprint, and the same independently witnessed external ticket digest. Distinct **data controller and privacy officer** keys must both sign its canonical statement with `APEX_10_5J_NONPRODUCTION_DATA_CUSTODY_V1\n`.

The scope is only `READ_ONLY_INDEPENDENT_RECOVERY_REHEARSAL`. It requires SHA256 references for asserted lawful processing basis, privacy impact assessment, key custodian record, private custody location and deletion procedure. Retention is explicitly **1–30 days**; approval must predate the scheduled rehearsal and remain valid beyond it. The source and restore databases must be **different** local disposable `apex_stage_*` databases. The only accepted classes are `SYNTHETIC_TEST_DATA_ONLY` and `PSEUDONYMIZED_AUTHORIZED_NONPRODUCTION_CLAIM`; the latter requires the explicit unverified `AES256_GCM_EXTERNAL_AT_REST_CLAIM_UNVERIFIED` declaration. This is an assertion, **not** proof of actual encryption, lawful basis, residency, backup deletion or contract approval. Unfiltered production-class customer data is ineligible.

Every historically owner-only row across all **12 legacy modules** must have exactly one immutable source-bound disposition: `RETAIN_OWNER_ONLY` (null customer) or `PROPOSE_CUSTOMER` (existing registered customer with a customer-specific evidence digest and two distinct claimed reviewer references). The original Phase 10.5G four-role Ed25519 chain must sign the entire review file; the Phase 10.5H private 8-receipt chain must authenticate the exact byte content. Custodian approval signs the exact retained/proposed counts. Missing rows, duplicate IDs, changing customer IDs or a mismatch between SQL-import/reviewer/recovery provenance blocks the dossier. **No customerId is written or reassigned by this gate.**

**Privacy controls:** the verifier receives **18 distinct absolute private files** outside checkout, owned by the operator and `0600` or more restrictive on POSIX. It never prints customer names, individual record identifiers, private source payload, credential plaintext, issuer public keys, or secret archive contents. It outputs only status flags, SHA256 digests and aggregate counts. The CLI rechecks file content hashes after verification to detect mutation during audit. Staging/runtime production database environment flags or missing explicit offline ACK block execution.

## 3. Independently witnessed recovery and measured evidence acceptance

Phase 10.5J invokes, rather than trusts a JSON success claim from, the **actual** 10.5H identity/custody verification and 10.5I governed-operator recovery validator. The recovery evidence must be from the **same source SHA256 and original restore report** whose historical owner-only data was reviewed. Both operator and security witness sign the exact PostgreSQL archive SHA256, source/checkpoint, monotonic measured recovery observations, recovery plan, run session and external ticket hash. A source from customer/tenant B paired with a restore for customer/tenant A fails.

Only the **disposable PG16 synthetic CI clone** has been restored/corrupted/recovered so far. Its measured RTO and frozen source age are not evidence of production business RTO, customer transaction-loss RPO, encrypted backup restore, distributed write barrier, live customer consent or a real independently observed operator rehearsal.

### Required future human-operated rehearsal handoff (not carried out by this PR)

Before a real authorized nonproduction exercise, the privacy and data owners must approve a designated, lawful pseudonymized snapshot; issue a short-lived off-repo, access-controlled ticket for a named recovery operator; validate the operator and independent witness via corporate IdP with audited MFA; and record separate custody key management and encrypted source/restore storage attestations. Approvals and signatures must be issued **before** the rehearsal window, using keys pinned and verified through an independent channel.

The DBA and security witness then supervise a **separately authorized** restore of a sanitized copy to a physically and logically isolated environment with no production integrations. Record pre-snapshot replication checkpoint, actual transaction loss or zero-loss source freeze evidence, the monotonic recovery timeline, restored table counts, all 16 forced-RLS permissions, 8 migrations, row-level tenant isolation and schema/data content SHA256. Force a synthetic *clone-only* damage/recovery test and verify that the untouched source and immutable original archive remain unchanged. Independently compare measured RTO and **actual data-loss RPO** against targets previously approved by operations.

Security/privacy independently witness deletion and retention closure and archive the audit receipts in the organization's restricted evidence vault. Only an external change authority can decide on a **separate, later** production deployment/release process. No DPA reference, signoff, local tool result or CI green state substitutes for that decision. This phase does not automatically create a live rehearsal or make a release-ready verdict.

## 4. Private CLI contract

Package commands: `npm run assess:release-dossier -- [ordered arguments]` and `npm run smoke:release-dossier`.

The ordered arguments are **exactly**:
```
--source /private/source.json
--review /private/owner-decisions.json
--trust /private/reviewers-trust.json
--signoffs /private/reviewer-chain.json
--reviewPlan /private/reviewer-plan.json
--evidence /private/independent-restored-clone-report.json
--reviewRoots /private/reviewer-identity-issuer-keys.json
--identities /private/reviewer-identity-certs.json
--revocations /private/reviewer-revocations.json
--reviewCustody /private/reviewer-custody-chain.json
--operatorTrust /private/operator-witness-keys.json
--operatorPermit /private/signed-operator-recovery-handoff.json
--operatorPlan /private/measured-operator-plan.json
--observations /private/monotonic-recovery-observations.json
--archive /private/immutable-stage-archive.dump
--authorityRoots /private/externally-pinned-release-authorities.json
--operatorCredentials /private/hr-and-security-operator-credentials.json
--custodyAuthorization /private/controller-and-privacy-data-permission.json
```

Environment must contain:
`APEX_RELEASE_DOSSIER_ACK=OFFLINE_PRIVATE_GOVERNANCE_PREPARATION_ONLY`
`APEX_REVIEW_TRUST_SHA256`
`APEX_REVIEW_IDENTITY_ROOT_SHA256`
`APEX_OPERATOR_TRUST_SHA256`
`APEX_RELEASE_AUTHORITY_ROOT_SHA256`
All must be independently supplied for the exact private files (do not copy a hash from an untrusted approval bundle).

A fully cryptographically valid synthetic dossier prints `productionCutoverReady:false` and exits **3**. It does not return a runnable migration plan, approval token, human credential, or database access. Real external identity, encryption, legal and live rehearsal checks are *not implemented*, so CI must never report these as verified.

## 5. Release gate and tracking

New scripts: `scripts/postgres/release_dossier_gate.mjs`, `tests/release_dossier_smoke.mjs` and two independent **synthetic-only** fixture builders. GitHub Actions runs this new negative-control suite on push and Draft PR, retaining all prior backend, Chromium, PostgreSQL staging/restore and production-cutover-denial checks.

**P0 blockers:** real corporate IdP and HR verification; independently trusted custodian key enrollment/revocation; signed customer owner-only data disposition acceptance; approved lawful processing basis and data residency; proven encrypted authorized offsite source and deletion; independently witnessed recovery with measured customer-data RPO/RTO; all business tenancy and operational finance/provider readiness. Draft PR #1 remains unmerged, `main` unchanged, production blocked. **No evidence of genuine organizational acceptance has been manufactured.**
