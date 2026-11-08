import fs from 'fs';
import path from 'path';
import crypto from 'node:crypto';
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
  UserRole,
  InvoiceRecord,
  ProjectMilestone
} from '../src/types.ts';

export interface ServerUser extends UserAccount {
  passwordHash?: string;
  salt?: string;
}

export interface SessionRecord {
  token: string;
  userId: string;
  username: string;
  role: UserRole;
  createdAt: string;
  expiresAt: string;
}

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
  users: ServerUser[];
  sessions: SessionRecord[];
  products: ProductItem[];
  leads: Lead[];
  quotes: Quotation[];
  telegramMessages: TelegramMessage[];
  processedTelegramUpdateIds: number[];
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
// Explicitly isolated database path is required for API smoke tests and deployments.
const configuredDataFile = process.env.APEX_DATA_FILE?.trim();
const DB_FILE = configuredDataFile
  ? path.resolve(configuredDataFile)
  : path.join(DATA_DIR, 'app-store.json');

// A deployment checkout can overwrite repository-tracked data/app-store.json.
// Production must use a separately provisioned private location outside this checkout.
if (process.env.NODE_ENV === 'production') {
  const checkedPath = fs.existsSync(DB_FILE) ? fs.realpathSync(DB_FILE) : DB_FILE;
  const relative = path.relative(process.cwd(), checkedPath);
  const insideCheckout = relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
  if (!configuredDataFile || !path.isAbsolute(configuredDataFile) || insideCheckout) {
    throw new Error('PRODUCTION DATA SAFETY: set APEX_DATA_FILE to an explicit private absolute path outside the application checkout. Deployment aborted; no data was overwritten.');
  }
}

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

