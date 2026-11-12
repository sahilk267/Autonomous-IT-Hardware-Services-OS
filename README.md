# Apex Autonomous IT Hardware & Services Operating System

Apex is a Node.js/React IT hardware and services platform intended for enterprise use. **Phase M adds optional dynamic PostgreSQL workspace selection inside one Node process, with individually authenticated workspace sessions and RLS isolation.** Stage 2 added an opt-in RLS-scoped PostgreSQL runtime with membership authentication and hashed revocable sessions. **Stage 3 now stores products, stock movements, quotations, invoices and immutable settlement proofs in normalized PostgreSQL tables**. Remaining noncritical modules retain a tenant-owned JSONB workspace for compatibility. Cross-workspace SSO, membership discovery and tenant-specific background jobs are still pending. Public multi-tenant production deployment is **not approved**.

---

## ⚡ Key Architectural Capabilities

1. **Strict Zero Mock Data Guarantee**:
   - Zero hardcoded metrics, zero fake transaction records, and zero simulated telemetry.
   - Initial application startup boots with a clean slate (0 business records across all 12 modules).
   - Legacy `single` mode uses private JSON persistence. Opt-in `postgres` mode uses RLS-protected normalized finance/inventory ledgers plus a tenant-owned JSONB workspace for other modules. Backups remain an operator responsibility.

2. **Autonomous IT Operations & Workflows**:
   - **Executive CIO Hub**: Dynamic metrics calculated on real catalog, procurement, and active ledger balances.
   - **ITSM Helpdesk & CMDB**: Autonomous IT ticket lifecycle, hardware asset topology, and endpoint monitoring.
   - **Procurement & RFQ Engine**: Multi-distributor quotation bidding, automated margin scoring, and purchase order dispatch.
   - **BOM Builder**: Intelligent AI-assisted bill-of-materials sizing powered by Gemini AI.
   - **Field Service & Dispatch**: GPS-tagged engineer dispatch, job status workflows, and atomic inventory spare-part consumption.
   - **Asset & AMC Manager**: Contract tracking, SLA threshold calculation, and automated preventative maintenance alerts.
   - **Finance & GST Compliance**: Indian GST tax calculation (CGST/SGST/IGST), e-invoicing ledger, and receivable settlement.
   - **Telegram Owner Hub**: Real mobile notification channel for quotation margin approvals and system status.
   - **Server-side audit events**: Operational event log for state changes. A tamper-proof append-only database audit system remains a migration requirement.

3. **Enterprise Integration Connectors**:
   - Integrations explicitly reflect their operational connection status: `NOT_CONFIGURED` or `CONFIGURED`.
   - Google Gemini AI (`@google/genai` TypeScript SDK) for real AI processing.
   - Unconfigured payment/tax gateways return honest HTTP 503 status codes rather than fabricated transaction IDs.

4. **Single-tenant pilot deployment constraints**:
   - Fixed tenant or dynamic authenticated workspace selection on PostgreSQL; exact HTTPS `APP_URL` and strict write-origin validation for hosted sites. JSON mode requires private `APEX_DATA_DIR`; fixed PostgreSQL requires runtime-only `DATABASE_URL` and `APEX_TENANT_ID`, while dynamic mode has no configured tenant UUID.
   - Bundled CommonJS server (`dist/server.cjs`) supporting dynamic port binding (`PORT = Number(process.env.PORT) || 3000`).
   - See [Phase M Windows + Hostinger deployment readiness](docs/PHASE_M_RELEASE_READINESS.md) for installer, private setup, PostgreSQL restore, and **required release gates**.

---

## 🖥 Windows installer: configure server AFTER deployment

The **same Windows .exe** can be installed before your Hostinger, VPS, domain or database provider is selected. The default first-run option is now **Connect to hosted server**; leave its URL empty and choose **Save server details for later**. When the backend is deployed, open **Server → Configure / Change Server**, enter its **public HTTPS origin** (e.g. `https://app.yourcompany.com`) and choose **Verify HTTPS & connect**. The desktop validates the new `/api/desktop/handshake`, database health and authentication status, then loads the remote UI in an unprivileged Electron window. No server credential, database URL or private API key is built into the installer.

**Hosted employee PCs do not require direct PostgreSQL or integration secrets.** Those stay on the deployed backend, while the desktop uses same-origin HTTPS with the server's secure login/session cookies. Switching domains requires explicit acknowledgement and does not migrate records. The earlier Local JSON and Local PostgreSQL options remain for advanced offline/operator deployments only.

