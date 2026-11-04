import 'dotenv/config';
import express from 'express';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import { dbStore, defaultConnectors } from './server/db';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

// Helper for Gemini initialization using modern @google/genai SDK
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.trim() === '') {
    return null;
  }
  try {
    return new GoogleGenAI({ apiKey });
  } catch (err) {
    console.error('Error initializing GoogleGenAI:', err);
    return null;
  }
}

// 1. Health check & configuration status
app.get('/api/health', (req, res) => {
  const state = dbStore.getState();
  const geminiConfigured = !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY';
  const telegramConfigured = !!process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN !== 'MY_TELEGRAM_BOT_TOKEN';

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    integrations: {
      gemini: geminiConfigured ? 'CONFIGURED' : 'NOT_CONFIGURED',
      telegram: telegramConfigured ? 'CONFIGURED' : 'NOT_CONFIGURED',
      payments: process.env.RAZORPAY_KEY_ID ? 'CONFIGURED' : 'NOT_CONFIGURED',
      gst: process.env.GST_API_KEY ? 'CONFIGURED' : 'NOT_CONFIGURED'
    },
    database: {
      status: 'ready',
      recordCounts: {
        products: state.products.length,
        quotes: state.quotes.length,
        invoices: state.invoices.length,
        tickets: state.tickets.length,
        jobs: state.jobs.length,
        assets: state.assets.length,
        projects: state.projects.length,
        events: state.events.length
      }
    }
  });
});

// --- Authentication & Tenant Management ---

app.get('/api/auth/me', (req, res) => {
  const users = dbStore.getUsers();
  const admin = users[0] || {
    id: 'usr-1',
    username: 'admin',
    name: 'Enterprise IT Administrator',
    email: 'admin@apex-it.internal',
    role: 'BUSINESS_OWNER',
    tenantId: dbStore.getState().tenant.id,
    createdAt: new Date().toISOString()
  };
  res.json({ success: true, user: admin, tenant: dbStore.getState().tenant });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username) {
    return res.status(400).json({ success: false, error: 'Username is required' });
  }
  const users = dbStore.getUsers();
  const user = users.find(u => u.username === username) || users[0];
  res.json({ success: true, user, token: `token_${Date.now()}` });
});

app.get('/api/tenant', (req, res) => {
  res.json({ success: true, data: dbStore.getState().tenant });
});

