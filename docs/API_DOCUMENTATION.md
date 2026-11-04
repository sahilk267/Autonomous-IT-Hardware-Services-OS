# REST API Documentation & Specification

**Application**: Apex Autonomous IT Hardware & Services Operating System  
**Base URL**: `/api`  
**Content-Type**: `application/json`

---

## 1. System & State Endpoints

### `GET /api/state`
Returns the complete operational state of the tenant.
- **Response**: `200 OK`
  ```json
  {
    "tenant": { "id": "tenant-1", "name": "...", "gstin": "...", "isConfigured": false },
    "users": [],
    "products": [],
    "leads": [],
    "quotes": [],
    "tickets": [],
    "endpoints": [],
    "jobs": [],
    "assets": [],
    "licenses": [],
    "amcs": [],
    "projects": [],
    "proposals": [],
    "invoices": [],
    "rfqs": [],
    "events": [],
    "connectors": []
  }
  ```

### `POST /api/state/reset`
Wipes business records and restores the clean-slate zero-record baseline.
- **Payload**: `{ "mode": "CLEAN_SLATE" }`
- **Response**: `200 OK` with reset database state.

---

## 2. Organization & Tenant Profile

### `GET /api/tenant`
Returns the organization's business and legal identity.
- **Response**: `200 OK`

### `POST /api/tenant`
Updates company details (legal name, GSTIN, PAN, state, contact).
- **Payload**:
  ```json
  {
    "name": "Acme Technologies Private Limited",
    "gstin": "27AAACA1234A1Z5",
    "pan": "AAACA1234A",
    "state": "Maharashtra (27)",
    "address": "Bandra Kurla Complex, Mumbai",
    "contactEmail": "finance@acme.com",
    "contactPhone": "+91 98200 12345"
  }
  ```
- **Response**: `200 OK` with updated tenant profile.

---

## 3. Inventory & Procurement

### `POST /api/products`
Creates a new SKU in the warehouse catalog.
- **Payload**: `ProductItem` object.
- **Response**: `201 Created`

### `DELETE /api/products/:id`
Removes an inventory SKU.
- **Response**: `200 OK`

### `POST /api/rfqs`
Submits a Request for Quotation to distributors.
- **Payload**: `RFQItem` object.
- **Response**: `201 Created`

### `POST /api/rfqs/:id/supplier-quotes`
Appends a genuine vendor quotation to an open RFQ.
- **Response**: `200 OK`

### `POST /api/rfqs/:id/dispatch-po`
Selects the winning supplier bid and dispatches an official Purchase Order.
- **Response**: `200 OK`

---

## 4. Field Service & Inventory Balancing

### `POST /api/jobs`
Creates a dispatched field engineer ticket.
- **Payload**: `FieldJob` object.
- **Response**: `201 Created`

### `POST /api/jobs/:id/consume-part`
Consumes an inventory part on a field service job. Automatically updates catalog stock and writes audit log.
- **Payload**:
  ```json
  {
    "partName": "16GB DDR5 Server DIMM",
    "cost": 4200
  }
  ```
- **Response**: `200 OK` with updated `FieldJob`.

---

## 5. Invoicing & GST Settlement

### `POST /api/invoices`
Records a newly generated tax invoice.
- **Payload**: `InvoiceRecord` object.
- **Response**: `201 Created`

### `POST /api/invoices/:invoiceNo/settle`
Marks an outstanding invoice as `SETTLED`. Excludes it from overdue receivables and balances cash flow.
- **Response**: `200 OK`

---

## 6. Projects & Marketplace

### `POST /api/projects`
Creates an enterprise milestone project.
- **Payload**: `Project` object.
- **Response**: `201 Created`

### `POST /api/proposals`
Submits a service provider commercial bid.
- **Payload**: `Proposal` object.
- **Response**: `201 Created`

---

## 7. Intelligent AI Endpoints (Google Gemini)

### `POST /api/ai/bom-builder`
Generates optimized Bill-of-Materials hardware sizing.
- **Payload**: `{ "prompt": "40 CAD engineering workstations with dual GPUs" }`
- **Response**: `200 OK` with structured items, costs, and margins. Returns `503` if `GEMINI_API_KEY` is not configured.

### `POST /api/ai/copilot`
Queries live business metrics and ledger data using natural language.
- **Payload**: `{ "question": "What is our current active inventory valuation?" }`
- **Response**: `200 OK` with answer grounded in real database records.

### `POST /api/ai/diagnosis`
Analyzes IT hardware faults and suggests resolution procedures.
- **Payload**: `{ "ticketTitle": "...", "description": "..." }`
- **Response**: `200 OK` with root cause and recommended parts.

---

## 8. External Payment & Government Gateways

### `POST /api/payments/create-order`
Initiates a UPI/Card payment link via Razorpay.
- **Response**:
  - `503 Service Unavailable` if `RAZORPAY_KEY_ID` is unconfigured.
  - `200 OK` with payment gateway order payload when configured.

### `POST /api/gst/generate-irn`
Transmits invoice data to Indian NIC E-Invoice Portal for cryptographic signature.
- **Response**:
  - `503 Service Unavailable` if `GST_API_KEY` is unconfigured.
  - `200 OK` with authenticated IRN and signed QR code when configured.
