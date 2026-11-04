import fs from 'fs';
import path from 'path';
import {
  ProductItem,
  Lead,
  Quotation,
  RFQItem,
  ITSMTicket,
  EndpointHealth,
  FieldJob,
  AssetItem,
  SoftwareLicense,
  AMCContract,
  Project,
  Proposal,
  AutonomousEvent,
  TelegramMessage,
  SupplierInfo,
  ProviderProfile,
  AutomationWorkflow,
  IntegrationConnector,
  RMAClaim,
  KnowledgeArticle,
  CRMOpportunity,
  MarketplaceDispute,
  TenantInfo,
  UserAccount,
  InvoiceRecord
} from '../src/types';

export interface InventoryTransaction {
  id: string;
  tenantId: string;
  productId: string;
  sku: string;
  productName: string;
  type: 'IN' | 'OUT' | 'RESERVE' | 'RELEASE';
  qty: number;
  previousStock: number;
  newStock: number;
  reason: string;
  referenceId?: string;
  timestamp: string;
}

export interface AppStoreState {
  tenant: TenantInfo;
  users: UserAccount[];
  products: ProductItem[];
  leads: Lead[];
  quotes: Quotation[];
  telegramMessages: TelegramMessage[];
  suppliers: SupplierInfo[];
  rfqs: RFQItem[];
  tickets: ITSMTicket[];
  endpoints: EndpointHealth[];
  jobs: FieldJob[];
  assets: AssetItem[];
  licenses: SoftwareLicense[];
  amcs: AMCContract[];
  projects: Project[];
  proposals: Proposal[];
  providers: ProviderProfile[];
  events: AutonomousEvent[];
  invoices: InvoiceRecord[];
  workflows: AutomationWorkflow[];
  connectors: IntegrationConnector[];
  rmaClaims: RMAClaim[];
  knowledgeArticles: KnowledgeArticle[];
  crmOpportunities: CRMOpportunity[];
  marketplaceDisputes: MarketplaceDispute[];
  inventoryTransactions: InventoryTransaction[];
  lastUpdated: string;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'app-store.json');
const BACKUP_FILE = path.join(DATA_DIR, 'app-store.backup.json');

export const defaultConnectors: IntegrationConnector[] = [
  {
    id: 'conn-gemini',
    name: 'Google Gemini AI',
    category: 'AI & LLM',
    icon: 'Sparkles',
    status: process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY' ? 'CONFIGURED' : 'NOT_CONFIGURED',
    recordsSynced: '0',
    lastSyncTime: 'Never',
    description: 'Powers autonomous BOM generation, IT triage, and natural-language executive copilot.',
    requiredEnvKeys: ['GEMINI_API_KEY']
  },
  {
    id: 'conn-telegram',
    name: 'Telegram Bot API',
    category: 'Messaging',
    icon: 'Send',
    status: process.env.TELEGRAM_BOT_TOKEN ? 'CONFIGURED' : 'NOT_CONFIGURED',
    recordsSynced: '0',
    lastSyncTime: 'Never',
    description: 'Enables mobile owner approvals, margin breach escalations, and command notifications.',
    requiredEnvKeys: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBHOOK_SECRET']
  },
  {
    id: 'conn-m365',
    name: 'Microsoft 365 & Entra ID',
    category: 'Identity & SSO',
    icon: 'Shield',
    status: process.env.M365_CLIENT_ID ? 'CONFIGURED' : 'NOT_CONFIGURED',
    recordsSynced: '0',
    lastSyncTime: 'Never',
    description: 'Syncs directory identities, user provisioning, and SaaS license utilization telemetry.',
    requiredEnvKeys: ['M365_TENANT_ID', 'M365_CLIENT_ID', 'M365_CLIENT_SECRET']
  },
  {
    id: 'conn-intune',
    name: 'Microsoft Intune / RMM Gateway',
    category: 'MDM & RMM',
    icon: 'Laptop',
    status: process.env.RMM_API_KEY ? 'CONFIGURED' : 'NOT_CONFIGURED',
    recordsSynced: '0',
    lastSyncTime: 'Never',
    description: 'Continuously monitors endpoint device hardware health, disk telemetry, and OS patch levels.',
    requiredEnvKeys: ['RMM_API_KEY', 'RMM_ENDPOINT_URL']
  },
  {
    id: 'conn-payment',
    name: 'Razorpay / Cashfree Gateway',
    category: 'Finance & ERP',
    icon: 'Receipt',
    status: process.env.RAZORPAY_KEY_ID ? 'CONFIGURED' : 'NOT_CONFIGURED',
    recordsSynced: '0',
    lastSyncTime: 'Never',
    description: 'Handles online customer quotation advance settlements and verified milestone escrow payments.',
    requiredEnvKeys: ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET']
  },
  {
    id: 'conn-gst',
    name: 'NIC GST E-Invoice & E-Way Bill',
    category: 'Finance & ERP',
    icon: 'FileCheck',
    status: process.env.GST_API_KEY ? 'CONFIGURED' : 'NOT_CONFIGURED',
    recordsSynced: '0',
    lastSyncTime: 'Never',
    description: 'Cryptographically registers B2B invoices with government IRP portal for legal IRN generation.',
    requiredEnvKeys: ['GST_API_KEY', 'GST_SELLER_GSTIN']
  }
];

