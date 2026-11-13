# Phase 10.5I — Legacy Object Authorization and Independently Governed Recovery Evidence

**Date:** 13 November 2026 (Asia/Kolkata). **Branch:** \`fix/phase1-security-integrity-20261106\` on Draft PR #1. **Cutover:** BLOCKED; existing JSON primary source and one opt-in staging-only CRM canary unchanged. This phase includes no live migration, SQL delivery, procurement dispatch or Hostinger deployment.

## 1. Close the legacy object authorization and integrity gap

Prior Phase 10.5H covered 12 explicitly customer-bound mutation routes and 11 customer-bound read collections, but excluded 18 legacy/owner-only/global dynamic routes from object mutation tests. That meant a route's middleware role check was verified, but not its nonexistent-resource safety and state immutability. Phase 10.5I adds \`tests/legacy_object_integrity_matrix.mjs\`:

- **18 previously excluded routes**: all tested with a real authenticated role that must be denied (HTTP 403), and separately with an allowed role pointing to a nonexistent object (HTTP 404; workflow adapter endpoints deliberately return 501). Unauthorized attempts must not return business data or change persistent catalog, RFQ, finance, licenses, knowledge, workflow, staff or project state.
- Dynamic \`/:id\`, \`/:invoiceNo\`, and milestone route registration is enumerated from the TypeScript AST. **All 30 declared dynamic main routes must be accounted for** by either the existing 12 customer-scoped foreign-object tests or 18 newly tested owner-only, global or legacy object routes; an unclassified addition fails CI.
- Customer scope remains distinct from tenant-global role authorization. Owner-only invoices, licensed seats, catalog, RFQ, knowledge and workflows have no proven individual customer ownership. These tests cannot convert their legacy structure into per-customer objects, cannot prove real multi-instance JSON tenancy and do not grant customers access to previously owner-only records.

### Concrete catalog and RFQ attack-surface hardening

Review identified a real mutation-integrity weakness: product POST/PATCH previously spread arbitrary \`req.body\` including caller IDs; supplier and RFQ creation permitted caller-supplied IDs and RFQ quote histories. Because these are tenant-global owner/procurement collections, such fields could corrupt source identity and internal procurement provenance.

Updated \`server.ts\` and \`server/db.ts\`:

- All \`POST/PATCH /api/products\` updates use a bounded allowlist of typed catalog fields; malicious \`id\`, \`tenantId\`, \`customerId\`, fake settlement, nested objects, negative prices and invalid stock values are denied. Server issues source ID; SKU uniqueness is case insensitive; reserved stock cannot exceed available. DB transaction logic independently prevents ID reassignment or duplicate SKU and verifies stock invariants.
- \`POST /api/suppliers\` accepts only catalog details; ID is created by server, with bounded/safe field types.
- \`POST /api/rfqs\` accepts a real product, integer quantity and urgency, preserves historic status-forgery compatibility only by ignoring client \`status:PO_DISPATCHED\`, never copies client supplier quote history, prepared PO or ID, and always starts with status OPEN.
- \`POST /api/rfqs/:id/quotes\` validates an exact supplier quote shape and prevents client recommendation or PO status fraud. Transaction checks block repeated supplier IDs and any additional supplier quotation after a PO has been prepared.
- \`POST /api/rfqs/:id/dispatch-po\` can only prepare an **internal** PO from the stored quote; no actual purchase order is transmitted. External vendor identity and payable acceptance are not verified.

**Remaining caveat:** RFQ supplier self-reported IDs, vendor legal identity, catalog/stock provenance and downstream invoice/payment reconciliation are not independently verified. This phase improves technical integrity, not procurement authorization by an external provider.

## 2. Independently witnessed synthetic operator evidence handoff

New read-only \`scripts/postgres/governed_handoff_gate.mjs\` verifies:

1. Phase 10.5H's independently measured **disposable** PostgreSQL restore/corrupt/recover budget and SHA256-verified archive.
2. A separate, externally pinned \`OFFLINE_OPERATOR_EVIDENCE_REVIEW_KEYS\` Ed25519 public-key registry with exactly **two independent** roles: \`DBA_REHEARSAL_OPERATOR\` and \`INDEPENDENT_SECURITY_WITNESS\`; different principals, key IDs and key material.
3. Two SHA256-linked, ordered, time-bound Ed25519 signatures binding byte-for-byte \`planSha256,observationsSha256,evidenceSha256,archiveSha256\`, exact \`operatorSession\`, an \`reviewTicketSha256\`, \`decision:REVIEWED_SYNTHETIC_RECOVERY_EVIDENCE_ONLY\`, \`operationTarget:DISPOSABLE_POSTGRESQL_CI_COPY_ONLY\`, \`issuedAt\` and \`expiresAt\`.
4. Missing or changed signature, receipt predecessor, source archive, operation target, ticket, measured timing, or external registry pin fails closed; no signing keys live in the repo or runtime environment.

**CLI:** \`npm run assess:governed-handoff -- --trust /private/operator-trust.json --permit /private/handoff.json --plan /private/operator-plan.json --observations /private/recovery-times.json --evidence /private/recovery-evidence.json --archive /private/immutable-stage.dump\`

Required: absolute private files outside checkout, \`APEX_OPERATOR_HANDOFF_ACK=OFFLINE_SYNTHETIC_REVIEW_ONLY\`, \`APEX_OPERATOR_TRUST_SHA256\` pinned through a *separate* governance channel; \`NODE_ENV\` must not be production, and runtime SQL activation is rejected.

**Operational/authority limitation:** these are signatures over a **synthetic CI evidence packet**. There is no actual corporate reviewer identity verification, no independent check that an off-repo ticket exists or was issued by a genuine authority, no production operator permission, no encryption/KMS evidence, and no live database rehearsal. A valid operator packet always exits 3 (**NO-GO**), never authorizes a migration or external action. This verifier is not a scheduler or a deployment tool.

## 3. Acceptance gates and next real-world requirements

| Gate | Synthetic evidence delivered in code | Remaining requirement |
| --- | --- | --- |
| Every parameterized main business route is audited | 12 customer BOLA + 18 legacy object denials; exact inventory fails on additions | Cross-tenant production JSON runtime and external client identities |
| Catalog/procurement source integrity | Server ID/field controls + duplicate supplier/PO quote freeze | Verified OEM/vendor registry, real inventory reconciliation, procurement signoffs |
| Independent operator review | Exact dual-signed Ed25519 nonproduction review packet with external trust hash | Authorized corporate HR/release approvals, independently signed ticket/custody receipt, key lifecycle |
| Measured restore success | Phase H real synthetic PG16 clone timings; immutable archive/SQL digest | Approved **real** RPO/RTO, legal customer snapshot, production write-freeze and encrypted offsite disaster-recovery drill |
| Production/Hostinger release | **BLOCKED** via existing cutover safety gate | DBA/privacy/data owner/release manager approvals, live integration audit, incident rollback playbook |

Do not merge Draft PR #1 or change \`main\` merely because CI passes. No new PostgreSQL-backed endpoint, external PO delivery, payment settlement, or deployment is authorized. The next allowed phase should address real customer-data identity and deployment governance only after the human owners have provided an approved test context. All synthetic fixtures are disposable.
