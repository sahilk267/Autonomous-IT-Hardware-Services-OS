# Apex Autonomous IT Hardware & Services Operating System

> **Current status (2026-11-12): Phase 10.5D staging-only repository shadow and expanded cross-module reconciliation are CI GREEN; the read-only outbox dispatch design gate is BLOCKED by design. Production cutover BLOCKED.** Normal app JSON remains authoritative, no outbox worker or delivery exists, and the repo is Draft/unmerged. See [Phase 10.5D report](docs/PHASE_10_5D_REPOSITORY_CROSSMODULE_DISPATCH_DESIGN_2026-11-12.md).

Apex is an **evolving single-tenant prototype** for IT hardware distributors, system integrators and managed service providers. It is not yet a certified multi-tenant enterprise operating system.

---

## ⚡ Key Architectural Capabilities

1. **Strict Zero Mock Data Guarantee**:
   - Clean initial business records and no fabricated live provider confirmations. Some legacy UI samples/provider claims remain under review; source test fixtures are isolated.
   - A fresh development install can start empty; any existing deployed customer store must be preserved during upgrades.
   - Single-process JSON commits; no automatic pre-mutation backups. Owner-only customer grants are application-enforced, not database RLS. Operator-only offline backups via `npm run backup:data` (service must be stopped).

2. **IT Operations & Proposed Automation Rules**:
   - **Executive CIO Hub**: Dynamic metrics calculated on real catalog, procurement, and active ledger balances.
   - **ITSM Helpdesk & CMDB**: IT ticket lifecycle, registered endpoint inventory, and what-if topology visualization. Live agent telemetry and discovery are pending.
   - **Procurement & RFQ Engine**: Internal RFQs, manually entered supplier quotes and `PO_PREPARED` records. **No vendor dispatch adapter yet.**
   - **BOM Builder**: Intelligent AI-assisted bill-of-materials sizing powered by Gemini AI.
   - **Field Service & Dispatch**: GPS-tagged engineer dispatch, job status workflows, and atomic inventory spare-part consumption.
   - **Asset & AMC Manager**: Contract tracking, SLA threshold calculation, and automated preventative maintenance alerts.
   - **Finance / GST Preview**: Unverified per-line GST estimates where HSN/SAC and rates are supplied; internal receivable drafts only. **No government IRN or statutory filing.**
   - **Telegram Owner Hub**: Local AI command console and optional Bot API send adapter; provider acceptance depends on configuration. No live delivery certified.
   - **Audit Event Ledger**: Internal server-authored event records; not tamper-evident or legally immutable.

3. **Enterprise Integration Connectors**:
   - Integrations explicitly reflect their operational connection status: `NOT_CONFIGURED` or `CONFIGURED`.
   - Google Gemini AI (`@google/genai` TypeScript SDK) for real AI processing.
   - Unconfigured payment/tax gateways return honest HTTP 503 status codes rather than fabricated transaction IDs.

4. **Production Deployment Prerequisites**:
   - Single-instance Node runtime. Hostinger integration and production deployment have not been accepted or certified.
   - Bundled CommonJS server (`dist/server.cjs`) with production `PORT` configuration. **Requires an explicit absolute `APEX_DATA_FILE` outside the checkout in production**.

---

## 🚀 Quick Start

### 1. Installation
```bash
npm install
```

### 2. Environment Configuration
Copy `.env.example` to `.env` and fill in necessary keys:
```bash
cp .env.example .env
```

| Key | Description | Required For |
| :--- | :--- | :--- |
| `PORT` | HTTP Server Port (Default: 3000) | Express server |
| `NODE_ENV` | `development` or `production` | Environment runtime |
| `GEMINI_API_KEY` | Google Gemini API Key | BOM Builder, Ticket Diagnosis, Copilot |
| `GEMINI_MODEL` | Gemini Model Alias (Default: `gemini-2.5-flash`) | Gemini API calls |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot Token from BotFather | Mobile Telegram Approvals |
| `RAZORPAY_KEY_ID` | Razorpay API Key ID | Payment Link Generation |
| `GST_API_KEY` | Intended GST integration configuration only (adapter pending) | Future statutory filing |
| `APEX_DATA_FILE` | Absolute writable JSON path **outside app checkout** | REQUIRED for production start |
| `APEX_INITIAL_SETUP_TOKEN` | One-time randomly generated private token | Required for first owner enrollment |
| `APEX_ALLOW_PRODUCTION_RESET` | Keep `false` | Disable dangerous production reset |
| `APEX_PUBLIC_ORIGIN` | Optional explicit HTTPS origin used by Origin validation | Recommended behind reverse proxies |