function getInitialCleanState(): AppStoreState {
  return {
    tenant: {
      id: 'tenant-1',
      name: 'Apex Autonomous IT Operating System',
      gstin: '',
      state: 'Maharashtra (27)',
      currency: '₹',
      logoText: 'APEX',
      isConfigured: false
    },
    users: [
      {
        id: 'usr-1',
        username: 'admin',
        name: 'Enterprise IT Administrator',
        email: 'admin@apex-it.internal',
        role: 'BUSINESS_OWNER',
        tenantId: 'tenant-1',
        createdAt: new Date().toISOString()
      }
    ],
    products: [],
    leads: [],
    quotes: [],
    telegramMessages: [],
    suppliers: [],
    rfqs: [],
    tickets: [],
    endpoints: [],
    jobs: [],
    assets: [],
    licenses: [],
    amcs: [],
    projects: [],
    proposals: [],
    providers: [],
    events: [],
    invoices: [],
    workflows: [],
    connectors: defaultConnectors,
    rmaClaims: [],
    knowledgeArticles: [],
    crmOpportunities: [],
    marketplaceDisputes: [],
    inventoryTransactions: [],
    lastUpdated: new Date().toISOString()
  };
}

class PersistentStore {
  private state: AppStoreState;

  constructor() {
    this.state = this.loadFromDisk();
  }

