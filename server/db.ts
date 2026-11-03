import fs from 'fs';
import path from 'path';
import {
  initialProducts,
  initialLeads,
  initialQuotes,
  initialRFQs,
  initialITSMTickets,
  initialEndpoints,
  initialFieldJobs,
  initialAssets,
  initialLicenses,
  initialAMCs,
  initialProjects,
  initialProposals,
  initialEvents,
  initialWorkflows,
  initialIntegrations,
  initialTelegramMessages
} from '../src/data/mockData';
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
  TelegramMessage
} from '../src/types';

export const cleanTelegramMessages: TelegramMessage[] = [
  {
    id: 'msg-clean-init',
    sender: 'bot',
    text: '🤖 *Apex Autonomous IT Operating System Active*\n\nWorkspace initialized in *Clean Slate Mode* (0 mock records).\nAll enterprise modules are ready for your real-world operational data.',
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
];

export const cleanInitialEvents: AutonomousEvent[] = [
  {
    id: 'evt-clean-init',
    timestamp: new Date().toLocaleTimeString(),
    eventType: 'WorkspaceResetCleanSlate',
    agent: 'Telegram Orchestrator',
    summary: 'Platform workspace reset to Clean Slate (0 mock data). Ready for production operations.',
    autonomousActionTaken: 'Wiped all mock test records and initialized fresh production database context.',
    humanApprovalRequired: false,
    approvalStatus: 'AUTO_APPROVED',
    confidenceScore: 1.0
  }
];

export interface InvoiceRecord {
  customer: string;
  invoiceNo: string;
  amount: number;
  dueInDays: number;
  status: string;
  createdAt: string;
  gstin?: string;
}

export interface AppStoreState {
  isCleanSlate: boolean;
  products: ProductItem[];
  leads: Lead[];
  quotes: Quotation[];
  telegramMessages: TelegramMessage[];
  rfqs: RFQItem[];
  tickets: ITSMTicket[];
  endpoints: EndpointHealth[];
  jobs: FieldJob[];
  assets: AssetItem[];
  licenses: SoftwareLicense[];
  amcs: AMCContract[];
  projects: Project[];
  proposals: Proposal[];
  events: AutonomousEvent[];
  invoices: InvoiceRecord[];
  lastUpdated: string;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'app-store.json');

const initialMockInvoices: InvoiceRecord[] = [
  { customer: 'Nexus FinTech Labs', invoiceNo: 'INV-2026-0812', amount: 2407200, dueInDays: 4, status: 'DUE_SOON', createdAt: '2026-08-25', gstin: '27AABCN8192K1Z4' },
  { customer: 'Zenith Logistics', invoiceNo: 'INV-2026-0799', amount: 748828, dueInDays: -8, status: 'OVERDUE', createdAt: '2026-08-10', gstin: '27AABCT9921M1Z1' },
  { customer: 'OmniHealth Hospitals', invoiceNo: 'INV-2026-0750', amount: 1850000, dueInDays: 14, status: 'ACTIVE', createdAt: '2026-09-01', gstin: '27AABCO4142L1Z9' }
];

function getDefaultDemoState(): AppStoreState {
  return {
    isCleanSlate: false,
    products: [...initialProducts],
    leads: [...initialLeads],
    quotes: [...initialQuotes],
    telegramMessages: [...initialTelegramMessages],
    rfqs: [...initialRFQs],
    tickets: [...initialITSMTickets],
    endpoints: [...initialEndpoints],
    jobs: [...initialFieldJobs],
    assets: [...initialAssets],
    licenses: [...initialLicenses],
    amcs: [...initialAMCs],
    projects: [...initialProjects],
    proposals: [...initialProposals],
    events: [...initialEvents],
    invoices: [...initialMockInvoices],
    lastUpdated: new Date().toISOString()
  };
}

function getDefaultCleanState(): AppStoreState {
  return {
    isCleanSlate: true,
    products: [],
    leads: [],
    quotes: [],
    telegramMessages: [...cleanTelegramMessages],
    rfqs: [],
    tickets: [],
    endpoints: [],
    jobs: [],
    assets: [],
    licenses: [],
    amcs: [],
    projects: [],
    proposals: [],
    events: [...cleanInitialEvents],
    invoices: [],
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
        if (parsed && typeof parsed.isCleanSlate === 'boolean') {
          return parsed;
        }
      }
    } catch (err) {
      console.error('Error loading persistent store from disk:', err);
    }

    // Default to Demo mode if no prior store exists
    const defaultState = getDefaultDemoState();
    this.persistToDisk(defaultState);
    return defaultState;
  }

  private persistToDisk(stateToSave: AppStoreState) {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      stateToSave.lastUpdated = new Date().toISOString();
      fs.writeFileSync(DB_FILE, JSON.stringify(stateToSave, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to persist store to disk:', err);
    }
  }

  public getState(): AppStoreState {
    return this.state;
  }

  public reset(mode: 'clean' | 'demo'): AppStoreState {
    this.state = mode === 'clean' ? getDefaultCleanState() : getDefaultDemoState();
    this.persistToDisk(this.state);
    return this.state;
  }

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

  public addEndpoint(endpoint: EndpointHealth): EndpointHealth {
    this.state.endpoints = [endpoint, ...this.state.endpoints];
    this.persistToDisk(this.state);
    return endpoint;
  }

  public addAsset(asset: AssetItem): AssetItem {
    this.state.assets = [asset, ...this.state.assets];
    this.persistToDisk(this.state);
    return asset;
  }

  public addAMC(amc: AMCContract): AMCContract {
    this.state.amcs = [amc, ...this.state.amcs];
    this.persistToDisk(this.state);
    return amc;
  }

  public addInvoice(invoice: InvoiceRecord): InvoiceRecord {
    this.state.invoices = [invoice, ...this.state.invoices];
    this.persistToDisk(this.state);
    return invoice;
  }

  public settleInvoice(invoiceNo: string): InvoiceRecord | null {
    const inv = this.state.invoices.find(i => i.invoiceNo === invoiceNo);
    if (!inv) return null;
    inv.status = 'SETTLED';
    this.persistToDisk(this.state);
    return inv;
  }

  public addProposal(proposal: Proposal): Proposal {
    this.state.proposals = [proposal, ...this.state.proposals];
    this.persistToDisk(this.state);
    return proposal;
  }

  public addProduct(product: ProductItem): ProductItem {
    this.state.products = [product, ...this.state.products];
    this.persistToDisk(this.state);
    return product;
  }

  public addRFQ(rfq: RFQItem): RFQItem {
    this.state.rfqs = [rfq, ...this.state.rfqs];
    this.persistToDisk(this.state);
    return rfq;
  }

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

  public addEvent(event: AutonomousEvent): AutonomousEvent {
    this.state.events = [event, ...this.state.events];
    this.persistToDisk(this.state);
    return event;
  }

  public addQuote(quote: Quotation): Quotation {
    this.state.quotes = [quote, ...this.state.quotes];
    this.persistToDisk(this.state);
    return quote;
  }

  public addTelegramMessage(msg: TelegramMessage): TelegramMessage {
    this.state.telegramMessages = [...this.state.telegramMessages, msg];
    this.persistToDisk(this.state);
    return msg;
  }
}

export const dbStore = new PersistentStore();
