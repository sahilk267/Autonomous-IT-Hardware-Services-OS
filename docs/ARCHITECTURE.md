# System Architecture Specification (JSON Runtime)

> **Security and deployment status:** This architecture is an interim single-tenant Node/React application. PostgreSQL multi-tenancy, transactional audit records and actual production acceptance remain incomplete. See [Phase L migration/readiness](PHASE_L_TENANCY_AND_MIGRATION.md).

**Application**: Apex Autonomous IT Hardware & Services Operating System  
**Version**: 1.0.0 (single-tenant JSON; not a production certification)  
**Target Environment**: Node.js 22.x (CI validated), Express, React 19, Tailwind CSS v4

---

## 1. High-Level Architecture Overview

Apex operates on a unified, high-performance architecture optimized for enterprise reliability and lean infrastructure deployment.

```
+-----------------------------------------------------------------------------------+
|                              Client Layer (React 19 SPA)                          |
|  - Executive CIO Hub          - ITSM Desk & CMDB        - Field Service Dispatch  |
|  - BOM Builder Canvas         - Inventory & RFQ         - Asset & AMC Contracts   |
|  - Finance & Indian GST       - Telegram Approval Hub   - Immutable Event Bus     |
+-----------------------------------------------------------------------------------+
                                      │  REST API / JSON
                                      ▼
+-----------------------------------------------------------------------------------+
|                        Server Layer (Node.js 20 + Express)                         |
|  - Dynamic Port Resolver: PORT = Number(process.env.PORT) || 3000                 |
|  - Real Google Gemini AI Router (@google/genai SDK)                               |
|  - Transaction Orchestrator & Inventory Balancer                                  |
|  - Tenant Profile & Role Management                                               |
|  - Honest Integration Gateway Handlers (503 on unconfigured keys)                 |
+-----------------------------------------------------------------------------------+
                                      │  Atomic I/O
                                      ▼
+-----------------------------------------------------------------------------------+
|                           Persistence Engine (server/db.ts)                       |
|  - Primary Store: data/app-store.json                                             |
|  - Atomic Flush: Writes to .tmp.${timestamp} before atomic rename                 |
|  - Pre-mutation Automated Backup: data/app-store.backup.json                      |
|  - Inventory Double-Entry Ledger: data/inventoryTransactions                      |
+-----------------------------------------------------------------------------------+
```

---

## 2. Component Subsystems

### 2.1 Persistence Subsystem (`server/db.ts`)
- **Single Source of Truth**: `PersistentStore` holds memory-cached state synchronized with disk.
- **ACID-Emulated Write Safety**: State writes use temporary file allocation followed by POSIX atomic renames (`fs.renameSync`).
- **Data Integrity**: Automatically takes a JSON snapshot backup before performing migrations or updates.

### 2.2 Artificial Intelligence Subsystem (`server.ts` & `@google/genai`)
- Uses Google's official `@google/genai` TypeScript SDK.
- Configurable model parameter via `GEMINI_MODEL` (defaults to `gemini-2.5-flash`).
- **Endpoints**:
  - `POST /api/ai/bom-builder`: Generates structured, priced hardware Bill-of-Materials based on customer workload requirements.
  - `POST /api/ai/copilot`: Natural language executive query engine answering questions based on actual database inventory, revenue, and ticket load.
  - `POST /api/ai/diagnosis`: Real-time hardware fault analysis returning root cause analysis and replacement parts.
  - `POST /api/ai/telegram-command`: Mobile chat parser converting messages into actions.
- **Fail-Safe Integrity**: When `GEMINI_API_KEY` is not present, returns explicit HTTP 503 error stating AI service requires an API key.

### 2.3 Double-Entry Inventory & Field Service Subsystem
- When field technicians replace parts on an assigned field job (`POST /api/jobs/:id/consume-part`), the system:
  1. Locates matching warehouse SKU in `state.products`.
  2. Verifies available stock (`stockAvailable > 0`).
  3. Decrements inventory quantity atomically.
  4. Records an immutable audit log entry in `state.inventoryTransactions` with before/after counts and job reference.

### 2.4 Indian GST E-Invoicing & Financial Ledger Subsystem
- Complies with Indian GST rules:
  - Supports CGST + SGST (Intra-state, 9% + 9%) and IGST (Inter-state, 18%).
  - Receivables are strictly filtered by active, non-settled invoices.
  - Settle action (`POST /api/invoices/:invoiceNo/settle`) marks the invoice `SETTLED`, immediately updating 30-day cash flow projections and removing it from outstanding receivables.

---

## 3. Hostinger & Cloud Deployment Strategy

Apex is designed to run in both cloud containerized environments (Google Cloud Run, AWS ECS) and shared Linux hosting (Hostinger Business Web Hosting, cPanel, Plesk):

- **Dynamic Port Binding**: `PORT = Number(process.env.PORT) || 3000` allows the server to bind to arbitrary ports assigned by shared hosting managers.
- **Single-Bundle Output**: `esbuild` compiles `server.ts` into a self-contained CommonJS file `dist/server.cjs`.
- **Client Routing Preservation**: `public/.htaccess` includes RewriteRules that route all SPA URL paths to `index.html` preventing 404 errors on browser page reloads.