  private loadFromDisk(): AppStoreState {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          // Verify if this store contained old mock data (e.g. initial mock products or mock invoices)
          const hasOldMockData = Array.isArray(parsed.products) && parsed.products.some(
            (p: any) => p.sku === 'DELL-OPT-7010-I5' || p.sku === 'LEN-T14-GEN4-I7'
          );
          const hasOldMockInvoices = Array.isArray(parsed.invoices) && parsed.invoices.some(
            (i: any) => i.invoiceNo === 'INV-2026-0812'
          );

          if (hasOldMockData || hasOldMockInvoices) {
            // Backup before migration
            try {
              fs.writeFileSync(BACKUP_FILE, raw, 'utf-8');
            } catch (backupErr) {
              console.warn('Could not write backup file:', backupErr);
            }
            // Filter out old mock items while preserving genuine user items
            const cleanedState = getInitialCleanState();
            // Preserve user-created tenant settings if modified
            if (parsed.tenant && parsed.tenant.isConfigured) {
              cleanedState.tenant = parsed.tenant;
            }
            // Preserve products not matching old mock templates
            if (Array.isArray(parsed.products)) {
              cleanedState.products = parsed.products.filter(
                (p: any) => !['DELL-OPT-7010-I5', 'LEN-T14-GEN4-I7', 'CISCO-CBS350-48P', 'FORTI-FG-60F', 'APC-SRT-6KXLI', 'DELL-P2422H'].includes(p.sku)
              );
            }
            this.persistToDisk(cleanedState);
            return cleanedState;
          }

          // Otherwise return existing persistent store with default connectors refreshed
          const sanitizedState = {
            ...getInitialCleanState(),
            ...parsed,
            connectors: defaultConnectors
          };
          return sanitizedState;
        }
      }
    } catch (err) {
      console.error('Error loading persistent store from disk:', err);
    }

    // Default to clean state
    const cleanState = getInitialCleanState();
    this.persistToDisk(cleanState);
    return cleanState;
  }

  private persistToDisk(stateToSave: AppStoreState) {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      stateToSave.lastUpdated = new Date().toISOString();
      const tmpFile = `${DB_FILE}.tmp.${Date.now()}`;
      fs.writeFileSync(tmpFile, JSON.stringify(stateToSave, null, 2), 'utf-8');
      fs.renameSync(tmpFile, DB_FILE);
    } catch (err) {
      console.error('Failed to persist store to disk:', err);
    }
  }

  public getState(): AppStoreState {
    return this.state;
  }

  public resetToCleanSlate(): AppStoreState {
    this.state = getInitialCleanState();
    this.persistToDisk(this.state);
    return this.state;
  }

  // Tenant
  public updateTenant(updates: Partial<TenantInfo>): TenantInfo {
    this.state.tenant = { ...this.state.tenant, ...updates };
    this.persistToDisk(this.state);
    return this.state.tenant;
  }

  // Users
  public getUsers(): UserAccount[] {
    return this.state.users;
  }

  public addUser(user: UserAccount): UserAccount {
    this.state.users.push(user);
    this.persistToDisk(this.state);
    return user;
  }

  // Tickets
  public addTicket(ticket: ITSMTicket): ITSMTicket {
    this.state.tickets = [ticket, ...this.state.tickets];
    this.persistToDisk(this.state);
    return ticket;
  }

  public updateTicket(id: string, updates: Partial<ITSMTicket>): ITSMTicket | null {
    const idx = this.state.tickets.findIndex(t => t.id === id);
    if (idx === -1) return null;
    this.state.tickets[idx] = { ...this.state.tickets[idx], ...updates };
    this.persistToDisk(this.state);
    return this.state.tickets[idx];
  }

  // Endpoints
  public addEndpoint(endpoint: EndpointHealth): EndpointHealth {
    this.state.endpoints = [endpoint, ...this.state.endpoints];
    this.persistToDisk(this.state);
    return endpoint;
  }

  public updateEndpoint(id: string, updates: Partial<EndpointHealth>): EndpointHealth | null {
    const idx = this.state.endpoints.findIndex(e => e.id === id);
    if (idx === -1) return null;
    this.state.endpoints[idx] = { ...this.state.endpoints[idx], ...updates };
    this.persistToDisk(this.state);
    return this.state.endpoints[idx];
  }

  // Assets
  public addAsset(asset: AssetItem): AssetItem {
    this.state.assets = [asset, ...this.state.assets];
    this.persistToDisk(this.state);
    return asset;
  }

  public updateAsset(id: string, updates: Partial<AssetItem>): AssetItem | null {
    const idx = this.state.assets.findIndex(a => a.id === id);
    if (idx === -1) return null;
    this.state.assets[idx] = { ...this.state.assets[idx], ...updates };
    this.persistToDisk(this.state);
    return this.state.assets[idx];
  }

  // Software Licenses
  public addLicense(lic: SoftwareLicense): SoftwareLicense {
    this.state.licenses = [lic, ...this.state.licenses];
    this.persistToDisk(this.state);
    return lic;
  }

  public reclaimLicense(id: string): SoftwareLicense | null {
    const idx = this.state.licenses.findIndex(l => l.id === id);
    if (idx === -1) return null;
    const lic = this.state.licenses[idx];
    lic.assignedSeats = lic.activeLast30Days;
    lic.purchasedSeats = lic.activeLast30Days;
    lic.unusedSeats = 0;
    lic.annualWastedSpend = 0;
    this.persistToDisk(this.state);
    return lic;
  }

  // AMC
  public addAMC(amc: AMCContract): AMCContract {
    this.state.amcs = [amc, ...this.state.amcs];
    this.persistToDisk(this.state);
    return amc;
  }

  // Invoices
  public addInvoice(invoice: InvoiceRecord): InvoiceRecord {
    this.state.invoices = [invoice, ...this.state.invoices];
    this.persistToDisk(this.state);
    return invoice;
  }

  public settleInvoice(invoiceNo: string): InvoiceRecord | null {
    const inv = this.state.invoices.find(i => i.invoiceNo === invoiceNo);
    if (!inv) return null;
    inv.status = 'SETTLED';
    inv.settledAt = new Date().toISOString();
    this.persistToDisk(this.state);
    return inv;
  }

  // Proposals
  public addProposal(proposal: Proposal): Proposal {
    this.state.proposals = [proposal, ...this.state.proposals];
    this.persistToDisk(this.state);
    return proposal;
  }

  public updateProposal(id: string, updates: Partial<Proposal>): Proposal | null {
    const idx = this.state.proposals.findIndex(p => p.id === id);
    if (idx === -1) return null;
    this.state.proposals[idx] = { ...this.state.proposals[idx], ...updates };
    this.persistToDisk(this.state);
    return this.state.proposals[idx];
  }

  // Products
  public addProduct(product: ProductItem): ProductItem {
    this.state.products = [product, ...this.state.products];
    this.persistToDisk(this.state);
    return product;
  }

  public updateProduct(id: string, updates: Partial<ProductItem>): ProductItem | null {
    const idx = this.state.products.findIndex(p => p.id === id);
    if (idx === -1) return null;
    this.state.products[idx] = { ...this.state.products[idx], ...updates };
    this.persistToDisk(this.state);
    return this.state.products[idx];
  }

  public deleteProduct(id: string): boolean {
    const initialLen = this.state.products.length;
    this.state.products = this.state.products.filter(p => p.id !== id);
    if (this.state.products.length !== initialLen) {
      this.persistToDisk(this.state);
      return true;
    }
    return false;
  }

  // Suppliers
  public addSupplier(supplier: SupplierInfo): SupplierInfo {
    this.state.suppliers = [supplier, ...this.state.suppliers];
    this.persistToDisk(this.state);
    return supplier;
  }

  // RFQs
  public addRFQ(rfq: RFQItem): RFQItem {
    this.state.rfqs = [rfq, ...this.state.rfqs];
    this.persistToDisk(this.state);
    return rfq;
  }

  public addSupplierQuoteToRFQ(rfqId: string, quote: RFQItem['supplierQuotes'][0]): RFQItem | null {
    const rfq = this.state.rfqs.find(r => r.id === rfqId);
    if (!rfq) return null;
    rfq.supplierQuotes.push(quote);
    if (rfq.status === 'OPEN' && rfq.supplierQuotes.length > 1) {
      rfq.status = 'COMPARED';
    }
    this.persistToDisk(this.state);
    return rfq;
  }

  public dispatchPO(rfqId: string, supplierId: string): RFQItem | null {
    const rfq = this.state.rfqs.find(r => r.id === rfqId);
    if (!rfq) return null;
    rfq.status = 'PO_DISPATCHED';
    this.persistToDisk(this.state);
    return rfq;
  }

  // Field Jobs
  public addJob(job: FieldJob): FieldJob {
    this.state.jobs = [job, ...this.state.jobs];
    this.persistToDisk(this.state);
    return job;
  }

  public updateJob(id: string, updates: Partial<FieldJob>): FieldJob | null {
    const idx = this.state.jobs.findIndex(j => j.id === id);
    if (idx === -1) return null;
    this.state.jobs[idx] = { ...this.state.jobs[idx], ...updates };
    this.persistToDisk(this.state);
    return this.state.jobs[idx];
  }

  public consumeJobPart(jobId: string, partName: string, cost: number): FieldJob | null {
    const job = this.state.jobs.find(j => j.id === jobId);
    if (!job) return null;

    job.partsConsumed.push({ partName, qty: 1, cost });

    // Look for matching inventory product to decrement real warehouse stock
    const matchingProduct = this.state.products.find(
      p => p.name.toLowerCase().includes(partName.toLowerCase()) || p.sku.toLowerCase() === partName.toLowerCase()
    );

    if (matchingProduct && matchingProduct.stockAvailable > 0) {
      const prevStock = matchingProduct.stockAvailable;
      matchingProduct.stockAvailable -= 1;
      const tx: InventoryTransaction = {
        id: `tx-${Date.now()}`,
        tenantId: this.state.tenant.id,
        productId: matchingProduct.id,
        sku: matchingProduct.sku,
        productName: matchingProduct.name,
        type: 'OUT',
        qty: 1,
        previousStock: prevStock,
        newStock: matchingProduct.stockAvailable,
        reason: `Consumed on Field Job ${job.jobCode} (${job.customerName})`,
        referenceId: job.id,
        timestamp: new Date().toISOString()
      };
      this.state.inventoryTransactions.push(tx);
    }

    this.persistToDisk(this.state);
    return job;
  }

  // Projects
  public addProject(project: Project): Project {
    this.state.projects = [project, ...this.state.projects];
    this.persistToDisk(this.state);
    return project;
  }

  public updateProject(id: string, updates: Partial<Project>): Project | null {
    const idx = this.state.projects.findIndex(p => p.id === id);
    if (idx === -1) return null;
    this.state.projects[idx] = { ...this.state.projects[idx], ...updates };
    this.persistToDisk(this.state);
    return this.state.projects[idx];
  }

  // Events
  public addEvent(event: AutonomousEvent): AutonomousEvent {
    this.state.events = [event, ...this.state.events];
    this.persistToDisk(this.state);
    return event;
  }

  // Quotes
  public addQuote(quote: Quotation): Quotation {
    this.state.quotes = [quote, ...this.state.quotes];
    this.persistToDisk(this.state);
    return quote;
  }

  public approveQuote(quoteId: string): Quotation | null {
    const q = this.state.quotes.find(item => item.id === quoteId || item.quoteNumber.includes(quoteId));
    if (!q) return null;
    q.status = 'APPROVED';
    this.persistToDisk(this.state);
    return q;
  }

  public rejectQuote(quoteId: string, reason?: string): Quotation | null {
    const q = this.state.quotes.find(item => item.id === quoteId || item.quoteNumber.includes(quoteId));
    if (!q) return null;
    q.status = 'REJECTED';
    if (reason) q.approvalReason = reason;
    this.persistToDisk(this.state);
    return q;
  }

  // Telegram
  public addTelegramMessage(msg: TelegramMessage): TelegramMessage {
    this.state.telegramMessages = [...this.state.telegramMessages, msg];
    this.persistToDisk(this.state);
    return msg;
  }

  // Workflows
  public addWorkflow(wf: AutomationWorkflow): AutomationWorkflow {
    this.state.workflows = [wf, ...this.state.workflows];
    this.persistToDisk(this.state);
    return wf;
  }

  public toggleWorkflow(id: string): AutomationWorkflow | null {
    const wf = this.state.workflows.find(w => w.id === id);
    if (!wf) return null;
    wf.active = !wf.active;
    this.persistToDisk(this.state);
    return wf;
  }

  public recordWorkflowExecution(id: string): AutomationWorkflow | null {
    const wf = this.state.workflows.find(w => w.id === id);
    if (!wf) return null;
    wf.executionCount += 1;
    wf.lastExecuted = new Date().toISOString();
    this.persistToDisk(this.state);
    return wf;
  }
}

export const dbStore = new PersistentStore();
