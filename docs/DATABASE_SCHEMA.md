# Database Schema Specification

**Application**: Apex Autonomous IT Hardware & Services Operating System  
**Storage Engine**: Atomic JSON Persistent Store (`data/app-store.json`)  
**Schema Definition**: TypeScript strict interfaces (`src/types.ts` & `server/db.ts`)

---

## 1. Schema Overview

The database uses a schema-enforced, single-tenant/multi-tenant capable model structured around 22 primary collections:

```
AppStoreState
├── tenant: TenantInfo
├── users: UserAccount[]
├── products: ProductItem[]
├── leads: Lead[]
├── quotes: Quotation[]
├── telegramMessages: TelegramMessage[]
├── suppliers: SupplierInfo[]
├── rfqs: RFQItem[]
├── tickets: ITSMTicket[]
├── endpoints: EndpointHealth[]
├── jobs: FieldJob[]
├── assets: AssetItem[]
├── licenses: SoftwareLicense[]
├── amcs: AMCContract[]
├── projects: Project[]
├── proposals: Proposal[]
├── providers: ProviderProfile[]
├── events: AutonomousEvent[]
├── invoices: InvoiceRecord[]
├── workflows: AutomationWorkflow[]
├── connectors: IntegrationConnector[]
├── rmaClaims: RMAClaim[]
├── knowledgeArticles: KnowledgeArticle[]
├── crmOpportunities: CRMOpportunity[]
├── marketplaceDisputes: MarketplaceDispute[]
└── inventoryTransactions: InventoryTransaction[]
```

---

## 2. Core Entity Definitions

### 2.1 `TenantInfo`
Represents the organization's legal, operational, and tax identity.
- `id`: `string` (UUID or unique slug)
- `name`: `string` (Legal Company Name)
- `gstin`: `string` (15-character Indian GSTIN)
- `pan`: `string` (Optional, 10-character PAN)
- `state`: `string` (State code and name, e.g. "Maharashtra (27)")
- `currency`: `string` (Default "₹")
- `address`: `string` (Registered Office Address)
- `contactEmail`: `string` (Billing & Notice Email)
- `contactPhone`: `string` (Primary Phone)
- `isConfigured`: `boolean` (False until setup by tenant admin)

### 2.2 `ProductItem` (Warehouse Inventory Catalog)
- `id`: `string`
- `sku`: `string` (Stock Keeping Unit, unique)
- `name`: `string`
- `brand`: `string`
- `category`: `'Laptop' | 'Desktop' | 'Server' | 'Networking' | 'Power' | 'Component' | 'Storage' | 'Peripheral'`
- `specs`: `string`
- `purchaseCost`: `number` (Cost Price in INR)
- `marketPrice`: `number` (MSRP in INR)
- `sellingPrice`: `number` (Catalog Offer Price in INR)
- `minPrice`: `number` (Hard floor price for automated approvals)
- `targetMarginPercent`: `number`
- `stockAvailable`: `number` (Real uncommitted inventory on hand)
- `stockReserved`: `number` (Reserved against open POs / active quotes)
- `warehouseLocation`: `string` (e.g. "BOM-RACK-04")
- `hsn`: `string` (Harmonized System of Nomenclature code)
- `gstPercent`: `number` (e.g. 18)
- `warrantyYears`: `number`
- `serialTrackingRequired`: `boolean`

### 2.3 `FieldJob` (Engineer Dispatch & Spares Consumption)
- `id`: `string`
- `jobCode`: `string` (e.g. "JOB-2026-0042")
- `title`: `string`
- `customerName`: `string`
- `address`: `string`
- `technicianName`: `string`
- `technicianPhone`: `string`
- `status`: `'SCHEDULED' | 'EN_ROUTE' | 'CHECKED_IN' | 'DIAGNOSING' | 'PARTS_REPLACED' | 'COMPLETED'`
- `scheduledTime`: `string` (ISO 8601)
- `partsConsumed`: `Array<{ partName: string; qty: number; cost: number }>`
- `customerSignatureObtained`: `boolean`
- `customerRating`: `number` (Optional, 1-5)

### 2.4 `InventoryTransaction` (Audit Trail)
- `id`: `string`
- `tenantId`: `string`
- `productId`: `string`
- `sku`: `string`
- `productName`: `string`
- `type`: `'IN' | 'OUT' | 'ADJUSTMENT' | 'RETURN'`
- `qty`: `number`
- `previousStock`: `number`
- `newStock`: `number`
- `reason`: `string` (e.g. "Consumed on Field Job JOB-999")
- `referenceId`: `string` (Job ID or PO ID)
- `timestamp`: `string` (ISO 8601)

### 2.5 `InvoiceRecord` (Financial Ledger)
- `id`: `string`
- `customer`: `string`
- `invoiceNo`: `string` (e.g. "INV-2026-001")
- `amount`: `number` (Gross value in INR)
- `status`: `'ACTIVE' | 'DUE_SOON' | 'OVERDUE' | 'SETTLED' | 'CANCELLED'`
- `dueInDays`: `number`
- `createdAt`: `string`
- `gstin`: `string` (Optional)

---

## 3. Atomic File Persistence Mechanics

All updates write to disk through the atomic write pipeline:
1. `JSON.stringify(state, null, 2)` serializes current state in memory.
2. Writes to temporary file: `data/app-store.json.tmp.${Date.now()}`.
3. POSIX atomic file rename replaces `data/app-store.json` in a single filesystem operation, eliminating file corruption on power cut or crash.
4. An automated snapshot is preserved in `data/app-store.backup.json`.
