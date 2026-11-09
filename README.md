# Apex Autonomous IT Hardware & Services Operating System

> **Current status (2026-11-10): Phases 1–7 have CI-verified increments; Phase 8 staff-level object controls are in implementation on a draft development branch, NOT production-certified.** Single-tenant JSON store only. Genuine multi-tenancy, verified provider adapters, Hostinger migration, production CSRF threat review, browser E2E tests, MFA and scalable durable storage are **pending**. See [implementation tracker](docs/IMPLEMENTATION_TRACKER.md), [Phase 4 report](docs/PHASE_4_IMPLEMENTATION_2026-11-08.md) [Phase 5 security report](docs/PHASE_5_IMPLEMENTATION_2026-11-09.md), [Phase 6 integrity report](docs/PHASE_6_IMPLEMENTATION_2026-11-10.md) and [private data migration instructions](docs/DEPLOYMENT_DATA_SAFETY.md). CI is isolated; passing tests is not a third-party integration acceptance.

Apex is an **evolving single-tenant prototype** for IT hardware distributors, system integrators and managed service providers. It is not yet a certified multi-tenant enterprise operating system.

---

## ⚡ Key Architectural Capabilities

1. **Strict Zero Mock Data Guarantee**:
   - Clean initial business records and no fabricated live provider confirmations. Some legacy UI samples/provider claims remain under review; source test fixtures are isolated.
   - A fresh development install can start empty; any existing deployed customer store must be preserved during upgrades.
   - Single-process atomic JSON file commits; no automatic pre-mutation backups. Operator-only offline backups via `npm run backup:data` (service must be stopped).

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