app.post('/api/tenant', (req, res) => {
  try {
    const { name, gstin, state, address, contactEmail, contactPhone, pan } = req.body;
    const updated = dbStore.updateTenant({
      name: name || dbStore.getState().tenant.name,
      gstin: gstin !== undefined ? gstin : dbStore.getState().tenant.gstin,
      state: state || dbStore.getState().tenant.state,
      address: address !== undefined ? address : dbStore.getState().tenant.address,
      contactEmail: contactEmail !== undefined ? contactEmail : dbStore.getState().tenant.contactEmail,
      contactPhone: contactPhone !== undefined ? contactPhone : dbStore.getState().tenant.contactPhone,
      pan: pan !== undefined ? pan : dbStore.getState().tenant.pan,
      isConfigured: true
    });

    dbStore.addEvent({
      id: `evt-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      eventType: 'TenantProfileUpdated',
      agent: 'Telegram Orchestrator',
      summary: `Updated organization settings for "${updated.name}" (GSTIN: ${updated.gstin || 'None'}).`,
      autonomousActionTaken: 'Reconfigured organization context across multi-tenant business engine.',
      humanApprovalRequired: false,
      approvalStatus: 'AUTO_APPROVED',
      confidenceScore: 1.0
    });

    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Full Application State
app.get('/api/state', (req, res) => {
  try {
    const state = dbStore.getState();
    res.json({ success: true, data: state });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Administrative Clean State Reset (Strictly Clean Slate, Zero Demo Data)
app.post('/api/state/reset', (req, res) => {
  try {
    const cleaned = dbStore.resetToCleanSlate();
    res.json({
      success: true,
      message: 'Workspace initialized in clean slate mode (0 records). Ready for production data.',
      data: cleaned
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Products CRUD
app.get('/api/products', (req, res) => {
  res.json({ success: true, data: dbStore.getState().products });
});

app.post('/api/products', (req, res) => {
  try {
    const prod = req.body;
    if (!prod || !prod.name || !prod.sku) {
      return res.status(400).json({ success: false, error: 'Product name and SKU are required' });
    }
    const created = dbStore.addProduct({
      ...prod,
      id: prod.id || `prod-${Date.now()}`
    });

    dbStore.addEvent({
      id: `evt-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      eventType: 'ProductCreatedInCatalog',
      agent: 'Procurement Agent',
      summary: `Registered SKU ${created.sku} (${created.name}) in warehouse catalog.`,
      autonomousActionTaken: 'Indexed product specs and safety thresholds in ERP store.',
      humanApprovalRequired: false,
      approvalStatus: 'AUTO_APPROVED',
      confidenceScore: 1.0
    });

    res.status(201).json({ success: true, data: created });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/products/:id', (req, res) => {
  try {
    const updated = dbStore.updateProduct(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/products/:id', (req, res) => {
  try {
    const deleted = dbStore.deleteProduct(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    res.json({ success: true, message: 'Product deleted' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Suppliers CRUD
app.get('/api/suppliers', (req, res) => {
  res.json({ success: true, data: dbStore.getState().suppliers });
});

app.post('/api/suppliers', (req, res) => {
  try {
    const supp = req.body;
    if (!supp || !supp.name) {
      return res.status(400).json({ success: false, error: 'Supplier name is required' });
    }
    const created = dbStore.addSupplier({
      ...supp,
      id: supp.id || `sup-${Date.now()}`
    });
    res.status(201).json({ success: true, data: created });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// RFQs CRUD
app.get('/api/rfqs', (req, res) => {
  res.json({ success: true, data: dbStore.getState().rfqs });
});

app.post('/api/rfqs', (req, res) => {
  try {
    const rfq = req.body;
    if (!rfq || !rfq.productName) {
      return res.status(400).json({ success: false, error: 'productName is required' });
    }
    const created = dbStore.addRFQ({
      ...rfq,
      id: rfq.id || `rfq-${Date.now()}`,
      supplierQuotes: rfq.supplierQuotes || [],
      status: 'OPEN'
    });

    dbStore.addEvent({
      id: `evt-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      eventType: 'ProcurementRFQInitiated',
      agent: 'Procurement Agent',
      summary: `Initiated procurement RFQ for ${created.productName} (Qty: ${created.requiredQty}).`,
      autonomousActionTaken: 'Registered request in procurement desk. Awaiting supplier quote entries.',
      humanApprovalRequired: false,
      approvalStatus: 'AUTO_APPROVED',
      confidenceScore: 0.98
    });

    res.status(201).json({ success: true, data: created });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/rfqs/:id/quotes', (req, res) => {
  try {
    const quote = req.body;
    if (!quote || !quote.supplierName || quote.unitCost === undefined) {
      return res.status(400).json({ success: false, error: 'supplierName and unitCost are required' });
    }
    const updated = dbStore.addSupplierQuoteToRFQ(req.params.id, quote);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'RFQ not found' });
    }
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/rfqs/:id/dispatch-po', (req, res) => {
  try {
    const { supplierId } = req.body;
    const updated = dbStore.dispatchPO(req.params.id, supplierId);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'RFQ not found' });
    }

    dbStore.addEvent({
      id: `evt-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      eventType: 'PurchaseOrderDispatched',
      agent: 'Procurement Agent',
      summary: `Dispatched Purchase Order for RFQ #${req.params.id} to supplier ID ${supplierId}.`,
      autonomousActionTaken: 'Updated RFQ status to PO_DISPATCHED in procurement ledger.',
      humanApprovalRequired: false,
      approvalStatus: 'AUTO_APPROVED',
      confidenceScore: 1.0
    });

    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Quotations CRUD
app.get('/api/quotes', (req, res) => {
  res.json({ success: true, data: dbStore.getState().quotes });
});

app.post('/api/quotes', (req, res) => {
  try {
    const quote = req.body;
    if (!quote || !quote.customerName) {
      return res.status(400).json({ success: false, error: 'customerName is required' });
    }
    const created = dbStore.addQuote({
      ...quote,
      id: quote.id || `quote-${Date.now()}`,
      quoteNumber: quote.quoteNumber || `QT-${Date.now().toString().slice(-6)}`,
      createdDate: quote.createdDate || new Date().toISOString().split('T')[0]
    });

    const isException = created.status === 'PENDING_OWNER_APPROVAL';
    dbStore.addEvent({
      id: `evt-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      eventType: isException ? 'MarginThresholdBreach' : 'QuotationGenerated',
      agent: 'Pricing Agent',
      summary: `Quotation ${created.quoteNumber} created for ${created.customerName} (${created.marginPercent}% margin, Total: ₹${created.totalAmount.toLocaleString('en-IN')}).`,
      autonomousActionTaken: isException ? 'Placed on hold for Owner authorization' : 'Ready for client delivery',
      humanApprovalRequired: isException,
      approvalStatus: isException ? 'PENDING_TELEGRAM' : 'AUTO_APPROVED',
      confidenceScore: 0.98
    });

    res.status(201).json({ success: true, data: created });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/quotes/:id/approve', (req, res) => {
  try {
    const approved = dbStore.approveQuote(req.params.id);
    if (!approved) {
      return res.status(404).json({ success: false, error: 'Quotation not found' });
    }

    dbStore.addEvent({
      id: `evt-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      eventType: 'OwnerExceptionAuthorized',
      agent: 'Telegram Orchestrator',
      summary: `Owner authorized concession on Quote ${approved.quoteNumber}.`,
      autonomousActionTaken: 'Quotation status updated to APPROVED in business ledger.',
      humanApprovalRequired: false,
      approvalStatus: 'AUTHORIZED',
      confidenceScore: 1.0
    });

    res.json({ success: true, data: approved });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/quotes/:id/reject', (req, res) => {
  try {
    const { reason } = req.body;
    const rejected = dbStore.rejectQuote(req.params.id, reason);
    if (!rejected) {
      return res.status(404).json({ success: false, error: 'Quotation not found' });
    }

    dbStore.addEvent({
      id: `evt-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      eventType: 'QuotationRejected',
      agent: 'Telegram Orchestrator',
      summary: `Quote ${rejected.quoteNumber} rejected: ${reason || 'Pricing threshold violation'}.`,
      autonomousActionTaken: 'Quotation marked REJECTED in database.',
      humanApprovalRequired: false,
      approvalStatus: 'REJECTED',
      confidenceScore: 1.0
    });

    res.json({ success: true, data: rejected });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Invoices CRUD
app.get('/api/invoices', (req, res) => {
  res.json({ success: true, data: dbStore.getState().invoices });
});

app.post('/api/invoices', (req, res) => {
  try {
    const inv = req.body;
    if (!inv || !inv.customer || !inv.amount) {
      return res.status(400).json({ success: false, error: 'Customer and amount are required' });
    }
    const created = dbStore.addInvoice({
      ...inv,
      id: inv.id || `inv-${Date.now()}`,
      invoiceNo: inv.invoiceNo || `INV-${Date.now().toString().slice(-6)}`,
      createdAt: inv.createdAt || new Date().toISOString().split('T')[0],
      status: inv.status || 'ACTIVE'
    });

    dbStore.addEvent({
      id: `evt-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      eventType: 'InvoiceCreated',
      agent: 'Pricing Agent',
      summary: `Created invoice ${created.invoiceNo} for ${created.customer} (Amount: ₹${created.amount.toLocaleString('en-IN')}).`,
      autonomousActionTaken: 'Saved invoice in receivables ledger.',
      humanApprovalRequired: false,
      approvalStatus: 'AUTO_APPROVED',
      confidenceScore: 1.0
    });

    res.status(201).json({ success: true, data: created });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/invoices/:invoiceNo/settle', (req, res) => {
  try {
    const settled = dbStore.settleInvoice(req.params.invoiceNo);
    if (!settled) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }

    dbStore.addEvent({
      id: `evt-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      eventType: 'InvoiceSettled',
      agent: 'Pricing Agent',
      summary: `Invoice ${settled.invoiceNo} (${settled.customer}) marked SETTLED in ledger.`,
      autonomousActionTaken: 'Excluded invoice from outstanding receivables balance.',
      humanApprovalRequired: false,
      approvalStatus: 'AUTO_APPROVED',
      confidenceScore: 1.0
    });

    res.json({ success: true, data: settled });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Tickets CRUD
app.get('/api/tickets', (req, res) => {
  res.json({ success: true, data: dbStore.getState().tickets });
});

app.post('/api/tickets', (req, res) => {
  try {
    const ticket = req.body;
    if (!ticket || !ticket.title) {
      return res.status(400).json({ success: false, error: 'Ticket title is required' });
    }
    const created = dbStore.addTicket({
      ...ticket,
      id: ticket.id || `tkt-${Date.now()}`,
      ticketNumber: ticket.ticketNumber || `INC-${Date.now().toString().slice(-6)}`,
      createdAt: ticket.createdAt || new Date().toISOString().split('T')[0],
      status: ticket.status || 'OPEN'
    });

    dbStore.addEvent({
      id: `evt-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      eventType: 'NewTicketLogged',
      agent: 'SLA Monitor',
      summary: `Logged incident ${created.ticketNumber} for ${created.requesterName}: "${created.title}".`,
      autonomousActionTaken: 'Indexed ticket context and evaluated SLA policy clock.',
      humanApprovalRequired: false,
      approvalStatus: 'AUTO_APPROVED',
      confidenceScore: 1.0
    });

    res.status(201).json({ success: true, data: created });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/tickets/:id', (req, res) => {
  try {
    const updated = dbStore.updateTicket(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    if (req.body.status === 'RESOLVED') {
      dbStore.addEvent({
        id: `evt-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        eventType: 'TicketResolved',
        agent: 'SLA Monitor',
        summary: `Incident ${updated.ticketNumber} marked RESOLVED.`,
        autonomousActionTaken: 'Recorded closure notes and stopped SLA clock in database.',
        humanApprovalRequired: false,
        approvalStatus: 'AUTO_APPROVED',
        confidenceScore: 1.0
      });
    }

    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoints CRUD
app.get('/api/endpoints', (req, res) => {
  res.json({ success: true, data: dbStore.getState().endpoints });
});

app.post('/api/endpoints', (req, res) => {
  try {
    const ep = req.body;
    if (!ep || !ep.deviceName) {
      return res.status(400).json({ success: false, error: 'deviceName is required' });
    }
    const created = dbStore.addEndpoint({
      ...ep,
      id: ep.id || `ep-${Date.now()}`,
      lastSeen: new Date().toISOString()
    });

    dbStore.addEvent({
      id: `evt-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      eventType: 'RMMAgentEnrolled',
      agent: 'SLA Monitor',
      summary: `Enrolled device ${created.deviceName} (${created.os}) in asset directory.`,
      autonomousActionTaken: 'Registered hardware identifiers in RMM directory.',
      humanApprovalRequired: false,
      approvalStatus: 'AUTO_APPROVED',
      confidenceScore: 1.0
    });

    res.status(201).json({ success: true, data: created });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Field Jobs CRUD
app.get('/api/jobs', (req, res) => {
  res.json({ success: true, data: dbStore.getState().jobs });
});

app.post('/api/jobs', (req, res) => {
  try {
    const job = req.body;
    if (!job || !job.title) {
      return res.status(400).json({ success: false, error: 'Job title is required' });
    }
    const created = dbStore.addJob({
      ...job,
      id: job.id || `job-${Date.now()}`,
      jobCode: job.jobCode || `JOB-${Date.now().toString().slice(-6)}`,
      status: job.status || 'SCHEDULED',
      partsConsumed: job.partsConsumed || []
    });

    dbStore.addEvent({
      id: `evt-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      eventType: 'FieldJobScheduled',
      agent: 'Telegram Orchestrator',
      summary: `Scheduled field service job ${created.jobCode} for ${created.customerName}: "${created.title}".`,
      autonomousActionTaken: 'Assigned technician and saved dispatch record in database.',
      humanApprovalRequired: false,
      approvalStatus: 'AUTO_APPROVED',
      confidenceScore: 1.0
    });

    res.status(201).json({ success: true, data: created });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/jobs/:id', (req, res) => {
  try {
    const updated = dbStore.updateJob(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/jobs/:id/consume-part', (req, res) => {
  try {
    const { partName, cost } = req.body;
    if (!partName) {
      return res.status(400).json({ success: false, error: 'partName is required' });
    }
    const updated = dbStore.consumeJobPart(req.params.id, partName, Number(cost) || 0);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Assets CRUD
app.get('/api/assets', (req, res) => {
  res.json({ success: true, data: dbStore.getState().assets });
});

app.post('/api/assets', (req, res) => {
  try {
    const asset = req.body;
    if (!asset || !asset.name) {
      return res.status(400).json({ success: false, error: 'Asset name is required' });
    }
    const created = dbStore.addAsset({
      ...asset,
      id: asset.id || `ast-${Date.now()}`,
      assetTag: asset.assetTag || `TAG-${Date.now().toString().slice(-6)}`
    });

    dbStore.addEvent({
      id: `evt-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      eventType: 'AssetRegisteredInCMDB',
      agent: 'Telegram Orchestrator',
      summary: `Registered asset ${created.assetTag} (${created.name}) in CMDB.`,
      autonomousActionTaken: 'Saved hardware record and warranty tracking timestamps.',
      humanApprovalRequired: false,
      approvalStatus: 'AUTO_APPROVED',
      confidenceScore: 1.0
    });

    res.status(201).json({ success: true, data: created });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/assets/:id', (req, res) => {
  try {
    const updated = dbStore.updateAsset(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Asset not found' });
    }
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Software Licenses CRUD
app.get('/api/licenses', (req, res) => {
  res.json({ success: true, data: dbStore.getState().licenses });
});

app.post('/api/licenses', (req, res) => {
  try {
    const lic = req.body;
    if (!lic || !lic.softwareName) {
      return res.status(400).json({ success: false, error: 'softwareName is required' });
    }
    const created = dbStore.addLicense({
      ...lic,
      id: lic.id || `lic-${Date.now()}`
    });
    res.status(201).json({ success: true, data: created });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/licenses/:id/reclaim', (req, res) => {
  try {
    const reclaimed = dbStore.reclaimLicense(req.params.id);
    if (!reclaimed) {
      return res.status(404).json({ success: false, error: 'License not found' });
    }

    dbStore.addEvent({
      id: `evt-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      eventType: 'SaaSSeatsReclaimed',
      agent: 'Procurement Agent',
      summary: `Reclaimed unused software seats in internal license registry for ${reclaimed.softwareName}.`,
      autonomousActionTaken: 'Updated license allocation record in database.',
      humanApprovalRequired: false,
      approvalStatus: 'AUTO_APPROVED',
      confidenceScore: 1.0
    });

    res.json({ success: true, data: reclaimed });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// AMC Contracts CRUD
app.get('/api/amcs', (req, res) => {
  res.json({ success: true, data: dbStore.getState().amcs });
});

app.post('/api/amcs', (req, res) => {
  try {
    const amc = req.body;
    if (!amc || !amc.clientName) {
      return res.status(400).json({ success: false, error: 'clientName is required' });
    }
    const created = dbStore.addAMC({
      ...amc,
      id: amc.id || `amc-${Date.now()}`,
      contractNumber: amc.contractNumber || `AMC-${Date.now().toString().slice(-6)}`
    });

    dbStore.addEvent({
      id: `evt-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      eventType: 'AMCContractRegistered',
      agent: 'Telegram Orchestrator',
      summary: `Registered ${created.type} AMC contract ${created.contractNumber} for ${created.clientName}.`,
      autonomousActionTaken: 'Recorded preventive maintenance schedules in service database.',
      humanApprovalRequired: false,
      approvalStatus: 'AUTO_APPROVED',
      confidenceScore: 1.0
    });

    res.status(201).json({ success: true, data: created });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Projects & Proposals (POST /api/projects WAS PREVIOUSLY MISSING!)
app.get('/api/projects', (req, res) => {
  res.json({ success: true, data: dbStore.getState().projects });
});

app.post('/api/projects', (req, res) => {
  try {
    const proj = req.body;
    if (!proj || !proj.title) {
      return res.status(400).json({ success: false, error: 'Project title is required' });
    }
    const created = dbStore.addProject({
      ...proj,
      id: proj.id || `proj-${Date.now()}`,
      projectCode: proj.projectCode || `PRJ-${Date.now().toString().slice(-6)}`,
      createdAt: proj.createdAt || new Date().toISOString().split('T')[0],
      milestones: proj.milestones || []
    });

    dbStore.addEvent({
      id: `evt-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      eventType: 'NewProjectPublished',
      agent: 'Sales Agent',
      summary: `Published project ${created.projectCode} ("${created.title}") in project marketplace.`,
      autonomousActionTaken: 'Created project milestone ledger and opened for proposals.',
      humanApprovalRequired: false,
      approvalStatus: 'AUTO_APPROVED',
      confidenceScore: 1.0
    });

    res.status(201).json({ success: true, data: created });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/projects/:id', (req, res) => {
  try {
    const updated = dbStore.updateProject(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/proposals', (req, res) => {
  res.json({ success: true, data: dbStore.getState().proposals });
});

app.post('/api/proposals', (req, res) => {
  try {
    const proposal = req.body;
    if (!proposal || !proposal.providerName || !proposal.projectId) {
      return res.status(400).json({ success: false, error: 'providerName and projectId are required' });
    }
    const created = dbStore.addProposal({
      ...proposal,
      id: proposal.id || `prop-${Date.now()}`,
      status: proposal.status || 'SUBMITTED'
    });

    // Update project proposal count
    const project = dbStore.getState().projects.find(p => p.id === proposal.projectId);
    if (project) {
      dbStore.updateProject(project.id, { proposalsCount: (project.proposalsCount || 0) + 1 });
    }

    res.status(201).json({ success: true, data: created });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/proposals/:id/accept', (req, res) => {
  try {
    const prop = dbStore.getState().proposals.find(p => p.id === req.params.id);
    if (!prop) {
      return res.status(404).json({ success: false, error: 'Proposal not found' });
    }
    const updated = dbStore.updateProposal(prop.id, { status: 'ACCEPTED' });
    if (prop.projectId) {
      dbStore.updateProject(prop.projectId, { status: 'IN_PROGRESS' });
    }

    dbStore.addEvent({
      id: `evt-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      eventType: 'ProjectProposalAwarded',
      agent: 'Pricing Agent',
      summary: `Awarded project bid to ${prop.providerName} (Bid: ₹${prop.commercialBid.toLocaleString('en-IN')}).`,
      autonomousActionTaken: 'Updated project status to IN_PROGRESS in database.',
      humanApprovalRequired: false,
      approvalStatus: 'AUTO_APPROVED',
      confidenceScore: 1.0
    });

    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Workflows CRUD
app.get('/api/workflows', (req, res) => {
  res.json({ success: true, data: dbStore.getState().workflows });
});

app.post('/api/workflows', (req, res) => {
  try {
    const wf = req.body;
    if (!wf || !wf.name) {
      return res.status(400).json({ success: false, error: 'Workflow name is required' });
    }
    const created = dbStore.addWorkflow({
      ...wf,
      id: wf.id || `wf-${Date.now()}`,
      active: true,
      executionCount: 0,
      lastExecuted: 'Never'
    });
    res.status(201).json({ success: true, data: created });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/workflows/:id/toggle', (req, res) => {
  try {
    const toggled = dbStore.toggleWorkflow(req.params.id);
    if (!toggled) {
      return res.status(404).json({ success: false, error: 'Workflow not found' });
    }
    res.json({ success: true, data: toggled });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/workflows/:id/execute', (req, res) => {
  try {
    const executed = dbStore.recordWorkflowExecution(req.params.id);
    if (!executed) {
      return res.status(404).json({ success: false, error: 'Workflow not found' });
    }

    dbStore.addEvent({
      id: `evt-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      eventType: 'WorkflowRuleExecuted',
      agent: 'Telegram Orchestrator',
      summary: `Rule "${executed.name}" executed against live domain state.`,
      autonomousActionTaken: executed.autonomousAction || 'Action executed successfully.',
      humanApprovalRequired: executed.humanApprovalRequired,
      approvalStatus: executed.humanApprovalRequired ? 'PENDING_TELEGRAM' : 'AUTO_APPROVED',
      confidenceScore: 1.0
    });

    res.json({ success: true, data: executed });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Connectors & Integrations
app.get('/api/connectors', (req, res) => {
  res.json({ success: true, data: dbStore.getState().connectors });
});

app.get('/api/integrations/status', (req, res) => {
  res.json({
    gemini: !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY',
    telegram: !!process.env.TELEGRAM_BOT_TOKEN,
    m365: !!process.env.M365_CLIENT_ID,
    payments: !!process.env.RAZORPAY_KEY_ID,
    gst: !!process.env.GST_API_KEY
  });
});

// Audit Events
app.get('/api/events', (req, res) => {
  res.json({ success: true, data: dbStore.getState().events });
});

app.post('/api/events', (req, res) => {
  try {
    const event = req.body;
    if (!event || !event.summary) {
      return res.status(400).json({ success: false, error: 'Event summary is required' });
    }
    const created = dbStore.addEvent({
      ...event,
      id: event.id || `evt-${Date.now()}`,
      timestamp: event.timestamp || new Date().toLocaleTimeString()
    });
    res.status(201).json({ success: true, data: created });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Telegram Live Webhook (Validates authentic tokens & transactions)
app.post('/api/telegram/webhook', (req, res) => {
  try {
    const secret = req.headers['x-telegram-bot-api-secret-token'];
    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

    if (expectedSecret && secret !== expectedSecret) {
      return res.status(401).json({ success: false, error: 'Unauthorized webhook secret' });
    }

    const update = req.body;
    if (!update) {
      return res.status(400).json({ success: false, error: 'Empty payload' });
    }

    if (update.callback_query) {
      const data = update.callback_query.data;
      const from = update.callback_query.from?.first_name || 'Owner';

      // Check if data is approving a specific quotation: approve_quote_<id>
      if (typeof data === 'string' && data.startsWith('approve_quote_')) {
        const quoteId = data.replace('approve_quote_', '');
        const approved = dbStore.approveQuote(quoteId);
        if (approved) {
          const newEvt = dbStore.addEvent({
            id: `evt-tlg-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString(),
            eventType: 'TelegramApprovalCallback',
            agent: 'Telegram Orchestrator',
            summary: `Owner ${from} approved quotation #${approved.quoteNumber} via Telegram callback.`,
            autonomousActionTaken: 'Marked quotation as APPROVED in database.',
            humanApprovalRequired: false,
            approvalStatus: 'AUTHORIZED',
            confidenceScore: 1.0
          });
          return res.json({ success: true, handled: 'approved', quoteNumber: approved.quoteNumber, eventId: newEvt.id });
        }
      }

      return res.json({ success: true, handled: 'callback_query' });
    }

    if (update.message && update.message.text) {
      const text = update.message.text;
      const user = update.message.from?.first_name || 'User';

      dbStore.addTelegramMessage({
        id: `tlg-${Date.now()}`,
        sender: 'owner',
        text: `[${user}] ${text}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });

      return res.json({ success: true, handled: 'message' });
    }

    res.json({ success: true, handled: 'ignored' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Payments: Honest, zero-mock integration status (Rejects fake payments)
app.post('/api/payments/create-order', (req, res) => {
  const hasGateway = !!process.env.RAZORPAY_KEY_ID && !!process.env.RAZORPAY_KEY_SECRET;
  if (!hasGateway) {
    return res.status(503).json({
      success: false,
      error: 'Payment gateway integration is not configured. Real payment orders cannot be created without valid RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET credentials in .env.'
    });
  }
  res.status(501).json({ success: false, error: 'Payment provider adapter initializing' });
});

app.post('/api/payments/verify', (req, res) => {
  const hasGateway = !!process.env.RAZORPAY_KEY_ID && !!process.env.RAZORPAY_KEY_SECRET;
  if (!hasGateway) {
    return res.status(503).json({
      success: false,
      error: 'Payment verification unavailable: Payment gateway credentials not configured. Fabricated verification is forbidden.'
    });
  }
  res.status(501).json({ success: false, error: 'Payment provider adapter initializing' });
});

// GST: Honest, zero-mock IRN generation (Rejects fake IRN generation)
app.post('/api/gst/generate-irn', (req, res) => {
  const hasGstCredentials = !!process.env.GST_API_KEY && !!process.env.GST_SELLER_GSTIN;
  if (!hasGstCredentials) {
    return res.status(503).json({
      success: false,
      error: 'GST e-invoicing integration is not configured. An internal invoice draft can be recorded in the ledger, but a legally verified government IRN cannot be fabricated without active IRP portal credentials.'
    });
  }
  res.status(501).json({ success: false, error: 'GST IRP adapter initializing' });
});

// 2. Real AI BOM & Solution Builder
app.post('/api/ai/bom-builder', async (req, res) => {
  const { requirement, budget, officeSize, preference } = req.body;
  const gemini = getGeminiClient();

  if (!gemini) {
    return res.status(503).json({
      success: false,
      error: 'Google Gemini AI is not configured. Please add GEMINI_API_KEY to your environment variables to use AI solution architecting, or assemble items manually from your product catalog.'
    });
  }

  try {
    const catalogProducts = dbStore.getState().products;
    const catalogContext = catalogProducts.length > 0
      ? `Existing verified catalog products:\n${JSON.stringify(catalogProducts.map(p => ({ sku: p.sku, name: p.name, category: p.category, purchaseCost: p.purchaseCost, sellingPrice: p.sellingPrice, stockAvailable: p.stockAvailable })))}`
      : 'Note: Product catalog currently has 0 registered products. Provide recommended industry-standard enterprise hardware specifications.';

    const prompt = `You are a Principal Enterprise IT Solutions Architect and Chief Technical Officer.
Analyze this client requirement: "${requirement || 'Office setup'}".
Office details: ${officeSize ? officeSize + ' users' : 'Enterprise users'}, Budget: ${budget || 'Flexible'}, Preference: ${preference || 'Enterprise grade'}.
${catalogContext}

Generate a comprehensive IT Bill of Materials (BOM) in STRICT valid JSON format only without markdown blocks.
The JSON must follow this exact structure:
{
  "solutionName": "string",
  "category": "Office Setup | Server Infrastructure | Networking | Call Center",
  "summary": "string explaining the architecture",
  "compatibilityStatus": "VERIFIED_COMPATIBLE | CONDITIONAL | INCOMPATIBLE",
  "compatibilityNotes": "detailed validation notes (e.g., PSU wattage headroom, Switch PoE budget, CPU socket & RAM speed compatibility)",
  "recommendedMargin": 16.5,
  "items": [
    {
      "id": "item-1",
      "category": "Desktop | Laptop | Server | Networking | Power | Peripheral | Component",
      "sku": "SKU-CODE",
      "name": "Full product name with key specs",
      "brand": "Dell | HP | Lenovo | Cisco | Ubiquiti | APC | Fortinet",
      "specs": "Detailed spec",
      "qty": 10,
      "purchaseCost": 45000,
      "sellingPrice": 52500,
      "warrantyYears": 3,
      "hsn": "84713010",
      "gstPercent": 18
    }
  ],
  "servicesIncluded": [
    {
      "name": "Network & Firewall Deployment",
      "price": 25000,
      "sla": "48 Hours"
    }
  ],
  "autonomousNextSteps": [
    "string action 1",
    "string action 2"
  ]
}`;

    const aiResponse = await gemini.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
      contents: prompt,
    });

    const text = aiResponse.text || '';
    const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanJson);
    return res.json({ success: true, source: 'gemini', data: parsed });
  } catch (error: any) {
    console.error('Gemini BOM generation error:', error);
    return res.status(500).json({
      success: false,
      error: `Gemini AI failed to generate BOM: ${error.message || 'Unknown error'}. Please try again or build the BOM manually.`
    });
  }
});

// 3. Real AI Telegram Command & Natural Language Interface
app.post('/api/ai/telegram-command', async (req, res) => {
  const { command } = req.body;
  const state = dbStore.getState();

  // Compute live, genuine database metrics
  const quotes = state.quotes;
  const invoices = state.invoices;
  const products = state.products;
  const tickets = state.tickets;

  const totalClosedRevenue = invoices
    .filter(i => i.status === 'SETTLED')
    .reduce((acc, i) => acc + i.amount, 0);

  const pendingReceivables = invoices
    .filter(i => i.status !== 'SETTLED')
    .reduce((acc, i) => acc + i.amount, 0);

  const pendingApprovals = quotes.filter(q => q.status === 'PENDING_OWNER_APPROVAL');
  const lowStockProducts = products.filter(p => p.stockAvailable <= 2);
  const openTickets = tickets.filter(t => t.status !== 'RESOLVED');

  const gemini = getGeminiClient();

  if (gemini) {
    try {
      const liveContext = {
        organizationName: state.tenant.name,
        currency: state.tenant.currency,
        totalPaidRevenue: `₹${totalClosedRevenue.toLocaleString('en-IN')}`,
        outstandingReceivables: `₹${pendingReceivables.toLocaleString('en-IN')}`,
        pendingApprovalsCount: pendingApprovals.length,
        pendingApprovalsList: pendingApprovals.map(q => ({ quoteNo: q.quoteNumber, customer: q.customerName, amount: q.totalAmount, margin: q.marginPercent })),
        lowStockItems: lowStockProducts.map(p => ({ sku: p.sku, name: p.name, available: p.stockAvailable })),
        openTicketsCount: openTickets.length,
        totalCatalogItems: products.length
      };

      const prompt = `You are the Telegram Autonomous Business OS Assistant for "${state.tenant.name}".
The Business Owner sent this command or query in Telegram: "${command}".
Authoritative Live Database State (NO FAKE DATA - STATED TRUTHS ONLY):
${JSON.stringify(liveContext, null, 2)}

Instructions:
1. State facts strictly based on the provided database state. If there are 0 records, clearly say no records exist yet.
2. If the user asks about revenue or profit, use the live numbers (total paid revenue: ₹${totalClosedRevenue.toLocaleString('en-IN')}). If 0, say ₹0.00.
3. If they ask about pending quotes, list the actual pending approvals if any.
4. Format in crisp Telegram markdown with clear call to actions.`;

      const aiResponse = await gemini.models.generateContent({
        model: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
        contents: prompt,
      });

      return res.json({ success: true, text: aiResponse.text });
    } catch (err: any) {
      console.warn('Gemini Telegram command error:', err);
    }
  }

  // Deterministic live handler using genuine database state
  const text = (command || '').toLowerCase();
  let reply = '';
  let actions: string[] = [];

  if (text.includes('profit') || text.includes('revenue') || text.includes('sales')) {
    reply = `📊 *Executive Financial Summary:*\n\n` +
      `• *Settled Revenue:* ₹${totalClosedRevenue.toLocaleString('en-IN')}\n` +
      `• *Outstanding Receivables:* ₹${pendingReceivables.toLocaleString('en-IN')}\n` +
      `• *Catalog Inventory Count:* ${products.length} registered products\n` +
      `• *Active Invoices:* ${invoices.length} invoices in ledger`;
    actions = ['/dashboard', '/quotes'];
  } else if (text.includes('pending') || text.includes('approval')) {
    if (pendingApprovals.length === 0) {
      reply = `✅ *No Pending Approvals:*\n\nAll quotations and orders are within standard policy thresholds. 0 approvals required.`;
    } else {
      reply = `🔔 *${pendingApprovals.length} Pending Owner Approvals:*\n\n` +
        pendingApprovals.map((q, idx) => `${idx + 1}️⃣ *Quote #${q.quoteNumber}* — ${q.customerName}\n   • Amount: ₹${q.totalAmount.toLocaleString('en-IN')} | Margin: *${q.marginPercent}%* (Floor: 12.0%)`).join('\n\n') +
        `\n\n_Reply with "Approve Quote <number>" to authorize._`;
      actions = pendingApprovals.slice(0, 3).map(q => `Approve ${q.quoteNumber}`);
    }
  } else if (text.includes('stock') || text.includes('inventory')) {
    if (products.length === 0) {
      reply = `📦 *Inventory Status:*\n\nNo products are registered in your warehouse catalog yet. Add products in the Inventory & Procurement module.`;
    } else if (lowStockProducts.length === 0) {
      reply = `📦 *Inventory Status:*\n\nAll ${products.length} registered products have adequate stock levels. No critical shortages.`;
    } else {
      reply = `🚨 *Stock Shortage Alert (${lowStockProducts.length} items):*\n\n` +
        lowStockProducts.map(p => `• *${p.name}:* ${p.stockAvailable} units available (SKU: ${p.sku})`).join('\n');
      actions = ['Create RFQ'];
    }
  } else {
    reply = `🤖 *Autonomous IT Operating System Telegram Hub*\n\n` +
      `Tenant: *${state.tenant.name}*\n` +
      `Available real-time data commands:\n` +
      `• \`/dashboard\` - Live cash position & catalog counts\n` +
      `• \`/pending\` - Inspect quotations awaiting authorization (${pendingApprovals.length} pending)\n` +
      `• \`/stock\` - Check low-stock alerts\n` +
      `• Or query your live operational database directly.`;
    actions = ['/dashboard', '/pending', '/stock'];
  }

  return res.json({ success: true, text: reply, actions });
});

// 4. Real AI Copilot Endpoint (Executive Dashboard)
app.post('/api/ai/copilot', async (req, res) => {
  const { query } = req.body;
  const gemini = getGeminiClient();
  const state = dbStore.getState();

  if (!gemini) {
    return res.status(503).json({
      success: false,
      error: 'Google Gemini API is not configured. Add GEMINI_API_KEY to environment variables for AI Copilot.'
    });
  }

  try {
    const liveStats = {
      tenantName: state.tenant.name,
      totalCatalogProducts: state.products.length,
      totalAssets: state.assets.length,
      activeAMCs: state.amcs.length,
      openTickets: state.tickets.filter(t => t.status !== 'RESOLVED').length,
      criticalIncidents: state.tickets.filter(t => t.priority === 'CRITICAL' && t.status !== 'RESOLVED').length,
      unsettledInvoicesAmount: state.invoices.filter(i => i.status !== 'SETTLED').reduce((acc, i) => acc + i.amount, 0),
      totalQuotes: state.quotes.length
    };

    const prompt = `You are the Chief Information Officer AI Copilot for "${state.tenant.name}".
The user asked: "${query}".
Live Authoritative Database Context (Zero Hallucination - Never invent numbers not in this data):
${JSON.stringify(liveStats, null, 2)}

Provide a strict, factual, professional answer in JSON format:
{
  "answer": "Clear explanation based strictly on the live numbers above",
  "metrics": [
    { "label": "string", "value": "string" }
  ]
}`;

    const aiResponse = await gemini.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
      contents: prompt,
    });

    const text = aiResponse.text || '';
    const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanJson);
    return res.json({ success: true, data: parsed });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Copilot query failed' });
  }
});

// 5. Real AI IT Diagnosis & Problem Solver
app.post('/api/ai/diagnosis', async (req, res) => {
  const { symptom, deviceType, urgency } = req.body;
  const gemini = getGeminiClient();

  if (!gemini) {
    return res.status(503).json({
      success: false,
      error: 'Google Gemini AI is not configured. Please set GEMINI_API_KEY in your environment to use AI IT Diagnostics.'
    });
  }

  try {
    const prompt = `You are a Principal Enterprise IT Systems Support Specialist.
Diagnose this genuine reported issue: "${symptom}". Device: ${deviceType || 'Laptop/Desktop'}. Urgency: ${urgency || 'Normal'}.
Respond in strict JSON only without markdown formatting:
{
  "diagnosisSummary": "string",
  "rootCauseHypothesis": ["string", "string"],
  "recommendedFixLevel": "L1_REMOTE | L2_ON_SITE | HARDWARE_REPLACEMENT",
  "estimatedTimeMinutes": 45,
  "requiredParts": [{"partName": "string", "cost": 3500}],
  "slaResponseHours": 2,
  "selfFixSteps": ["Step 1", "Step 2"]
}`;

    const aiResponse = await gemini.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
      contents: prompt,
    });

    const text = aiResponse.text || '';
    const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanJson);
    return res.json({ success: true, data: parsed });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'AI Diagnosis failed' });
  }
});

// Production static serving vs Dev Vite middleware
async function setupVite() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Apex Autonomous IT Hardware & Services OS running on http://0.0.0.0:${PORT}`);
  });
}

setupVite().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
