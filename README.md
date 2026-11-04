# Apex Autonomous IT Hardware & Services Operating System

Apex is a production-grade, multi-tenant enterprise operating system built for IT hardware distributors, system integrators, managed service providers (MSPs), and IT field service organizations.

---

## ⚡ Key Architectural Capabilities

1. **Strict Zero Mock Data Guarantee**:
   - Zero hardcoded metrics, zero fake transaction records, and zero simulated telemetry.
   - Initial application startup boots with a clean slate (0 business records across all 12 modules).
   - Real atomic filesystem persistence (`data/app-store.json`) with automated pre-mutation backups (`data/app-store.backup.json`).

2. **Autonomous IT Operations & Workflows**:
   - **Executive CIO Hub**: Dynamic metrics calculated on real catalog, procurement, and active ledger balances.
   - **ITSM Helpdesk & CMDB**: Autonomous IT ticket lifecycle, hardware asset topology, and endpoint monitoring.
   - **Procurement & RFQ Engine**: Multi-distributor quotation bidding, automated margin scoring, and purchase order dispatch.
   - **BOM Builder**: Intelligent AI-assisted bill-of-materials sizing powered by Gemini AI.
   - **Field Service & Dispatch**: GPS-tagged engineer dispatch, job status workflows, and atomic inventory spare-part consumption.
   - **Asset & AMC Manager**: Contract tracking, SLA threshold calculation, and automated preventative maintenance alerts.
   - **Finance & GST Compliance**: Indian GST tax calculation (CGST/SGST/IGST), e-invoicing ledger, and receivable settlement.
   - **Telegram Owner Hub**: Real mobile notification channel for quotation margin approvals and system status.
   - **Immutable Audit Bus**: Real-time event bus capturing all administrative, inventory, and financial state transitions.

3. **Enterprise Integration Connectors**:
   - Integrations explicitly reflect their operational connection status: `NOT_CONFIGURED` or `CONFIGURED`.
   - Google Gemini AI (`@google/genai` TypeScript SDK) for real AI processing.
   - Unconfigured payment/tax gateways return honest HTTP 503 status codes rather than fabricated transaction IDs.

4. **Production Deployment Ready**:
   - Optimized for single-instance or shared cPanel/hPanel hosting (including Hostinger Node.js Application Manager).
   - Bundled CommonJS server (`dist/server.cjs`) supporting dynamic port binding (`PORT = Number(process.env.PORT) || 3000`).

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

### 5. Production Build
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
- [Production Readiness](docs/PRODUCTION_READINESS.md) — Deployment checklist and security hardening.
- [Hostinger Shared Hosting Guide](HOSTINGER_DEPLOYMENT_GUIDE.md) — Step-by-step cPanel/hPanel deployment.