### 3. Run Development Server
```bash
npm run dev
```
The server will start on `http://localhost:3000`.

### 4. Run Automated System & Zero Mock Data Tests
```bash
npm test
```

### 5. Production Build

**Mandatory before starting:** Complete [production data migration](docs/DEPLOYMENT_DATA_SAFETY.md). No automatic conversion of checked-in `data/app-store.json` is performed.


```bash
npm run build
# Production requires APEX_DATA_FILE pointing OUTSIDE the checkout; migrate existing data first.
# Follow docs/DEPLOYMENT_DATA_SAFETY.md, then configure the private environment.
npm start
```

---

## 📂 Documentation Directory

Detailed architectural and compliance documentation is available in `docs/`:

- [Zero Mock Data Audit](docs/NO_MOCK_DATA_AUDIT.md) — Comprehensive verification of clean-slate operations.
- [System Architecture](docs/ARCHITECTURE.md) — Multi-tier architecture, state flow, and data pipelines.
- [API Documentation](docs/API_DOCUMENTATION.md) — Complete specification of all REST endpoints.
- [Database Schema](docs/DATABASE_SCHEMA.md) — Relational & document schema definitions.
- [Production Readiness](docs/PRODUCTION_READINESS.md) — Deployment checklist and security hardening.
- [Hostinger Shared Hosting Guide](HOSTINGER_DEPLOYMENT_GUIDE.md) — Step-by-step cPanel/hPanel deployment.

## Phase 9: customer controls and verification

- Owner: use **Account Security & Staff → Customer Registry & Internal Staff Access** to register a real customer and grant staff visibility. New projects, CRM opportunities, assets, endpoints, ITSM tickets, jobs, AMC contracts and BOM quotations require an existing customer selection. Revocation hides customer-bound records.
- Existing records with no trusted `customerId` are preserved untouched and not silently assigned to customers. Nonowners cannot infer ownership from a display name. Review a read-only report before any manual migration: `node scripts/customer_migration_preflight.mjs --source /absolute/private/app-store.json`. A nonzero exit code indicates missing/orphan mapping or integrity issues. **This command does not migrate or fix any records.**
- Test `npm run smoke:preflight` for fixture-only preflight regressions and `npm run smoke:browser` after installing Playwright Chromium locally; GitHub Actions has separate backend and real Chromium jobs. See [Phase 9 report](docs/PHASE_9_CUSTOMER_ISOLATION_2026-11-11.md).
- This is not customer login, multi-tenant RLS, an external payment workflow or an authorization audit for every historical auxiliary collection. Deployment is blocked until migration, restore and tenant-level isolation acceptance.

