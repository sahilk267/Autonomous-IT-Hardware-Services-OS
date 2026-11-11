# Apex Autonomous IT Hardware & Services Operating System

Apex is a Node.js/React IT hardware and services platform intended for enterprise use. **Current deployment model supports one organization per running instance.** Stage 2 adds an opt-in real PostgreSQL tenant-scoped runtime, with database membership authentication, revocable hashed sessions and PostgreSQL transactions. Business records still use a tenant-owned JSONB compatibility snapshot; normalized multi-tenant production design remains incomplete. Public multi-tenant production deployment is **not approved**.

---

## ⚡ Key Architectural Capabilities

1. **Strict Zero Mock Data Guarantee**:
   - Zero hardcoded metrics, zero fake transaction records, and zero simulated telemetry.
   - Initial application startup boots with a clean slate (0 business records across all 12 modules).
   - Legacy `single` mode uses private JSON persistence; opt-in `postgres` mode uses RLS-protected, transactionally updated tenant-owned JSONB workspace records. Backups remain an operator responsibility.

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
   - One running instance per provisioned tenant, exact HTTPS `APP_URL`, and strict write-origin validation. JSON mode requires private `APEX_DATA_DIR`; PostgreSQL mode requires runtime-only `DATABASE_URL` and `APEX_TENANT_ID`.
   - Bundled CommonJS server (`dist/server.cjs`) supporting dynamic port binding (`PORT = Number(process.env.PORT) || 3000`).
   - See [Phase L Stage 2 runtime guide](docs/PHASE_L_STAGE2_POSTGRES_RUNTIME.md) and its open release gates before any external deployment.

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
| `APEX_TENANT_ID` | Pre-provisioned tenant UUID for `postgres` mode | Tenant isolation |
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

### 4. Run Automated System & Zero Mock Data Tests
```bash
npm test
```

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
- [Phase L Stage 2 PostgreSQL Runtime](docs/PHASE_L_STAGE2_POSTGRES_RUNTIME.md) — Backend connection, provisioning, safe import and open release gates.
- [Hostinger Shared Hosting Guide](HOSTINGER_DEPLOYMENT_GUIDE.md) — Step-by-step cPanel/hPanel deployment.