- [Hosted desktop connectivity and release runbook](docs/PHASE_M_HOSTED_DESKTOP_CONNECTION.md)
- [Deployment-time environment check](scripts/validate-hosted-deployment.mjs) — run `npm run check:hosting` on the server after setting private env vars
- [Hostinger HTTPS acceptance probe](scripts/hostinger-acceptance.mjs) — run only after a real staging domain is live

**Disclaimer:** A successful Windows installer build proves packaging, not a live Hostinger connection or interactive install test. Production approval is pending real deployment, TLS, code signing, and recovery tests.

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
| `APP_URL` | Exact public origin; **HTTPS in production** | CSRF/origin enforcement |
| `APEX_ALLOWED_ORIGINS` | Optional list of explicit permitted public HTTPS origins | Multi-domain deployments |
| `APEX_STORAGE_MODE` | `single` (private JSON) or `postgres` (RLS database) | Storage runtime |
| `DATABASE_URL` | Limited runtime-role PostgreSQL connection, only for `postgres` mode | Database |
| `APEX_TENANT_MODE` | `fixed` (default) or `dynamic` for interactive workspace selection | PostgreSQL sessions |
| `APEX_TENANT_ID` | Pre-provisioned tenant UUID for `fixed` PostgreSQL; must be empty in dynamic mode | Tenant isolation |
| `APEX_DATA_DIR` | Absolute private durable directory, required for production **JSON** mode | Data retention and safety |
| `APEX_SETUP_TOKEN` | Server-side random 32+ character token for initial admin enrollment | First-run security |
| `GEMINI_API_KEY` | Google Gemini API Key | BOM Builder, Ticket Diagnosis, Copilot |
| `GEMINI_MODEL` | Gemini Model Alias (Default: `gemini-2.5-flash`) | Gemini API calls |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot Token from BotFather | Mobile Telegram Approvals |
| `RAZORPAY_KEY_ID` | Razorpay API Key ID | Payment Link Generation |
| `GST_API_KEY` | Indian GST E-Invoicing API Key | E-Invoice NIC IRN Signing |

### 3. Run Development Server
```bash
npm run dev
```
The server will start on `http://localhost:3000`.

### 4. Run Automated Tests
```bash
npm test
# Only with a disposable local PostgreSQL 16 database:
# PG_TEST_URL=postgresql://...@127.0.0.1:5432/apex_phase_l_ci
npm run test:postgres
npm run test:stage2
npm run test:stage3
```

**Warning:** PostgreSQL integration tests create disposable databases and roles. Never point them at a production PostgreSQL server.

### 5. Build (not a production acceptance signoff)
```bash
npm run build
npm start
```

---

## 📂 Documentation Directory

Detailed architectural and compliance documentation is available in `docs/`:

- [Zero Mock Data Audit](docs/NO_MOCK_DATA_AUDIT.md) — Comprehensive verification of clean-slate operations.
- [System Architecture](docs/ARCHITECTURE.md) — Multi-tier architecture, state flow, and data pipelines.
- [API Documentation](docs/API_DOCUMENTATION.md) — Complete specification of all REST endpoints.
- [Database Schema](docs/DATABASE_SCHEMA.md) — Relational & document schema definitions.
- [Production Readiness](docs/PRODUCTION_READINESS.md) — Historical deployment checklist; validate with Phase K/L gates.
- [Phase K Security Audit](docs/PHASE_K_SECURITY_AUDIT.md) — High-risk fixes and remaining blockers.
- [Phase L Tenancy & Migration](docs/PHASE_L_TENANCY_AND_MIGRATION.md) — Legacy JSON and PostgreSQL RLS baseline.
- [Phase L Stage 2 PostgreSQL Runtime](docs/PHASE_L_STAGE2_POSTGRES_RUNTIME.md) — Historical Stage 2 runtime/migration baseline.
- [Phase L Stage 3 Database Hardening](docs/PHASE_L_STAGE3_DATABASE_HARDENING.md) — Normalized finance/inventory, required backfill, reconciliation and release gates.
- [Phase M Deployment Readiness](docs/PHASE_M_RELEASE_READINESS.md) — Windows NSIS preview installer, editable setup wizard, dynamic workspace login, pg_dump/pg_restore rehearsal and Hostinger staging acceptance.
- [Hostinger Shared Hosting Guide](HOSTINGER_DEPLOYMENT_GUIDE.md) — Step-by-step cPanel/hPanel deployment.
