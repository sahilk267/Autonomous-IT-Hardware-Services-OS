# Apex Autonomous IT Hardware & Services Operating System

> **Current status (2026-11-11): Phase 10.2 authenticated PostgreSQL staging CRUD pilot is implemented and CI-verified, NOT production-certified.** Main application remains single-tenant JSON-backed. The opt-in staging-only SQL pilot supports owner customer/grants and CRM writes with transaction-atomic audit; full SQL migration, enterprise tenancy, Hostinger deployment and external provider acceptance remain pending. See [Phase 10.2 report](docs/PHASE_10_2_AUTHENTICATED_PG_PILOT_2026-11-11.md).

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