**Phase 9 verification:** [GitHub Actions #42902830813](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/42902830813) — 16/16 isolated, 7/7 authentication, 96/96 API, 133/133 role/customer, 9/9 data safety, 5/5 read-only migration preflight, and 7/7 real Chromium role browser checks. This evidence applies only to ephemeral CI fixtures; customer-level database enforcement and actual deployment remain pending.

## Phase 10.1: PostgreSQL staging, not live cutover

A real PostgreSQL 16 schema with tenant/customer composite FKs and forced RLS, read-only `apex_stage_reader`, fail-closed transactional JSON staging importer, and isolated CI acceptance have been added. **The existing Express application continues using JSON**; no customer database has been moved or overwritten.

- [Implementation/runbook and release gates](docs/PHASE_10_POSTGRESQL_STAGING_2026-11-11.md).
- [Schema and policies](migrations/postgres/001_staging_rls.sql).
- `npm run stage:postgres -- --source /absolute/private/snapshot.json` is dry-run by default (no DB connection); see the runbook for explicit local-only staging `--apply`.
- `npm run smoke:postgres` and `npm run smoke:pg:restore` require the isolated PostgreSQL 16 CI fixture/database; normal application operation does not require PostgreSQL.
- **No production cutover approval** until SQL-backed API authentication, every customer/tenant record, audit, data backup and verified restore are end-to-end tested.

**Phase 10.1 isolated CI evidence:** [Push run #42929292843](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/42929292843), [PR run #42929301929](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/42929301929) — PostgreSQL 16 RLS/staging **23/23**, PostgreSQL 16 dump/restore rehearsal **16/16**, TypeScript/build PASS, existing API **96/96**, roles **133/133**, auth **7/7**, other regression **16/16**, data safety **9/9**, preflight **5/5** and Chromium **7/7**. **Not production-ready.**

## Phase 10.2: authenticated PostgreSQL CRUD pilot

- The [Phase 10.2 implementation/report and staging runbook](docs/PHASE_10_2_AUTHENTICATED_PG_PILOT_2026-11-11.md) documents the restricted database writer role and SQL-trigger audit.
- [Migration 002](migrations/postgres/002_staging_authenticated_pilot.sql) enables narrow customer/grant and CRM writes; [server/postgres_pilot.ts](server/postgres_pilot.ts) exposes authenticated, isolated `/api/pg-pilot/*` routes.
- Pilot is OFF by default, refuses production startup, and requires a dedicated local staging PostgreSQL service plus throwaway private JSON authentication fixture. Existing `/api/state` and business routes remain unchanged and JSON-backed.
- Isolated PostgreSQL and real HTTP tests cover RLS, CSRF, role drift, revocation and audit-trigger rollback; **this is not a production data cutover**.

**Phase 10.2 staging reconciliation:** `npm run verify:pg:parity -- --source /absolute/private/staging-snapshot.json` runs read-only JSON-to-PostgreSQL row parity before any pilot mutations; it fails if source SHA or customer/audit payloads differ. This is not a production data synchronization tool. [Verified CI #42997972470](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/42997972470): staging+parity **27/27**, authenticated PostgreSQL HTTP **41/41**, dump/restore **17/17**, existing backend and Chromium suites green.

## Phase 10.3: signed SQL identity and customer-scoped service repositories

- Added [signed context migration 003](migrations/postgres/003_staging_signed_context_domains.sql) and [asset/job custody migration 004](migrations/postgres/004_staging_assets_field_jobs.sql) to the disposable PostgreSQL 16 staging pilot.
- Client-requested identity or SQL session settings cannot impersonate a different tenant/owner without a valid HMAC tied to the current PostgreSQL backend and transaction. Ephemeral secrets are generated in CI, not committed.
- Staging-only API now covers project creation and owner sharing, incident/ticket creation and status, asset registry/manager assignment and field-job dispatch/progress. All changes are subject to signed actor, tenant/customer RLS and SQL-trigger audit; unverified customer completion actions are deliberately unavailable.
- Existing JSON `/api/*` endpoints and app UI are **not** cut over. A staging pilot is not a production integration, provider workflow or source of truth. Read [Phase 10.3 implementation and security report](docs/PHASE_10_3_SIGNED_CONTEXT_DOMAIN_REPOSITORIES_2026-11-11.md).

**Phase 10.3 isolated PostgreSQL CI:** [Push #43042984912](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/43042984912) — staging RLS/import/parity **27/27**, signed actor + SQL domain HTTP **93/93**, restored PostgreSQL security **18/18**. Normal application remains JSON-backed; do not deploy SQL pilot as production.

## Phase 10.4 — strictly unissued commerce pilot

- [PostgreSQL staging migration 005](migrations/postgres/005_staging_commerce_finance_drafts.sql) and [Phase 10.4 implementation/runbook](docs/PHASE_10_4_COMMERCE_DRAFTS_2026-11-11.md).
- Separate authenticated staging `/api/pg-pilot/quotes`, `/proposals`, `/rma`, `/procurement-drafts`, `/finance-previews` routes use real PostgreSQL RLS/foreign keys and same-transaction audit. No invoice is issued and no external payment, tax, purchase order, OEM or provider request is sent.
- Production application and normal `/api/*` routes remain JSON-backed. Do not expose or deploy the staging pilot to live customers.

## Phase 10.5A — safe concurrency and explicit no-cutover gate

- [Migration 006](migrations/postgres/006_staging_idempotent_drafts.sql) adds the **13th FORCE-RLS table** for immutable, actor-scoped request keys.
- Optional `Idempotency-Key` on two staging-only POST endpoints allows safe finance preview/procurement draft replays: first creation 201; identical replay 200 with same resource ID; conflicting reuse 409. New keys and audit rows commit atomically; serialization conflicts retry with new signed transaction context.
- [Read-only cutover assessment](scripts/postgres/cutover_readiness_gate.mjs) (`npm run assess:pg:cutover`) verifies local PostgreSQL safeguards and **always reports BLOCKED** pending production identity, customer migration, full SQL parity, provider acceptance and recovery gates. Exit 3 is expected and means no deployment authorization.
- [Phase 10.5A implementation, CI and limitations](docs/PHASE_10_5_TRANSACTION_RETRIES_CUTOVER_GATE_2026-11-12.md). The normal app and `main` remain unchanged.

## Phase 10.5B — normalized PostgreSQL service work orders (verified staging only)

- [Migration 007](migrations/postgres/007_staging_normalized_service_orders.sql): normalized, customer-scoped work orders and append-only transitions, SQL-owned optimistic revision, manager-only assignment, real customer-grant revocation, sequential internal states, FORCE RLS and same-transaction audit.
- [Two independent server process test](tests/postgres/multi_instance_workorders.mjs): **26/26** real HTTP tests; a race on one expected version succeeds once and rejects the competing update with HTTP 409, with no duplicate SQL history or audit.
- [Full Phase 10.5B implementation and CI report](docs/PHASE_10_5B_NORMALIZED_SERVICE_MULTI_INSTANCE_2026-11-12.md). Verified [Push CI #43102224573](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/43102224573) and [PR CI #43102234533](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/43102234533), both SUCCESS (PG stage 27, HTTP 155, multi-instance 26, cutover 8, restore 29). Production JSON and external provider workflows remain unchanged.

## Phase 10.5C — safe shadow comparison, historical reconciliation and inert SQL outbox

- [Actual JSON HTTP ↔ PostgreSQL RLS shadow comparator](scripts/postgres/shadow_route_parity.mjs): 18 authenticated read-only route/role checks on disposable snapshots, source SHA provenance, no business writes, intentional SQL tamper negative test.
- [Historical per-customer reconciliation manifest](scripts/postgres/customer_reconciliation_manifest.mjs): tenant/customer/grants/record canonical SHA comparison, including linked proposals/RMA; owner-only legacy collections remain **unmapped and blocked for production**.
- [Migration 008 transactional outbox](migrations/postgres/008_staging_shadow_outbox.sql): FORCE RLS, one pending event per committed normalized work-order revision, trigger-atomic with history/audit. **No dispatcher, no enabled delivery, no external effects.** 16 FORCE-RLS staging tables total.
- [Phase 10.5C verified baseline, test matrix and production blockers](docs/PHASE_10_5C_SHADOW_OUTBOX_RECONCILIATION_2026-11-12.md). The existing normal JSON API, customer data and `main` remain unchanged.

## Phase 10.5D — audited nonproduction repository adapter, cross-module graph, no-send outbox plan

- [Typed read-only PostgreSQL repository](server/staging_read_repository.ts) behind `APEX_PG_REPOSITORY_SHADOW_READS=true` **and** the existing isolated signed `NODE_ENV=staging` SQL pilot. Owner-only `/api/pg-pilot/repository-shadow` compares **five** JSON-primary domain projections against RLS-scoped PostgreSQL in an explicitly `READ ONLY` transaction. It exposes only counts/match flags, not data or hashes; never changes normal `/api/*`.
- [Cross-module reconciliation](scripts/postgres/customer_reconciliation_manifest.mjs) verifies source project→proposal and asset→RMA parent links, assigned engineer/reporter/creator custody and project collaborator/customer grants; test denies cross-customer FK swap and detects source→SQL share drift. Historical owner-only financial/inventory records remain **unmapped**.
- [Outbox design-only preflight](scripts/postgres/outbox_dispatch_plan.mjs) is **read only** and always exits `3` (`BLOCKED`) on healthy staging. No dispatcher/worker/provider API is configured. [Future delivery design approval gates](docs/OUTBOX_DISPATCH_PREAPPROVAL_DESIGN_2026-11-12.md) are intentionally NOT implemented.
- Code CI [Push #43180700209](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/43180700209) and [PR #43180707071](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/43180707071) both green: staging **35/35**, pilot HTTP **160/160**, two-process **33/33**, outbox design **8/8**, cutover safety **8/8**, PostgreSQL restore **30/30**, backend + Chromium PASS. [Full implementation report](docs/PHASE_10_5D_REPOSITORY_CROSSMODULE_DISPATCH_DESIGN_2026-11-12.md).


## Phase 10.5E — staged CRM read-through canary (NOT a production cutover)

The normal `GET /api/crm` remains JSON-only by default. **Only** an isolated
`NODE_ENV=staging` signed PostgreSQL pilot may enable
`APEX_PG_CRM_READ_THROUGH=true`, with a mandatory named
`APEX_PG_CRM_CANARY_STAFF_IDS=staff-id-1,staff-id-2` allowlist. The existing
cookie, role, customer visibility and PostgreSQL signed RLS checks must ALL
pass. Each canary read must match the full actor-visible JSON CRM collection
after canonical comparison; any SQL/JSON grant or payload drift returns 409
**without returning records**, and SQL failure returns 503. A verified response
has the unchanged `{success:true,data:[...]}` JSON shape and
`X-Apex-CRM-Read: postgres-parity-verified` marker; non-canary sessions
continue to use the JSON implementation. This diagnostic is not safe to enable
in production, including Hostinger.

Run `npm run smoke:pg:crm-tenants` with disposable signed PostgreSQL 16
and the existing isolated CI pilot environment; it verifies independent tenant
sessions, colliding record IDs, SQL/JSON grant revocation drift, tampered SQL
payloads, blocked unsigned SQL identity, no read-generated audit writes and
unchanged JSON routing outside the allowlist. See
[Phase 10.5E implementation and customer migration acceptance criteria](docs/PHASE_10_5E_CRM_CANARY_MIGRATION_ACCEPTANCE_2026-11-12.md).
The real production migration, historical customer ownership approval,
transactional all-module SQL runtime, live provider dispatch and deployment
remain **BLOCKED**. Keep Draft PR #1 unmerged.

**Phase 10.5E integrated code CI:** [push #43215153638](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/43215153638) and [PR #43215162295](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/43215162295) both succeeded on SHA `e0d69cc`, with 18/18 independent tenant canary assertions. Final docs-only commit requires separate CI confirmation. Production cutover remains BLOCKED.


## Phase 10.5F — owner-only customer mapping review and independent recovery evidence

An *isolated, read-only* historical review command is available only for
private absolute-path snapshots already imported into a disposable local
PostgreSQL 16 stage: `npm run verify:pg:owner-review -- --source /private/snapshot.json --review /private/review.json`.
Every owner-only record must have exactly one reviewed **proposal** bound to
the immutable source SHA and staging SQL import; two distinct claimed reviewer
references are checked for format but **not cryptographically verified**.
No customer grant or ownership transfer is applied, and a valid report always
states `externalSignatureVerified:false` and `productionCutoverReady:false`.

The staging CI now additionally executes `npm run smoke:pg:tenant-matrix`
(two independent tenants; colliding IDs; signed role/customer/assignment RLS
across six domains) and an independent full PostgreSQL restore-evidence
comparison via `npm run assess:pg:rehearsal`. It purposely corrupts only
a disposable restore clone, demands mismatch detection, destroys/recreates
the clone from the original SHA256-verified archive, and repeats all
restore/RLS checks. The production/Hostinger DB is never used.
See [Phase 10.5F report and migration review gates](docs/PHASE_10_5F_HISTORICAL_OWNERSHIP_RECOVERY_2026-11-12.md).

**Phase 10.5F verified code:** [Push #43228070837](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/43228070837) and [Draft PR #43228083159](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/43228083159) both green at `2a20b094`. New RLS matrix 79/79, legacy review and staging 41/41, and isolated restore-corrupt-restore acceptance passed. **Human mapping sign-offs and live migration remain pending**.

## Phase 10.5G — independently signed reviewer evidence and business API authorization inventory

A separate, read-only **offline review verifier** accepts immutable private
source/review/restore evidence, an explicit RPO/RTO/write-freeze/rollback plan,
an externally pinned public-key registry and a four-step Ed25519 signature
hash chain for data custodian, security/privacy reviewer, DBA restore reviewer
and release manager. `npm run assess:review-signoff -- --source /private/source.json --review /private/review.json --trust /private/trust.json --signoffs /private/signoffs.json --plan /private/plan.json --evidence /private/evidence.json`
requires `APEX_REVIEW_STAGING_ACK=OFFLINE_ONLY_NEVER_CUTOVER` and
`APEX_REVIEW_TRUST_SHA256=<sha256-from-independent-custody>`.
**A cryptographically valid bundle still returns exit code 3 (BLOCKED)**:
private keys are never stored in the repository, no real-world identity
certification or authorization can be inferred from self-generated test keys,
and no migration is executed. Synthetic negative-control tests cover trust
substitution, signature tampering, role confusion, missing customer decisions,
RPO/RTO failures, expired attestations, and replay/mismatched evidence.

`npm run smoke:api-matrix` inventories every registered normal and
PostgreSQL-pilot business route via a TypeScript syntax-tree scan, requires
authenticated entry for each nonpublic route and exercises anonymous denial
and wrong-role denial for **all** normal business APIs. The pilot HTTP suite
also checks every registered staging route without a session. These are
**authentication and route-level RBAC** checks, not proof of full object/tenant
authorization across all JSON business operations. Existing BOLA and
PostgreSQL two-tenant suites remain required.

Full details: [Phase 10.5G audited reviewer preflight and operator objectives](docs/PHASE_10_5G_REVIEW_AUTHORIZATION_REHEARSAL_2026-11-12.md).
No new business endpoint is switched to SQL. Production remains BLOCKED.

**Phase 10.5G implementation CI:** Both [Push #43253492203](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/43253492203) and [Draft PR #43253506158](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/43253506158) passed on code SHA `3b7d56c`. The new suite tests 95 main/39 pilot route declarations, 90 anonymous and 84 wrong-role HTTP denials, plus 21/21 offline review-signoff cases. Full object-level, production identity and operational recovery acceptance remain BLOCKED.


## Phase 10.5H — independent identity-issuer claims, object authorization and measured recovery

The offline identity-custody verifier requires **two independent Ed25519 issuer
keys** (personnel + security) whose public-key registry SHA256 is pinned
out-of-band, a recent dual-signed key-revocation snapshot, four signed
reviewer-role/subject/key-binding claims, and eight dual-signed, SHA256-linked
restricted custody receipts for source, ownership review, reviewer registry,
sign-offs, rehearsal plan, PostgreSQL restore evidence, identity claims, and
revocation status. Run `npm run assess:identity-custody` only against separately
supplied private absolute-path files with
`APEX_REVIEW_IDENTITY_ACK=OFFLINE_CUSTODY_ONLY_NO_CUTOVER`,
`APEX_REVIEW_IDENTITY_ROOT_SHA256` and `APEX_REVIEW_TRUST_SHA256`.
Even valid claims return **exit 3 / production BLOCKED**: the tool cannot
validate the truth of external HR identity records or corporate authorization.
It has no identity-issuance, migration, KMS or deployment action.

`npm run smoke:object-isolation` tests real JSON business HTTP objects
across **11 customer-scoped collections**, unauthorized creates and edits,
owner assignment to an inaccessible customer, forged tenancy headers and
immediate grant revocation. All dynamic object APIs must be classified as
tested or explicitly excluded as owner-only/legacy/global. This extends
object-level testing but does **not** prove all owner-only legacy operations
or production multi-tenant JSON security.

`npm run assess:pg:measured-recovery` compares CI-captured actual
archive/restore/corruption-detection/rollback timestamps with a bounded,
operator-supplied recovery budget and immutable digest of the original
PostgreSQL archive plus verified restore evidence. RPO here is a **frozen
synthetic snapshot-age surrogate**, not measured customer transaction loss.
No externally authorized operator approval or real-world RPO/RTO is certified.
The verifier refuses non-disposable DB settings, cannot restore anything
and returns **exit 3 (BLOCKED)** even on valid timings. For exact gates and
remaining manual approvals, read [Phase 10.5H report](docs/PHASE_10_5H_IDENTITY_CUSTODY_OBJECT_AUTH_RECOVERY_2026-11-12.md).