export function hashPassword(password: string): { salt: string; hash: string } {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

export function verifyPassword(password: string, salt: string, storedHash: string): boolean {
  try {
    const key = crypto.scryptSync(password, salt, 64);
    const storedKey = Buffer.from(storedHash, 'hex');
    return crypto.timingSafeEqual(key, storedKey);
  } catch {
    return false;
  }
}

export function getInitialCleanState(): AppStoreState {
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
    users: [],
    sessions: [],
    products: [],
    leads: [],
    quotes: [],
    telegramMessages: [],
    processedTelegramUpdateIds: [],
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

export class PersistentStore {
  private readonly dbFile: string;
  private readonly dataDir: string;
  private state: AppStoreState;

  constructor(dbFile: string = DB_FILE) {
    this.dbFile = dbFile;
    this.dataDir = path.dirname(dbFile);
    this.state = this.loadFromDisk();
  }

  private loadFromDisk(): AppStoreState {
    if (!fs.existsSync(this.dbFile)) {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
      const cleanState = getInitialCleanState();
      this.persistToDisk(cleanState);
      return cleanState;
    }

    const raw = fs.readFileSync(this.dbFile, 'utf-8');
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch (parseErr) {
      const corruptedBackup = `${this.dbFile}.corrupted.${Date.now()}`;
      try {
        fs.writeFileSync(corruptedBackup, raw, 'utf-8');
      } catch (backupErr) {
        console.error('Failed to create backup of corrupted database:', backupErr);
      }
      throw new Error(`CRITICAL: Database file ${this.dbFile} is corrupted and cannot be parsed as JSON. Preserved snapshot at ${corruptedBackup}. Refusing to overwrite data.`);
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new Error(`CRITICAL: Database file ${this.dbFile} contains invalid JSON structure (not an object).`);
    }

    const base = getInitialCleanState();
    return {
      ...base,
      ...parsed,
      connectors: defaultConnectors
    };
  }

  private persistToDisk(stateToSave: AppStoreState): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    stateToSave.lastUpdated = new Date().toISOString();
    const tmpFile = `${this.dbFile}.tmp.${Date.now()}.${crypto.randomBytes(4).toString('hex')}`;
    fs.writeFileSync(tmpFile, JSON.stringify(stateToSave, null, 2), 'utf-8');
    fs.renameSync(tmpFile, this.dbFile);
  }

  public commit<T>(operation: (draft: AppStoreState) => T): T {
    const draft = structuredClone(this.state);
    const result = operation(draft);
    this.persistToDisk(draft);
    this.state = draft;
    return result;
  }

  public getState(): AppStoreState {
    return this.state;
  }

  public resetToCleanSlate(): AppStoreState {
    return this.commit((draft) => {
      const clean = getInitialCleanState();
      Object.assign(draft, clean);
      return draft;
    });
  }

  // Tenant
  public updateTenant(updates: Partial<TenantInfo>): TenantInfo {
    return this.commit((draft) => {
      draft.tenant = { ...draft.tenant, ...updates };
      return draft.tenant;
    });
  }

  // Users & Sessions
  public getUsers(): ServerUser[] {
    return this.state.users;
  }

  public getUserById(id: string): ServerUser | undefined {
    return this.state.users.find(u => u.id === id);
  }

  public getUserByUsername(username: string): ServerUser | undefined {
    return this.state.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  }

  public addUser(user: ServerUser): ServerUser {
    return this.commit((draft) => {
      if (draft.users.some(existing => existing.username.toLowerCase() === user.username.toLowerCase())) {
        throw new Error('Username already exists.');
      }
      if (draft.users.some(existing => existing.email.toLowerCase() === user.email.toLowerCase())) {
        throw new Error('Email address already belongs to another user.');
      }
      draft.users.push(user);
      return user;
    });
  }

  public addStaffUser(user: ServerUser, actor: string): ServerUser {
    return this.commit((draft) => {
      if (draft.users.some(existing =>
        existing.username.toLowerCase() === user.username.toLowerCase() ||
        existing.email.toLowerCase() === user.email.toLowerCase())) {
        throw new Error('Username or email is already in use.');
      }
      draft.users.push(user);
      draft.events.push({
        id: 'evt-' + crypto.randomUUID(), timestamp: new Date().toISOString(),
        eventType: 'StaffAccountCreated', agent: actor,
        summary: 'Created staff account ' + user.username + ' with role ' + user.role + '.',
        autonomousActionTaken: 'Owner-authorized local identity created; no external provider provisioning.',
        humanApprovalRequired: true, approvalStatus: 'AUTHORIZED', confidenceScore: 1
      });
      return user;
    });
  }

  // Admin-controlled disable. Never allow removing the business owner via staff API.
  // Revocation and account state change are written in one atomic file commit.
  public disableStaffUser(id: string, actor: string): ServerUser | null {
    return this.commit((draft) => {
      const user = draft.users.find(item => item.id === id);
      if (!user) return null;
      if (user.role === 'BUSINESS_OWNER') {
        throw new Error('Business owner cannot be disabled through staff management.');
      }
      if (!user.disabledAt) user.disabledAt = new Date().toISOString();
      draft.sessions = draft.sessions.filter(session => session.userId !== id);
      draft.events.push({
        id: 'evt-' + crypto.randomUUID(), timestamp: new Date().toISOString(),
        eventType: 'StaffAccountDisabled', agent: actor,
        summary: 'Disabled staff account ' + user.username + ' and revoked active sessions.',
        autonomousActionTaken: 'Local login blocked. External Microsoft/SSO access remains unmanaged.',
        humanApprovalRequired: true, approvalStatus: 'AUTHORIZED', confidenceScore: 1
      });
      return user;
    });
  }

  // Password rotation revokes all active sessions, including current one.
  public rotateUserPassword(id: string, newSalt: string, newHash: string): ServerUser | null {
    return this.commit((draft) => {
      const user = draft.users.find(item => item.id === id);
      if (!user || user.disabledAt) return null;
      user.salt = newSalt;
      user.passwordHash = newHash;
      user.passwordChangedAt = new Date().toISOString();
      draft.sessions = draft.sessions.filter(session => session.userId !== id);
      draft.events.push({
        id: 'evt-' + crypto.randomUUID(), timestamp: new Date().toISOString(),
        eventType: 'PasswordChanged', agent: user.username,
        summary: 'Password rotated for local account ' + user.username + '; all sessions revoked.',
        autonomousActionTaken: 'Local credential changed; external SSO credentials unchanged.',
        humanApprovalRequired: false, approvalStatus: 'AUTO_APPROVED', confidenceScore: 1
      });
      return user;
    });
  }

  public createSession(userId: string, username: string, role: UserRole): SessionRecord {
    const token = crypto.randomBytes(32).toString('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const session: SessionRecord = {
      token,
      userId,
      username,
      role,
      createdAt: now.toISOString(),
      expiresAt
    };
    return this.commit((draft) => {
      // Remove any existing sessions for this token or expired sessions
      const nowIso = new Date().toISOString();
      draft.sessions = draft.sessions.filter(s => s.expiresAt > nowIso && s.token !== token);
      draft.sessions.push(session);
      return session;
    });
  }

  public getSession(token: string): SessionRecord | null {
    if (!token) return null;
    const session = this.state.sessions.find(s => s.token === token);
    if (!session) return null;
    if (new Date(session.expiresAt) <= new Date()) {
      return null;
    }
    // Reject legacy passwordless users and apply the user's current role.
    const user = this.state.users.find(u => u.id === session.userId);
    if (!user || !user.passwordHash || !user.salt || user.disabledAt) return null;
    return { ...session, role: user.role, username: user.username };
  }

  public deleteSession(token: string): boolean {
    return this.commit((draft) => {
      const initial = draft.sessions.length;
      draft.sessions = draft.sessions.filter(s => s.token !== token);
      return draft.sessions.length < initial;
    });
  }

  // Tickets
  public addTicket(ticket: ITSMTicket): ITSMTicket {
    return this.commit((draft) => {
      draft.tickets = [ticket, ...draft.tickets];
      return ticket;
    });
  }

  public updateTicket(id: string, updates: Partial<ITSMTicket>): ITSMTicket | null {
    return this.commit((draft) => {
      const idx = draft.tickets.findIndex(t => t.id === id);
      if (idx === -1) return null;
      draft.tickets[idx] = { ...draft.tickets[idx], ...updates };
      return draft.tickets[idx];
    });
  }

  // Endpoints
  public addEndpoint(endpoint: EndpointHealth): EndpointHealth {
    return this.commit((draft) => {
      draft.endpoints = [endpoint, ...draft.endpoints];
      return endpoint;
    });
  }

  public updateEndpoint(id: string, updates: Partial<EndpointHealth>): EndpointHealth | null {
    return this.commit((draft) => {
      const idx = draft.endpoints.findIndex(e => e.id === id);
      if (idx === -1) return null;
      draft.endpoints[idx] = { ...draft.endpoints[idx], ...updates };
      return draft.endpoints[idx];
    });
  }

  // Assets
  public addAsset(asset: AssetItem): AssetItem {
    return this.commit((draft) => {
      draft.assets = [asset, ...draft.assets];
      return asset;
    });
  }

  public updateAsset(id: string, updates: Partial<AssetItem>): AssetItem | null {
    return this.commit((draft) => {
      const idx = draft.assets.findIndex(a => a.id === id);
      if (idx === -1) return null;
      draft.assets[idx] = { ...draft.assets[idx], ...updates };
      return draft.assets[idx];
    });
  }

  // Software Licenses
  public addLicense(lic: SoftwareLicense): SoftwareLicense {
    return this.commit((draft) => {
      draft.licenses = [lic, ...draft.licenses];
      return lic;
    });
  }

  public reclaimLicense(id: string): SoftwareLicense | null {
    return this.commit((draft) => {
      const idx = draft.licenses.findIndex(l => l.id === id);
      if (idx === -1) return null;
      const lic = draft.licenses[idx];
      lic.assignedSeats = lic.activeLast30Days;
      lic.purchasedSeats = lic.activeLast30Days;
      lic.unusedSeats = 0;
      lic.annualWastedSpend = 0;
      return lic;
    });
  }

  // AMC
  public addAMC(amc: AMCContract): AMCContract {
    return this.commit((draft) => {
      draft.amcs = [amc, ...draft.amcs];
      return amc;
    });
  }

  // Invoices
  public addInvoice(invoice: InvoiceRecord): InvoiceRecord {
    return this.commit((draft) => {
      draft.invoices = [invoice, ...draft.invoices];
      return invoice;
    });
  }

  public settleInvoice(invoiceNo: string, settlementInfo: { paymentReference: string; method?: string }): InvoiceRecord | null {
    const reference = settlementInfo?.paymentReference?.trim();
    if (!reference || reference.length < 4 || reference.length > 200) {
      throw new Error('A verified bank/UPI payment reference (4-200 characters) is required.');
    }
    return this.commit((draft) => {
      const inv = draft.invoices.find(i => i.invoiceNo === invoiceNo);
      if (!inv) return null;
      if (inv.status === 'SETTLED' || inv.status === 'CANCELLED') {
        throw new Error('This invoice cannot be settled again or is cancelled.');
      }
      inv.status = 'SETTLED';
      inv.settledAt = new Date().toISOString();
      inv.paymentReference = reference;
      return inv;
    });
  }

  // Proposals
  public addProposal(proposal: Proposal): Proposal {
    return this.commit((draft) => {
      draft.proposals = [proposal, ...draft.proposals];
      return proposal;
    });
  }

  public updateProposal(id: string, updates: Partial<Proposal>): Proposal | null {
    return this.commit((draft) => {
      const idx = draft.proposals.findIndex(p => p.id === id);
      if (idx === -1) return null;
      draft.proposals[idx] = { ...draft.proposals[idx], ...updates };
      return draft.proposals[idx];
    });
  }

  // Products
  public addProduct(product: ProductItem): ProductItem {
    return this.commit((draft) => {
      draft.products = [product, ...draft.products];
      return product;
    });
  }

  public updateProduct(id: string, updates: Partial<ProductItem>): ProductItem | null {
    return this.commit((draft) => {
      const idx = draft.products.findIndex(p => p.id === id);
      if (idx === -1) return null;
      draft.products[idx] = { ...draft.products[idx], ...updates };
      return draft.products[idx];
    });
  }

  public deleteProduct(id: string): boolean {
    return this.commit((draft) => {
      const initialLen = draft.products.length;
      draft.products = draft.products.filter(p => p.id !== id);
      return draft.products.length !== initialLen;
    });
  }

  // Suppliers
  public addSupplier(supplier: SupplierInfo): SupplierInfo {
    return this.commit((draft) => {
      draft.suppliers = [supplier, ...draft.suppliers];
      return supplier;
    });
  }

  // Keep a bounded durable replay ledger for Telegram update IDs.
  public markTelegramUpdateProcessed(updateId: number): boolean {
    if (!Number.isSafeInteger(updateId) || updateId < 0) {
      throw new Error('Telegram update_id must be a positive safe integer.');
    }
    if (this.state.processedTelegramUpdateIds.includes(updateId)) return false;
    return this.commit((draft) => {
      if (draft.processedTelegramUpdateIds.includes(updateId)) return false;
      draft.processedTelegramUpdateIds = [...draft.processedTelegramUpdateIds, updateId].slice(-2048);
      return true;
    });
  }

  // RFQs
  public addRFQ(rfq: RFQItem): RFQItem {
    return this.commit((draft) => {
      draft.rfqs = [rfq, ...draft.rfqs];
      return rfq;
    });
  }

  public addSupplierQuoteToRFQ(rfqId: string, quote: RFQItem['supplierQuotes'][0]): RFQItem | null {
    return this.commit((draft) => {
      const rfq = draft.rfqs.find(r => r.id === rfqId);
      if (!rfq) return null;
      rfq.supplierQuotes.push(quote);
      if (rfq.status === 'OPEN' && rfq.supplierQuotes.length > 1) {
        rfq.status = 'COMPARED';
      }
      return rfq;
    });
  }

  // Prepare an internal purchase order; no vendor email or portal submission occurs.
  // All supplier amounts come from the actual recorded quote, never caller input.
  public preparePO(rfqId: string, supplierId: string, preparedBy: string): RFQItem | null {
    return this.commit((draft) => {
      const rfq = draft.rfqs.find(r => r.id === rfqId);
      if (!rfq) return null;
      if (rfq.status === 'PO_PREPARED' || rfq.status === 'PO_DISPATCHED') {
        throw new Error('Purchase order is already prepared or previously recorded dispatched.');
      }
      if (!Number.isSafeInteger(rfq.requiredQty) || rfq.requiredQty <= 0) {
        throw new Error('RFQ quantity must be a positive integer.');
      }
      const supplierQuote = rfq.supplierQuotes.find(q => q.supplierId === supplierId);
      if (!supplierQuote) throw new Error('Supplier must have an actual quotation recorded for this RFQ.');
      if (!Number.isFinite(supplierQuote.unitCost) || supplierQuote.unitCost < 0) {
        throw new Error('Supplier quote must have a valid non-negative unit cost.');
      }
      const amount = Math.round(rfq.requiredQty * supplierQuote.unitCost * 100) / 100;
      if (!Number.isSafeInteger(Math.round(amount * 100))) throw new Error('Purchase order value exceeds safe numeric limits.');
      const id = crypto.randomUUID();
      rfq.preparedPO = {
        poReference: 'PO-DRAFT-' + id.slice(0, 12).toUpperCase(),
        supplierId,
        supplierName: supplierQuote.supplierName,
        qty: rfq.requiredQty,
        unitCost: supplierQuote.unitCost,
        amount,
        preparedAt: new Date().toISOString(),
        preparedBy,
        deliveryStatus: 'NOT_SENT'
      };
      rfq.status = 'PO_PREPARED';
      return rfq;
    });
  }

  // Field Jobs & P3.1 Inventory Consumption
  public addJob(job: FieldJob): FieldJob {
    return this.commit((draft) => {
      draft.jobs = [job, ...draft.jobs];
      return job;
    });
  }

  public updateJob(id: string, updates: Partial<FieldJob>): FieldJob | null {
    return this.commit((draft) => {
      const idx = draft.jobs.findIndex(j => j.id === id);
      if (idx === -1) return null;
      draft.jobs[idx] = { ...draft.jobs[idx], ...updates };
      return draft.jobs[idx];
    });
  }

  public consumeJobPart(
    jobId: string,
    productIdOrName: string,
    quantity: number = 1
  ): FieldJob | null {
    return this.commit((draft) => {
      // 1. Find actual job
      const job = draft.jobs.find(j => j.id === jobId);
      if (!job) {
        throw new Error(`Field job not found: ${jobId}`);
      }

      // 2. Validate quantity (positive integer)
      const qty = quantity;
      if (!Number.isSafeInteger(qty) || qty <= 0) {
        throw new Error(`Invalid consumption quantity: must be positive integer`);
      }

      // 3. Use only an exact, stable inventory product ID.
      const product = draft.products.find(p => p.id === productIdOrName);
      if (!product) {
        throw new Error(`Product not found in warehouse inventory: ${productIdOrName}`);
      }

      // 4. Check available unreserved stock
      const availableUnreserved = (product.stockAvailable || 0) - (product.stockReserved || 0);
      if (availableUnreserved < qty) {
        throw new Error(
          `Insufficient stock for ${product.name} (SKU: ${product.sku}). Available: ${availableUnreserved}, Requested: ${qty}`
        );
      }

      // 5. Deduct stock atomically
      const prevStock = product.stockAvailable;
      product.stockAvailable -= qty;

      // 6. Append matching job part with authoritative purchaseCost
      const authoritativeCost = product.purchaseCost || 0;
      job.partsConsumed.push({
        partName: product.name,
        qty,
        cost: authoritativeCost
      });

      // 7. Append inventory transaction
      const tx: InventoryTransaction = {
        id: `tx-${crypto.randomUUID()}`,
        tenantId: draft.tenant.id,
        productId: product.id,
        sku: product.sku,
        productName: product.name,
        type: 'OUT',
        qty,
        previousStock: prevStock,
        newStock: product.stockAvailable,
        reason: `Consumed on Field Job ${job.jobCode} (${job.customerName})`,
        referenceId: job.id,
        timestamp: new Date().toISOString()
      };
      draft.inventoryTransactions.push(tx);

      return job;
    });
  }

  // Projects & Milestones
  public addProject(project: Project): Project {
    return this.commit((draft) => {
      draft.projects = [project, ...draft.projects];
      return project;
    });
  }

  public updateProject(id: string, updates: Partial<Project>): Project | null {
    return this.commit((draft) => {
      const idx = draft.projects.findIndex(p => p.id === id);
      if (idx === -1) return null;
      draft.projects[idx] = { ...draft.projects[idx], ...updates };
      return draft.projects[idx];
    });
  }

  public updateProjectMilestone(projectId: string, milestoneId: string, updates: Partial<ProjectMilestone>): Project | null {
    return this.commit((draft) => {
      const project = draft.projects.find(p => p.id === projectId);
      if (!project) return null;
      const ms = project.milestones.find(m => m.id === milestoneId);
      if (!ms) return null;
      Object.assign(ms, updates);
      return project;
    });
  }

  // Events (Authoritative server audit log)
  public addEvent(event: AutonomousEvent): AutonomousEvent {
    return this.commit((draft) => {
      draft.events = [event, ...draft.events];
      return event;
    });
  }

  // Quotes (Strict exact ID matching, no .includes)
  public addQuote(quote: Quotation): Quotation {
    return this.commit((draft) => {
      draft.quotes = [quote, ...draft.quotes];
      return quote;
    });
  }

  public approveQuote(quoteId: string, actor: string = 'System Admin'): Quotation | null {
    return this.commit((draft) => {
      const q = draft.quotes.find(item => item.id === quoteId || item.quoteNumber === quoteId);
      if (!q) return null;
      if (q.status === 'APPROVED') {
        throw new Error(`Quotation ${q.quoteNumber} has already been approved.`);
      }
      q.status = 'APPROVED';
      q.approvedBy = actor;
      q.approvedAt = new Date().toISOString();
      return q;
    });
  }

  public rejectQuote(quoteId: string, reason?: string, actor: string = 'System Admin'): Quotation | null {
    return this.commit((draft) => {
      const q = draft.quotes.find(item => item.id === quoteId || item.quoteNumber === quoteId);
      if (!q) return null;
      q.status = 'REJECTED';
      if (reason) q.approvalReason = reason;
      q.approvedBy = actor;
      q.approvedAt = new Date().toISOString();
      return q;
    });
  }

  // Telegram
  public addTelegramMessage(msg: TelegramMessage): TelegramMessage {
    return this.commit((draft) => {
      draft.telegramMessages = [...draft.telegramMessages, msg];
      return msg;
    });
  }

  // Workflows
  public addWorkflow(wf: AutomationWorkflow): AutomationWorkflow {
    return this.commit((draft) => {
      draft.workflows = [wf, ...draft.workflows];
      return wf;
    });
  }

  public toggleWorkflow(id: string): AutomationWorkflow | null {
    return this.commit((draft) => {
      const wf = draft.workflows.find(w => w.id === id);
      if (!wf) return null;
      wf.active = !wf.active;
      return wf;
    });
  }

  public recordWorkflowExecution(id: string): AutomationWorkflow | null {
    return this.commit((draft) => {
      const wf = draft.workflows.find(w => w.id === id);
      if (!wf) return null;
      wf.executionCount += 1;
      wf.lastExecuted = new Date().toISOString();
      return wf;
    });
  }

  // P3.4 Persistent Collections (RMA, KB, CRM, Disputes)
  public addRMAClaim(claim: RMAClaim): RMAClaim {
    return this.commit((draft) => {
      draft.rmaClaims = [claim, ...draft.rmaClaims];
      return claim;
    });
  }

  public updateRMAClaim(id: string, updates: Partial<RMAClaim>): RMAClaim | null {
    return this.commit((draft) => {
      const idx = draft.rmaClaims.findIndex(c => c.id === id);
      if (idx === -1) return null;
      draft.rmaClaims[idx] = { ...draft.rmaClaims[idx], ...updates };
      return draft.rmaClaims[idx];
    });
  }

  public addKnowledgeArticle(article: KnowledgeArticle): KnowledgeArticle {
    return this.commit((draft) => {
      draft.knowledgeArticles = [article, ...draft.knowledgeArticles];
      return article;
    });
  }

  public updateKnowledgeArticle(id: string, updates: Partial<KnowledgeArticle>): KnowledgeArticle | null {
    return this.commit((draft) => {
      const idx = draft.knowledgeArticles.findIndex(a => a.id === id);
      if (idx === -1) return null;
      draft.knowledgeArticles[idx] = { ...draft.knowledgeArticles[idx], ...updates };
      return draft.knowledgeArticles[idx];
    });
  }

  public markKnowledgeArticleSolved(id: string): KnowledgeArticle | null {
    return this.commit((draft) => {
      const item = draft.knowledgeArticles.find(a => a.id === id);
      if (!item) return null;
      item.solvedCount = Math.max(0, item.solvedCount || 0) + 1;
      return item;
    });
  }

  public addCRMOpportunity(opp: CRMOpportunity): CRMOpportunity {
    return this.commit((draft) => {
      draft.crmOpportunities = [opp, ...draft.crmOpportunities];
      return opp;
    });
  }

  public updateCRMOpportunity(id: string, updates: Partial<CRMOpportunity>): CRMOpportunity | null {
    return this.commit((draft) => {
      const idx = draft.crmOpportunities.findIndex(o => o.id === id);
      if (idx === -1) return null;
      draft.crmOpportunities[idx] = { ...draft.crmOpportunities[idx], ...updates };
      return draft.crmOpportunities[idx];
    });
  }

  public addMarketplaceDispute(dispute: MarketplaceDispute): MarketplaceDispute {
    return this.commit((draft) => {
      draft.marketplaceDisputes = [dispute, ...draft.marketplaceDisputes];
      return dispute;
    });
  }

  public updateMarketplaceDispute(id: string, updates: Partial<MarketplaceDispute>): MarketplaceDispute | null {
    return this.commit((draft) => {
      const idx = draft.marketplaceDisputes.findIndex(d => d.id === id);
      if (idx === -1) return null;
      draft.marketplaceDisputes[idx] = { ...draft.marketplaceDisputes[idx], ...updates };
      return draft.marketplaceDisputes[idx];
    });
  }
}

export const dbStore = new PersistentStore();
