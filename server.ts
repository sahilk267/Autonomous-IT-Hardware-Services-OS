import 'dotenv/config';
import express from 'express';
import path from 'path';
import crypto from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import { dbStore, defaultConnectors, hashPassword, verifyPassword } from './server/db.ts';
import { UserRole } from './src/types.ts';

const app = express();

function resolvePort(): number {
  const portArgIndex = process.argv.indexOf('--port');
  if (portArgIndex !== -1 && process.argv[portArgIndex + 1]) {
    const parsed = Number(process.argv[portArgIndex + 1]);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  // Development server must always listen on port 3000 (port 8080 is reserved for reverse proxy)
  if (process.env.NODE_ENV !== 'production') {
    return 3000;
  }
  return Number(process.env.PORT) || 3000;
}

const PORT = resolvePort();

app.use(express.json({ limit: '1mb' }));

// Browser-origin CSRF defense for state-changing API requests. Telegram webhooks
// use a separate authenticated integration secret and are not browser sessions.
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (origin) {
    try {
      const host = req.get('x-forwarded-host') || req.get('host');
      if (!host || new URL(origin).host !== host) {
        return res.status(403).json({ success: false, error: 'Cross-origin mutation rejected.' });
      }
    } catch {
      return res.status(403).json({ success: false, error: 'Malformed request origin.' });
    }
  }
  next();
});

function setSessionCookie(res: express.Response, token: string, clear = false) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie',
    `apex_session=${token}; Path=/; HttpOnly; SameSite=Strict${secure}; Max-Age=${clear ? 0 : 86400}`);
}

// Cookie parser helper
function parseCookies(cookieHeader?: string): Record<string, string> {
  const list: Record<string, string> = {};
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    const name = parts.shift()?.trim();
    if (name) {
      list[name] = decodeURIComponent(parts.join('='));
    }
  });
  return list;
}

function getSessionToken(req: express.Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }
  const cookies = parseCookies(req.headers.cookie);
  if (cookies.apex_session) {
    return cookies.apex_session;
  }
  return null;
}

// Security Middleware: Require Authenticated Session
function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = getSessionToken(req);
  if (!token) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Authentication session required' });
  }
  const session = dbStore.getSession(token);
  if (!session) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Session invalid or expired' });
  }
  (req as any).user = session;
  next();
}

// Security Middleware: Role-Based Authorization
function requireRole(...roles: UserRole[]) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const user = (req as any).user;
    if (!user || !roles.includes(user.role)) {
      return res.status(403).json({ success: false, error: 'Forbidden: Insufficient privileges for this operation' });
    }
    next();
  };
}

const ROLE_READ_COLLECTIONS: Record<UserRole, readonly string[]> = {
  BUSINESS_OWNER: ['products','leads','quotes','telegramMessages','suppliers','rfqs','tickets','endpoints','jobs','assets','licenses','amcs','projects','proposals','providers','events','invoices','workflows','connectors','rmaClaims','knowledgeArticles','crmOpportunities','marketplaceDisputes','inventoryTransactions'],
  SALES_MANAGER: ['products','leads','quotes','projects','proposals','crmOpportunities','knowledgeArticles'],
  PROCUREMENT_LEAD: ['products','suppliers','rfqs','quotes','projects','assets','inventoryTransactions'],
  ENTERPRISE_IT_HEAD: ['tickets','endpoints','jobs','assets','licenses','amcs','projects','proposals','rmaClaims','knowledgeArticles'],
  FIELD_ENGINEER: ['products','tickets','endpoints','jobs','assets','rmaClaims','knowledgeArticles']
};
// Collection-level isolation within the current single-tenant instance only.
// This does not implement per-customer / multi-tenant row-level authorization.

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

// --- Public Endpoints ---

// 1. Health check & configuration status (Safe public endpoint - NO confidential business or PII leak)
// Public liveness check: no business record counts or integration configuration leak.
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth Status (Check if first-time administrator enrollment is needed)
app.get('/api/auth/status', (req, res) => {
  const users = dbStore.getUsers();
  const token = getSessionToken(req);
  const session = token ? dbStore.getSession(token) : null;
  res.json({
    success: true,
    needsSetup: users.length === 0,
    setupRequired: users.length === 0,
    authenticated: !!session,
    user: session ? {
      id: session.userId,
      username: session.username,
      role: session.role
    } : null
  });
});

// First-time administrator enrollment (Allowed ONLY when users.length === 0)
app.post('/api/auth/setup', (req, res) => {
  try {
    const users = dbStore.getUsers();
    if (users.length > 0) {
      return res.status(403).json({ success: false, error: 'Initial administrator enrollment is already completed.' });
    }
    const setupSecret = process.env.APEX_INITIAL_SETUP_TOKEN;
    if (process.env.NODE_ENV === 'production' && !setupSecret) {
      return res.status(503).json({ success: false, error: 'Set APEX_INITIAL_SETUP_TOKEN in the server environment before first administrator setup.' });
    }
    if (setupSecret && req.body?.setupToken !== setupSecret) {
      return res.status(403).json({ success: false, error: 'Invalid administrator setup token.' });
    }
    const { username, password, name, email } = req.body;
    if (!username || typeof username !== 'string' || username.trim().length < 3) {
      return res.status(400).json({ success: false, error: 'Username must be at least 3 characters.' });
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ success: false, error: 'Password must be at least 8 characters.' });
    }

    const { salt, hash } = hashPassword(password);
    const newUser = {
      id: `usr-${crypto.randomUUID()}`,
      username: username.trim(),
      name: name?.trim() || 'System Administrator',
      email: email?.trim() || `${username.trim()}@apex-it.internal`,
      role: 'BUSINESS_OWNER' as UserRole,
      tenantId: dbStore.getState().tenant.id,
      createdAt: new Date().toISOString(),
      salt,
      passwordHash: hash
    };

    dbStore.addUser(newUser);
    const session = dbStore.createSession(newUser.id, newUser.username, newUser.role);
    setSessionCookie(res, session.token);
    res.status(201).json({
      success: true,
      user: {
        id: newUser.id,
        username: newUser.username,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        tenantId: newUser.tenantId
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Secure Login (scrypt KDF verification)
app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password are required.' });
    }
    const user = dbStore.getUserByUsername(username);
    if (!user || !user.salt || !user.passwordHash) {
      return res.status(401).json({ success: false, error: 'Invalid username or password.' });
    }
    const isValid = verifyPassword(password, user.salt, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ success: false, error: 'Invalid username or password.' });
    }

    const session = dbStore.createSession(user.id, user.username, user.role);
    setSessionCookie(res, session.token);
    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Protected Authentication & Tenant Endpoints ---

app.get('/api/auth/me', requireAuth, (req, res) => {
  const session = (req as any).user;
  const user = dbStore.getUserById(session.userId);
  if (!user || !user.passwordHash || !user.salt) {
    return res.status(401).json({ success: false, error: 'User account no longer valid.' });
  }
  res.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId
    },
    tenant: dbStore.getState().tenant
  });
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  const token = getSessionToken(req);
  if (token) {
    dbStore.deleteSession(token);
  }
  setSessionCookie(res, '', true);
  res.json({ success: true, message: 'Logged out successfully.' });
});

app.get('/api/tenant', requireAuth, (req, res) => {
  res.json({ success: true, data: dbStore.getState().tenant });
});

app.post('/api/tenant', requireAuth, requireRole('BUSINESS_OWNER'), (req, res) => {
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
      id: `evt-${crypto.randomUUID()}`,
      timestamp: new Date().toLocaleTimeString(),
      eventType: 'TenantProfileUpdated',
      agent: (req as any).user?.username || 'Admin',
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

// Full Application State (Protected - secrets and password hashes stripped)
app.get('/api/state', requireAuth, (req, res) => {
  try {
    const rawState = dbStore.getState();
    const actor = (req as any).user as { userId: string; role: UserRole };
    const allowed = new Set(ROLE_READ_COLLECTIONS[actor.role] || []);
    const safeUsers = rawState.users
      .filter(u => actor.role === 'BUSINESS_OWNER' || u.id === actor.userId)
      .map(({ passwordHash, salt, ...u }) => u);
    const safeState: Record<string, unknown> = { ...rawState, users: safeUsers };
    delete safeState.sessions;
    delete safeState.processedTelegramUpdateIds;
    for (const [key, value] of Object.entries(safeState)) {
      if (Array.isArray(value) && key !== 'users' && !allowed.has(key)) safeState[key] = [];
    }
    res.json({ success: true, data: safeState });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Administrative Clean State Reset (Protected, requires BUSINESS_OWNER + explicit confirmation)
app.post('/api/state/reset', requireAuth, requireRole('BUSINESS_OWNER'), (req, res) => {
  if (process.env.NODE_ENV === 'production' && process.env.APEX_ALLOW_PRODUCTION_RESET !== 'true') {
    return res.status(403).json({ success: false, error: 'Production reset is disabled. Explicit server-side authorization required.' });
  }
  try {
    const confirm = req.body?.confirm === true || req.headers['x-apex-confirm-reset'] === 'true';
    if (!confirm) {
      return res.status(400).json({
        success: false,
        error: 'Confirmation required. Must provide { confirm: true } in body or X-Apex-Confirm-Reset header.'
      });
    }
    const cleaned = dbStore.resetToCleanSlate();
    res.json({
      success: true,
      message: 'Workspace initialized in clean slate mode (0 business records).',
      data: cleaned
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Products CRUD (Protected)
app.get('/api/products', requireAuth, requireRole('BUSINESS_OWNER', 'SALES_MANAGER', 'PROCUREMENT_LEAD', 'FIELD_ENGINEER'), (req, res) => {
  res.json({ success: true, data: dbStore.getState().products });
});

app.post('/api/products', requireAuth, requireRole('BUSINESS_OWNER', 'PROCUREMENT_LEAD'), (req, res) => {
  try {
    const prod = req.body;
    if (!prod || !prod.name || !prod.sku) {
      return res.status(400).json({ success: false, error: 'Product name and SKU are required' });
    }
    const created = dbStore.addProduct({
      ...prod,
      id: prod.id || `prod-${crypto.randomUUID()}`
    });

    dbStore.addEvent({
      id: `evt-${crypto.randomUUID()}`,
      timestamp: new Date().toLocaleTimeString(),
      eventType: 'ProductCreatedInCatalog',
      agent: (req as any).user?.username || 'Procurement',
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

app.patch('/api/products/:id', requireAuth, requireRole('BUSINESS_OWNER', 'PROCUREMENT_LEAD'), (req, res) => {
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

app.delete('/api/products/:id', requireAuth, requireRole('BUSINESS_OWNER', 'PROCUREMENT_LEAD'), (req, res) => {
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

// Suppliers CRUD (Protected)
app.get('/api/suppliers', requireAuth, requireRole('BUSINESS_OWNER', 'SALES_MANAGER', 'PROCUREMENT_LEAD'), (req, res) => {
  res.json({ success: true, data: dbStore.getState().suppliers });
});

app.post('/api/suppliers', requireAuth, requireRole('BUSINESS_OWNER', 'PROCUREMENT_LEAD'), (req, res) => {
  try {
    const supp = req.body;
    if (!supp || !supp.name) {
      return res.status(400).json({ success: false, error: 'Supplier name is required' });
    }
    const created = dbStore.addSupplier({
      ...supp,
      id: supp.id || `sup-${crypto.randomUUID()}`
    });
    res.status(201).json({ success: true, data: created });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// RFQs CRUD (Protected)
app.get('/api/rfqs', requireAuth, requireRole('BUSINESS_OWNER', 'PROCUREMENT_LEAD'), (req, res) => {
  res.json({ success: true, data: dbStore.getState().rfqs });
});

app.post('/api/rfqs', requireAuth, requireRole('BUSINESS_OWNER', 'PROCUREMENT_LEAD'), (req, res) => {
  try {
    const rfq = req.body;
    if (!rfq || !rfq.productName) {
      return res.status(400).json({ success: false, error: 'productName is required' });
    }
    const created = dbStore.addRFQ({
      ...rfq,
      id: rfq.id || `rfq-${Date.now().toString().slice(-6)}`,
      supplierQuotes: rfq.supplierQuotes || [],
      status: 'OPEN'
    });

    dbStore.addEvent({
      id: `evt-${crypto.randomUUID()}`,
      timestamp: new Date().toLocaleTimeString(),
      eventType: 'ProcurementRFQInitiated',
      agent: (req as any).user?.username || 'Procurement',
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

app.post('/api/rfqs/:id/quotes', requireAuth, requireRole('BUSINESS_OWNER', 'PROCUREMENT_LEAD'), (req, res) => {
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

// Legacy route path retained for existing UI; only PREPARES a PO.
app.post('/api/rfqs/:id/dispatch-po', requireAuth, requireRole('BUSINESS_OWNER', 'PROCUREMENT_LEAD'), (req, res) => {
  try {
    const supplierId = typeof req.body?.supplierId === 'string' ? req.body.supplierId.trim() : '';
    if (!supplierId) return res.status(400).json({ success: false, error: 'An actual quoted supplierId is required.' });
    const updated = dbStore.preparePO(req.params.id, supplierId, (req as any).user.username);
    if (!updated) return res.status(404).json({ success: false, error: 'RFQ not found.' });
    dbStore.addEvent({
      id: `evt-${crypto.randomUUID()}`,
      timestamp: new Date().toISOString(),
      eventType: 'PurchaseOrderPreparedInternally',
      agent: (req as any).user.username,
      summary: `Internal PO ${updated.preparedPO?.poReference} prepared for ${updated.preparedPO?.supplierName}; not sent.`,
      autonomousActionTaken: 'Recorded supplier selection and PO preparation in internal ledger only.',
      humanApprovalRequired: false,
      approvalStatus: 'AUTO_APPROVED',
      confidenceScore: 1
    });
    return res.json({ success: true, data: updated, delivery: 'NOT_SENT' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

// Quotations CRUD (Protected, P3.2 Server-side Recalculation)
app.get('/api/quotes', requireAuth, requireRole('BUSINESS_OWNER', 'SALES_MANAGER', 'PROCUREMENT_LEAD'), (req, res) => {
  res.json({ success: true, data: dbStore.getState().quotes });
});

app.post('/api/quotes', requireAuth, requireRole('BUSINESS_OWNER', 'SALES_MANAGER'), (req, res) => {
  try {
    const quote = req.body || {};
    if (typeof quote.customerName !== 'string' || !quote.customerName.trim()) {
      return res.status(400).json({ success: false, error: 'A real customer name is required.' });
    }
    const items = Array.isArray(quote.items) ? quote.items : [];
    const services = Array.isArray(quote.services) ? quote.services : [];
    if (items.length + services.length === 0) {
      return res.status(400).json({ success: false, error: 'Quotation requires an item or service.' });
    }
    const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
    const catalog = dbStore.getState().products;
    const taxLines: { lineId: string; gross: number; hsnOrSac: string; rate: number | null }[] = [];
    let subtotal = 0;
    let totalCost = 0;
    for (const [i, item] of items.entries()) {
      const qty = item.qty, selling = item.sellingPrice, requestedCost = item.purchaseCost;
      if (!Number.isSafeInteger(qty) || qty <= 0 ||
          !Number.isFinite(selling) || selling < 0 ||
          !Number.isFinite(requestedCost) || requestedCost < 0) {
        return res.status(400).json({ success: false, error: 'Invalid quantity, selling price or cost.' });
      }
      const registered = item.productId ? catalog.find(p => p.id === item.productId) : undefined;
      if (item.productId && !registered) {
        return res.status(400).json({ success: false, error: 'Referenced catalog productId not found.' });
      }
      const cost = registered ? registered.purchaseCost : requestedCost;
      if (!Number.isFinite(cost) || cost < 0) {
        return res.status(400).json({ success: false, error: 'Product cost is invalid.' });
      }
      const rate = registered?.gstPercent ?? item.gstPercent;
      if (rate != null && rate !== -1 && (!Number.isFinite(rate) || rate < 0 || rate > 100)) {
        return res.status(400).json({ success: false, error: 'Invalid product tax rate; verify HSN classification.' });
      }
      const gross = round2(qty * selling);
      subtotal += gross;
      totalCost += qty * cost;
      taxLines.push({
        lineId: typeof item.id === 'string' && item.id ? item.id : 'item-' + i,
        gross,
        hsnOrSac: String(registered?.hsn ?? item.hsn ?? '').trim(),
        rate: rate == null || rate === -1 ? null : rate
      });
    }
    for (const [i, service] of services.entries()) {
      if (!Number.isFinite(service.price) || service.price < 0) {
        return res.status(400).json({ success: false, error: 'Service price must be non-negative.' });
      }
      const rate = service.gstPercent;
      if (rate != null && (!Number.isFinite(rate) || rate < 0 || rate > 100)) {
        return res.status(400).json({ success: false, error: 'Invalid service tax rate; verify SAC classification.' });
      }
      const gross = round2(service.price);
      subtotal += gross;
      taxLines.push({
        lineId: typeof service.id === 'string' && service.id ? service.id : 'service-' + i,
        gross,
        hsnOrSac: String(service.sac || '').trim(),
        rate: rate == null || rate === -1 ? null : rate
      });
    }
    subtotal = round2(subtotal);
    const discountAmount = quote.discountAmount == null ? 0 : quote.discountAmount;
    if (!Number.isFinite(subtotal) || subtotal <= 0 ||
        !Number.isFinite(discountAmount) || discountAmount < 0 || discountAmount >= subtotal) {
      return res.status(400).json({ success: false, error: 'Subtotal must be positive; discount must be less than subtotal.' });
    }
    const netSubtotal = round2(subtotal - discountAmount);
    const marginPercent = round2(((netSubtotal - totalCost) / netSubtotal) * 100);
    const taxClassificationComplete = taxLines.every(line => line.hsnOrSac && line.rate !== null);
    const taxStatus = taxClassificationComplete ? 'ESTIMATED_UNVERIFIED' : 'PENDING_CLASSIFICATION';
    let gstAmount = 0;
    let breakdown: { lineId: string; taxableAmount: number; taxRatePercent: number; taxAmount: number }[] = [];
    if (taxClassificationComplete) {
      let allocated = 0;
      breakdown = taxLines.map((line, i) => {
        // Allocate the quotation discount proportionally; the final line absorbs any rounding residual.
        const taxableAmount = i === taxLines.length - 1
          ? round2(netSubtotal - allocated)
          : round2(line.gross - discountAmount * line.gross / subtotal);
        allocated = round2(allocated + taxableAmount);
        const taxRatePercent = line.rate as number;
        const taxAmount = round2(taxableAmount * taxRatePercent / 100);
        gstAmount = round2(gstAmount + taxAmount);
        return { lineId: line.lineId, taxableAmount, taxRatePercent, taxAmount };
      });
    }
    // If classification is missing, totalAmount EXCLUDES unknown GST, not an asserted final invoice total.
    const totalAmount = round2(netSubtotal + gstAmount);
    const isException = marginPercent < 12;
    const created = dbStore.addQuote({
      ...quote,
      id: `quote-${crypto.randomUUID()}`,
      quoteNumber: `QT-${crypto.randomUUID().slice(0, 10).toUpperCase()}`,
      customerName: quote.customerName.trim(),
      items, services, subtotal, discountAmount,
      marginPercent, gstAmount, totalAmount, grandTotal: totalAmount,
      taxStatus, taxBreakdown: breakdown,
      status: isException ? 'PENDING_OWNER_APPROVAL' : 'DRAFT',
      createdDate: new Date().toISOString().slice(0, 10),
      validUntil: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      paymentTerms: typeof quote.paymentTerms === 'string' ? quote.paymentTerms : ''
    });
    dbStore.addEvent({
      id: `evt-${crypto.randomUUID()}`, timestamp: new Date().toISOString(),
      eventType: isException ? 'MarginThresholdBreach' : 'QuotationDraftCreated',
      agent: (req as any).user.username,
      summary: `Quote ${created.quoteNumber} saved as ${created.status}; GST: ${taxStatus}; not sent to customer.`,
      autonomousActionTaken: 'Draft estimate calculated in ledger. Tax classification and provider filing not verified.',
      humanApprovalRequired: isException,
      approvalStatus: isException ? 'PENDING_TELEGRAM' : 'AUTO_APPROVED',
      confidenceScore: 1
    });
    return res.status(201).json({ success: true, data: created });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/quotes/:id/approve', requireAuth, requireRole('BUSINESS_OWNER'), (req, res) => {
  try {
    const actor = (req as any).user?.username || 'Business Owner';
    const targetQuote = dbStore.getState().quotes.find(q => q.id === req.params.id || q.quoteNumber === req.params.id);
    if (targetQuote?.taxStatus === 'PENDING_CLASSIFICATION') {
      return res.status(409).json({ success: false, error: 'Owner approval blocked: quote requires HSN/SAC classification and tax rates before approval.' });
    }
    const approved = dbStore.approveQuote(req.params.id, actor);
    if (!approved) {
      return res.status(404).json({ success: false, error: 'Quotation not found' });
    }

    dbStore.addEvent({
      id: `evt-${crypto.randomUUID()}`,
      timestamp: new Date().toLocaleTimeString(),
      eventType: 'OwnerExceptionAuthorized',
      agent: actor,
      summary: `Owner authorized concession on Quote ${approved.quoteNumber}.`,
      autonomousActionTaken: 'Quotation status updated to APPROVED in business ledger.',
      humanApprovalRequired: false,
      approvalStatus: 'AUTHORIZED',
      confidenceScore: 1.0
    });

    res.json({ success: true, data: approved });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.patch('/api/quotes/:id/reject', requireAuth, requireRole('BUSINESS_OWNER'), (req, res) => {
  try {
    const { reason } = req.body;
    const actor = (req as any).user?.username || 'Business Owner';
    const rejected = dbStore.rejectQuote(req.params.id, reason, actor);
    if (!rejected) {
      return res.status(404).json({ success: false, error: 'Quotation not found' });
    }

    dbStore.addEvent({
      id: `evt-${crypto.randomUUID()}`,
      timestamp: new Date().toLocaleTimeString(),
      eventType: 'QuotationRejected',
      agent: actor,
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

// Invoices CRUD (Protected)
app.get('/api/invoices', requireAuth, requireRole('BUSINESS_OWNER'), (req, res) => {
  res.json({ success: true, data: dbStore.getState().invoices });
});

// A receivables ledger entry is NOT a government-issued GST tax invoice.
app.post('/api/invoices', requireAuth, requireRole('BUSINESS_OWNER'), (req, res) => {
  try {
    const customer = typeof req.body?.customer === 'string' ? req.body.customer.trim() : '';
    const amount = req.body?.amount;
    const dueInDays = req.body?.dueInDays ?? 30;
    if (!customer || typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 ||
        !Number.isSafeInteger(dueInDays) || dueInDays < 0 || dueInDays > 365) {
      return res.status(400).json({ success: false, error: 'Real customer, positive finite amount and valid due days (0–365) required.' });
    }
    const id = crypto.randomUUID();
    const created = dbStore.addInvoice({
      id: 'inv-' + id,
      invoiceNo: 'INV-DRAFT-' + id.slice(0, 12).toUpperCase(),
      customer, amount, dueInDays,
      gstin: typeof req.body?.gstin === 'string' ? req.body.gstin.trim() : '',
      tenantId: dbStore.getState().tenant.id,
      status: 'ACTIVE',
      createdAt: new Date().toISOString().slice(0, 10)
    });
    dbStore.addEvent({
      id: `evt-${crypto.randomUUID()}`, timestamp: new Date().toISOString(),
      eventType: 'ReceivablesDraftRecorded',
      agent: (req as any).user.username,
      summary: `Created internal receivable draft ${created.invoiceNo} for ${created.customer} (₹${created.amount.toLocaleString('en-IN')}).`,
      autonomousActionTaken: 'Saved internal receivable only; no NIC IRN or settlement was generated.',
      humanApprovalRequired: false,
      approvalStatus: 'AUTO_APPROVED',
      confidenceScore: 1
    });
    return res.status(201).json({ success: true, data: created, taxInvoiceIssued: false });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/invoices/:invoiceNo/settle', requireAuth, requireRole('BUSINESS_OWNER'), (req, res) => {
  try {
    const { paymentReference, method } = req.body || {};
    if (typeof paymentReference !== 'string' || paymentReference.trim().length < 4) {
      return res.status(400).json({ success: false, error: 'Verified bank or UPI payment reference is required before marking settlement.' });
    }
    const settled = dbStore.settleInvoice(req.params.invoiceNo, { paymentReference, method });
    if (!settled) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }

    dbStore.addEvent({
      id: `evt-${crypto.randomUUID()}`,
      timestamp: new Date().toLocaleTimeString(),
      eventType: 'InvoiceSettled',
      agent: (req as any).user?.username || 'Finance',
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

// Tickets CRUD (Protected)
app.get('/api/tickets', requireAuth, requireRole('BUSINESS_OWNER', 'ENTERPRISE_IT_HEAD', 'FIELD_ENGINEER'), (req, res) => {
  res.json({ success: true, data: dbStore.getState().tickets });
});

app.post('/api/tickets', requireAuth, requireRole('BUSINESS_OWNER', 'ENTERPRISE_IT_HEAD', 'FIELD_ENGINEER'), (req, res) => {
  try {
    const ticket = req.body;
    if (!ticket || !ticket.title) {
      return res.status(400).json({ success: false, error: 'Ticket title is required' });
    }
    const created = dbStore.addTicket({
      ...ticket,
      id: ticket.id || `tkt-${crypto.randomUUID()}`,
      ticketNumber: ticket.ticketNumber || `INC-${Date.now().toString().slice(-6)}`,
      createdAt: ticket.createdAt || new Date().toISOString().split('T')[0],
      status: ticket.status || 'OPEN'
    });

    dbStore.addEvent({
      id: `evt-${crypto.randomUUID()}`,
      timestamp: new Date().toLocaleTimeString(),
      eventType: 'NewTicketLogged',
      agent: (req as any).user?.username || 'ITSM Desk',
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

app.patch('/api/tickets/:id', requireAuth, requireRole('BUSINESS_OWNER', 'ENTERPRISE_IT_HEAD', 'FIELD_ENGINEER'), (req, res) => {
  try {
    const updated = dbStore.updateTicket(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoints CRUD (Protected)
app.get('/api/endpoints', requireAuth, requireRole('BUSINESS_OWNER', 'ENTERPRISE_IT_HEAD', 'FIELD_ENGINEER'), (req, res) => {
  res.json({ success: true, data: dbStore.getState().endpoints });
});

app.post('/api/endpoints', requireAuth, requireRole('BUSINESS_OWNER', 'ENTERPRISE_IT_HEAD'), (req, res) => {
  try {
    const ep = req.body;
    if (!ep || !ep.deviceName) {
      return res.status(400).json({ success: false, error: 'deviceName is required' });
    }
    const created = dbStore.addEndpoint({
      ...ep,
      id: `ep-${crypto.randomUUID()}`,
      lastSeen: 'Awaiting agent check-in',
      status: 'UNENROLLED',
      telemetryAvailable: false,
      cpuLoad: -1,
      ramUsagePercent: -1,
      diskFreePercent: -1,
      batteryHealthPercent: -1,
      smartStatus: 'UNAVAILABLE',
      antivirusStatus: 'UNAVAILABLE'
    });

    dbStore.addEvent({
      id: `evt-${crypto.randomUUID()}`,
      timestamp: new Date().toLocaleTimeString(),
      eventType: 'EndpointRegisteredWithoutAgent',
      agent: (req as any).user?.username || 'RMM',
      summary: `Registered device ${created.deviceName} in asset directory.`,
      autonomousActionTaken: 'Saved hardware record in directory.',
      humanApprovalRequired: false,
      approvalStatus: 'AUTO_APPROVED',
      confidenceScore: 1.0
    });

    res.status(201).json({ success: true, data: created });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Field Jobs & P3.1 Inventory Consumption (Protected)
app.get('/api/jobs', requireAuth, requireRole('BUSINESS_OWNER', 'ENTERPRISE_IT_HEAD', 'FIELD_ENGINEER'), (req, res) => {
  res.json({ success: true, data: dbStore.getState().jobs });
});

app.post('/api/jobs', requireAuth, requireRole('BUSINESS_OWNER', 'ENTERPRISE_IT_HEAD'), (req, res) => {
  try {
    const job = req.body;
    if (!job || !job.title) {
      return res.status(400).json({ success: false, error: 'Job title is required' });
    }
    const created = dbStore.addJob({
      ...job,
      id: job.id || `job-${crypto.randomUUID()}`,
      jobCode: job.jobCode || `JOB-${Date.now().toString().slice(-6)}`,
      status: job.status || 'SCHEDULED',
      partsConsumed: job.partsConsumed || []
    });

    dbStore.addEvent({
      id: `evt-${crypto.randomUUID()}`,
      timestamp: new Date().toLocaleTimeString(),
      eventType: 'FieldJobScheduled',
      agent: (req as any).user?.username || 'Dispatch',
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

app.patch('/api/jobs/:id', requireAuth, requireRole('BUSINESS_OWNER', 'ENTERPRISE_IT_HEAD', 'FIELD_ENGINEER'), (req, res) => {
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

// P3.1 Strict Inventory Consumption
app.post('/api/jobs/:id/consume-part', requireAuth, requireRole('BUSINESS_OWNER', 'ENTERPRISE_IT_HEAD', 'FIELD_ENGINEER'), (req, res) => {
  try {
    const { productId, quantity } = req.body || {};
    if (typeof productId !== 'string' || !productId.trim()) {
      return res.status(400).json({ success: false, error: 'Exact productId is required' });
    }
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      return res.status(400).json({ success: false, error: 'Quantity must be a positive safe integer' });
    }
    const updated = dbStore.consumeJobPart(req.params.id, productId, quantity);
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Assets CRUD (Protected)
app.get('/api/assets', requireAuth, requireRole('BUSINESS_OWNER', 'ENTERPRISE_IT_HEAD', 'FIELD_ENGINEER', 'PROCUREMENT_LEAD'), (req, res) => {
  res.json({ success: true, data: dbStore.getState().assets });
});

app.post('/api/assets', requireAuth, requireRole('BUSINESS_OWNER', 'ENTERPRISE_IT_HEAD'), (req, res) => {
  try {
    const asset = req.body;
    if (!asset || !asset.name) {
      return res.status(400).json({ success: false, error: 'Asset name is required' });
    }
    const created = dbStore.addAsset({
      ...asset,
      id: asset.id || `ast-${crypto.randomUUID()}`,
      assetTag: asset.assetTag || `TAG-${Date.now().toString().slice(-6)}`
    });

    dbStore.addEvent({
      id: `evt-${crypto.randomUUID()}`,
      timestamp: new Date().toLocaleTimeString(),
      eventType: 'AssetRegisteredInCMDB',
      agent: (req as any).user?.username || 'CMDB',
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

app.patch('/api/assets/:id', requireAuth, requireRole('BUSINESS_OWNER', 'ENTERPRISE_IT_HEAD'), (req, res) => {
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

// Software Licenses CRUD (Protected)
app.get('/api/licenses', requireAuth, requireRole('BUSINESS_OWNER', 'ENTERPRISE_IT_HEAD'), (req, res) => {
  res.json({ success: true, data: dbStore.getState().licenses });
});

app.post('/api/licenses', requireAuth, requireRole('BUSINESS_OWNER', 'ENTERPRISE_IT_HEAD'), (req, res) => {
  try {
    const lic = req.body;
    if (!lic || !lic.softwareName) {
      return res.status(400).json({ success: false, error: 'softwareName is required' });
    }
    const created = dbStore.addLicense({
      ...lic,
      id: lic.id || `lic-${crypto.randomUUID()}`
    });
    res.status(201).json({ success: true, data: created });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/licenses/:id/reclaim', requireAuth, requireRole('BUSINESS_OWNER'), (req, res) => {
  try {
    const reclaimed = dbStore.reclaimLicense(req.params.id);
    if (!reclaimed) {
      return res.status(404).json({ success: false, error: 'License not found' });
    }

    dbStore.addEvent({
      id: `evt-${crypto.randomUUID()}`,
      timestamp: new Date().toLocaleTimeString(),
      eventType: 'SaaSSeatsReclaimed',
      agent: (req as any).user?.username || 'Asset Manager',
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

// AMC Contracts CRUD (Protected)
app.get('/api/amcs', requireAuth, requireRole('BUSINESS_OWNER', 'ENTERPRISE_IT_HEAD'), (req, res) => {
  res.json({ success: true, data: dbStore.getState().amcs });
});

app.post('/api/amcs', requireAuth, requireRole('BUSINESS_OWNER', 'ENTERPRISE_IT_HEAD'), (req, res) => {
  try {
    const amc = req.body;
    if (!amc || !amc.clientName) {
      return res.status(400).json({ success: false, error: 'clientName is required' });
    }
    const created = dbStore.addAMC({
      ...amc,
      id: amc.id || `amc-${crypto.randomUUID()}`,
      contractNumber: amc.contractNumber || `AMC-${Date.now().toString().slice(-6)}`
    });

    res.status(201).json({ success: true, data: created });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Projects & Proposals CRUD (Protected)
app.get('/api/projects', requireAuth, requireRole('BUSINESS_OWNER', 'SALES_MANAGER', 'ENTERPRISE_IT_HEAD', 'PROCUREMENT_LEAD'), (req, res) => {
  res.json({ success: true, data: dbStore.getState().projects });
});

app.post('/api/projects', requireAuth, requireRole('BUSINESS_OWNER', 'SALES_MANAGER', 'ENTERPRISE_IT_HEAD'), (req, res) => {
  try {
    const proj = req.body;
    if (!proj || !proj.title) {
      return res.status(400).json({ success: false, error: 'Project title is required' });
    }
    const created = dbStore.addProject({
      ...proj,
      id: proj.id || `proj-${crypto.randomUUID()}`,
      projectCode: proj.projectCode || `PRJ-${Date.now().toString().slice(-6)}`,
      createdAt: proj.createdAt || new Date().toISOString().split('T')[0],
      milestones: proj.milestones || []
    });

    res.status(201).json({ success: true, data: created });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/projects/:id', requireAuth, requireRole('BUSINESS_OWNER', 'ENTERPRISE_IT_HEAD'), (req, res) => {
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

app.patch('/api/projects/:id/milestones/:milestoneId', requireAuth, requireRole('BUSINESS_OWNER'), (req, res) => {
  try {
    const updated = dbStore.updateProjectMilestone(req.params.id, req.params.milestoneId, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Project or milestone not found' });
    }
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/proposals', requireAuth, requireRole('BUSINESS_OWNER', 'SALES_MANAGER', 'ENTERPRISE_IT_HEAD'), (req, res) => {
  res.json({ success: true, data: dbStore.getState().proposals });
});

app.post('/api/proposals', requireAuth, requireRole('BUSINESS_OWNER', 'SALES_MANAGER', 'ENTERPRISE_IT_HEAD'), (req, res) => {
  try {
    const proposal = req.body;
    if (!proposal || !proposal.providerName || !proposal.projectId) {
      return res.status(400).json({ success: false, error: 'providerName and projectId are required' });
    }
    const created = dbStore.addProposal({
      ...proposal,
      id: proposal.id || `prop-${crypto.randomUUID()}`,
      status: proposal.status || 'SUBMITTED'
    });

    const project = dbStore.getState().projects.find(p => p.id === proposal.projectId);
    if (project) {
      dbStore.updateProject(project.id, { proposalsCount: (project.proposalsCount || 0) + 1 });
    }

    res.status(201).json({ success: true, data: created });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/proposals/:id/accept', requireAuth, requireRole('BUSINESS_OWNER', 'ENTERPRISE_IT_HEAD'), (req, res) => {
  try {
    const prop = dbStore.getState().proposals.find(p => p.id === req.params.id);
    if (!prop) {
      return res.status(404).json({ success: false, error: 'Proposal not found' });
    }
    const updated = dbStore.updateProposal(prop.id, { status: 'ACCEPTED' });
    if (prop.projectId) {
      dbStore.updateProject(prop.projectId, { status: 'IN_PROGRESS' });
    }
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});


/**
 * Persistent business collections: validate input against the actual TS types.
 * Client-created IDs, settlement statuses and verification claims are ignored.
 * No operation here can move money, contact OEMs or confirm courier dispatch.
 */
const rmaStages = ['FAULT_LOGGED', 'OEM_APPROVED', 'IN_TRANSIT', 'SERVICE_CENTER', 'REPLACED_RETURN', 'TESTED_CLOSED'] as const;
const crmStages = ['LEAD', 'QUALIFIED', 'TECHNICAL_SCOPING', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON'] as const;
const disputeDecisions = ['RELEASE_RECOMMENDED', 'REFUND_RECOMMENDED', 'REWORK_RECOMMENDED'] as const;
const stringField = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const stringArray = (value: unknown): string[] | null =>
  Array.isArray(value) && value.every(item => typeof item === 'string' && item.trim())
    ? value.map(item => (item as string).trim())
    : null;

app.get('/api/rma', requireAuth, requireRole('BUSINESS_OWNER', 'ENTERPRISE_IT_HEAD', 'FIELD_ENGINEER'), (req, res) => {
  res.json({ success: true, data: dbStore.getState().rmaClaims });
});
app.post('/api/rma', requireAuth, requireRole('BUSINESS_OWNER', 'ENTERPRISE_IT_HEAD', 'FIELD_ENGINEER'), (req, res) => {
  try {
    const assetTag = stringField(req.body?.assetTag);
    const faultSymptom = stringField(req.body?.faultSymptom);
    const asset = dbStore.getState().assets.find(a => a.assetTag === assetTag);
    if (!asset || !faultSymptom) return res.status(400).json({ success: false, error: 'A registered asset tag and actual fault symptom are required.' });
    const identifier = crypto.randomUUID();
    const created = dbStore.addRMAClaim({
      id: 'rma-' + identifier,
      rmaNumber: 'RMA-' + identifier.slice(0, 10).toUpperCase(),
      assetId: asset.id, assetTag: asset.assetTag, assetName: asset.name,
      serialNumber: asset.serialNumber || '', oemBrand: asset.brand || '',
      oemCaseNumber: '', faultSymptom, warrantyStatus: 'UNVERIFIED',
      courierTracking: '', courierPartner: '', stage: 'FAULT_LOGGED',
      createdAt: new Date().toISOString()
    });
    return res.status(201).json({ success: true, data: created });
  } catch (err: any) { return res.status(500).json({ success: false, error: err.message }); }
});
app.patch('/api/rma/:id', requireAuth, requireRole('BUSINESS_OWNER', 'ENTERPRISE_IT_HEAD'), (req, res) => {
  try {
    const current = dbStore.getState().rmaClaims.find(c => c.id === req.params.id);
    if (!current) return res.status(404).json({ success: false, error: 'RMA claim not found.' });
    const stage = req.body?.stage;
    const index = rmaStages.indexOf(current.stage);
    if (typeof stage !== 'string' || stage !== rmaStages[index + 1]) {
      return res.status(400).json({ success: false, error: 'Only the immediate next RMA stage may be recorded.' });
    }
    const updates: Partial<typeof current> = { stage: stage as typeof current.stage };
    if (stage === 'OEM_APPROVED') {
      const caseNumber = stringField(req.body?.oemCaseNumber);
      if (!caseNumber) return res.status(400).json({ success: false, error: 'Actual OEM case number required. Approval is not automatic.' });
      updates.oemCaseNumber = caseNumber;
    }
    if (stage === 'IN_TRANSIT') {
      const courier = stringField(req.body?.courierPartner), tracking = stringField(req.body?.courierTracking);
      if (!courier || !tracking) return res.status(400).json({ success: false, error: 'Actual courier name and AWB required.' });
      updates.courierPartner = courier;
      updates.courierTracking = tracking;
    }
    if (stage === 'TESTED_CLOSED') updates.resolvedAt = new Date().toISOString();
    const updated = dbStore.updateRMAClaim(req.params.id, updates);
    return res.json({ success: true, data: updated });
  } catch (err: any) { return res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/knowledge', requireAuth, requireRole('BUSINESS_OWNER', 'SALES_MANAGER', 'ENTERPRISE_IT_HEAD', 'FIELD_ENGINEER'), (req, res) => {
  res.json({ success: true, data: dbStore.getState().knowledgeArticles });
});
app.post('/api/knowledge', requireAuth, requireRole('BUSINESS_OWNER', 'ENTERPRISE_IT_HEAD'), (req, res) => {
  try {
    const title = stringField(req.body?.title), summary = stringField(req.body?.summary);
    const steps = stringArray(req.body?.selfServiceSteps);
    if (!title || !summary || !steps?.length) {
      return res.status(400).json({ success: false, error: 'Title, summary and at least one validated SOP step are required.' });
    }
    const created = dbStore.addKnowledgeArticle({
      id: 'kb-' + crypto.randomUUID(), title, summary,
      category: stringField(req.body?.category) || 'General',
      readTime: 'Not measured', views: 0, solvedCount: 0,
      tags: stringArray(req.body?.tags) || [],
      symptoms: stringArray(req.body?.symptoms) || [],
      selfServiceSteps: steps
    });
    return res.status(201).json({ success: true, data: created });
  } catch (err: any) { return res.status(500).json({ success: false, error: err.message }); }
});
app.patch('/api/knowledge/:id', requireAuth, requireRole('BUSINESS_OWNER', 'ENTERPRISE_IT_HEAD'), (req, res) => {
  try {
    const current = dbStore.getState().knowledgeArticles.find(a => a.id === req.params.id);
    if (!current) return res.status(404).json({ success: false, error: 'Knowledge article not found.' });
    const updates: Partial<typeof current> = {};
    if (req.body?.title !== undefined) {
      const title = stringField(req.body.title);
      if (!title) return res.status(400).json({ success: false, error: 'Article title required.' });
      updates.title = title;
    }
    if (req.body?.summary !== undefined) {
      const summary = stringField(req.body.summary);
      if (!summary) return res.status(400).json({ success: false, error: 'Article summary required.' });
      updates.summary = summary;
    }
    if (req.body?.selfServiceSteps !== undefined) {
      const steps = stringArray(req.body.selfServiceSteps);
      if (!steps?.length) return res.status(400).json({ success: false, error: 'At least one valid SOP step required.' });
      updates.selfServiceSteps = steps;
    }
    if (req.body?.category !== undefined) updates.category = stringField(req.body.category);
    const updated = dbStore.updateKnowledgeArticle(req.params.id, updates);
    return res.json({ success: true, data: updated });
  } catch (err: any) { return res.status(500).json({ success: false, error: err.message }); }
});
// Self-resolution acknowledgement is atomic and not a client-supplied arbitrary count.
app.post('/api/knowledge/:id/solve', requireAuth, requireRole('BUSINESS_OWNER', 'ENTERPRISE_IT_HEAD', 'FIELD_ENGINEER', 'SALES_MANAGER'), (req, res) => {
  try {
    const updated = dbStore.markKnowledgeArticleSolved(req.params.id);
    if (!updated) return res.status(404).json({ success: false, error: 'Knowledge article not found.' });
    return res.json({ success: true, data: updated });
  } catch (err: any) { return res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/crm', requireAuth, requireRole('BUSINESS_OWNER', 'SALES_MANAGER'), (req, res) => {
  res.json({ success: true, data: dbStore.getState().crmOpportunities });
});
app.post('/api/crm', requireAuth, requireRole('BUSINESS_OWNER', 'SALES_MANAGER'), (req, res) => {
  try {
    const title = stringField(req.body?.title), clientName = stringField(req.body?.clientName);
    const value = Number(req.body?.value);
    if (!title || !clientName || !Number.isFinite(value) || value < 0) {
      return res.status(400).json({ success: false, error: 'Real client, opportunity title and valid deal value required.' });
    }
    const created = dbStore.addCRMOpportunity({
      id: 'crm-' + crypto.randomUUID(), title, clientName, value,
      stage: 'LEAD', winProbability: 0,
      contactPerson: stringField(req.body?.contactPerson),
      expectedCloseDate: stringField(req.body?.expectedCloseDate),
      assignedEngineer: '', category: stringField(req.body?.category)
    });
    return res.status(201).json({ success: true, data: created });
  } catch (err: any) { return res.status(500).json({ success: false, error: err.message }); }
});
app.patch('/api/crm/:id', requireAuth, requireRole('BUSINESS_OWNER', 'SALES_MANAGER'), (req, res) => {
  try {
    const current = dbStore.getState().crmOpportunities.find(o => o.id === req.params.id);
    if (!current) return res.status(404).json({ success: false, error: 'CRM opportunity not found.' });
    const next = stringField(req.body?.stage);
    const idx = crmStages.indexOf(current.stage as typeof crmStages[number]);
    if (idx === -1 || next !== crmStages[idx + 1]) {
      return res.status(400).json({ success: false, error: 'CRM stage can advance only one step at a time.' });
    }
    const updated = dbStore.updateCRMOpportunity(req.params.id, { stage: next });
    return res.json({ success: true, data: updated });
  } catch (err: any) { return res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/disputes', requireAuth, requireRole('BUSINESS_OWNER'), (req, res) => {
  res.json({ success: true, data: dbStore.getState().marketplaceDisputes });
});
app.post('/api/disputes', requireAuth, requireRole('BUSINESS_OWNER'), (req, res) => {
  try {
    const projectId = stringField(req.body?.projectId), reason = stringField(req.body?.reason);
    const customerClaim = stringField(req.body?.customerClaim);
    const disputedAmount = Number(req.body?.disputedAmount);
    const project = dbStore.getState().projects.find(p => p.id === projectId);
    if (!project || !reason || !customerClaim || !Number.isFinite(disputedAmount) || disputedAmount <= 0) {
      return res.status(400).json({ success: false, error: 'Existing project, reason, customer statement and positive amount are required.' });
    }
    const id = crypto.randomUUID();
    const created = dbStore.addMarketplaceDispute({
      id: 'dsp-' + id, disputeNumber: 'DSP-' + id.slice(0, 10).toUpperCase(),
      projectId: project.id, projectTitle: project.title, customerName: project.clientName,
      providerName: '', disputedAmount, escrowHeld: 0,
      reason, customerClaim, providerRebuttal: '', aiMediationVerdict: '',
      status: 'UNDER_ARBITRATION', createdAt: new Date().toISOString()
    });
    return res.status(201).json({ success: true, data: created });
  } catch (err: any) { return res.status(500).json({ success: false, error: err.message }); }
});
app.patch('/api/disputes/:id', requireAuth, requireRole('BUSINESS_OWNER'), (req, res) => {
  try {
    const current = dbStore.getState().marketplaceDisputes.find(d => d.id === req.params.id);
    if (!current) return res.status(404).json({ success: false, error: 'Dispute not found.' });
    const decision = stringField(req.body?.resolutionDecision);
    if (!disputeDecisions.some(d => d === decision)) {
      return res.status(400).json({ success: false, error: 'Only an internal recommendation can be recorded; no payout/refund adapter exists.' });
    }
    const updated = dbStore.updateMarketplaceDispute(req.params.id, {
      resolutionDecision: decision as typeof disputeDecisions[number],
      decisionRecordedAt: new Date().toISOString()
    });
    return res.json({ success: true, data: updated, note: 'Internal recommendation only. No escrow transfer or refund executed.' });
  } catch (err: any) { return res.status(500).json({ success: false, error: err.message }); }
});

// Workflows CRUD (Protected)
app.get('/api/workflows', requireAuth, requireRole('BUSINESS_OWNER'), (req, res) => {
  res.json({ success: true, data: dbStore.getState().workflows });
});

app.post('/api/workflows', requireAuth, requireRole('BUSINESS_OWNER'), (req, res) => {
  try {
    const wf = req.body;
    if (!wf || !wf.name) {
      return res.status(400).json({ success: false, error: 'Workflow name is required' });
    }
    const created = dbStore.addWorkflow({
      ...wf,
      id: wf.id || `wf-${crypto.randomUUID()}`,
      active: true,
      executionCount: 0,
      lastExecuted: 'Never'
    });
    res.status(201).json({ success: true, data: created });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/workflows/:id/toggle', requireAuth, requireRole('BUSINESS_OWNER'), (req, res) => {
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

// Connectors & Integrations
// Until real action adapters exist, never claim a workflow executed.
app.post('/api/workflows/:id/execute', requireAuth, requireRole('BUSINESS_OWNER'), (req, res) => {
  return res.status(501).json({
    success: false,
    error: 'Workflow execution is unavailable: verified action adapters and audit evidence are not implemented. Use dry-run preview only.'
  });
});

app.get('/api/connectors', requireAuth, requireRole('BUSINESS_OWNER'), (req, res) => {
  res.json({ success: true, data: dbStore.getState().connectors });
});

app.get('/api/integrations/status', requireAuth, requireRole('BUSINESS_OWNER'), (req, res) => {
  res.json({
    gemini: !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY',
    telegram: !!process.env.TELEGRAM_BOT_TOKEN && !!process.env.TELEGRAM_AUTHORIZED_CHAT_ID,
    m365: !!process.env.M365_CLIENT_ID,
    payments: !!process.env.RAZORPAY_KEY_ID,
    gst: !!process.env.GST_API_KEY
  });
});

// Authoritative Audit Events (Protected - P1.5 Server-side Agent Assignment)
app.get('/api/events', requireAuth, requireRole('BUSINESS_OWNER'), (req, res) => {
  res.json({ success: true, data: dbStore.getState().events });
});

app.post('/api/events', requireAuth, requireRole('BUSINESS_OWNER'), (req, res) => {
  return res.status(403).json({ success: false, error: 'Authoritative audit events are emitted only by server business operations.' });
  /* Legacy client-generated audit event support intentionally disabled.
  try {
    const { eventType, summary, autonomousActionTaken, humanApprovalRequired, approvalStatus } = req.body;
    if (!summary || !eventType) {
      return res.status(400).json({ success: false, error: 'eventType and summary are required' });
    }
    const agent = (req as any).user?.username || 'System';
    const created = dbStore.addEvent({
      id: `evt-${crypto.randomUUID()}`,
      timestamp: new Date().toLocaleTimeString(),
      eventType,
      agent,
      summary,
      autonomousActionTaken: autonomousActionTaken || 'Action recorded in audit log.',
      humanApprovalRequired: !!humanApprovalRequired,
      approvalStatus: approvalStatus || 'AUTO_APPROVED',
      confidenceScore: 1.0
    });
    res.status(201).json({ success: true, data: created });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
  */
});

// Live Telegram outbound: only a successful official Bot API response is delivery evidence.
// A provider-accepted message is not proof that a person read it.
app.post('/api/telegram/send', requireAuth, requireRole('BUSINESS_OWNER'), async (req, res) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_AUTHORIZED_CHAT_ID;
  if (!token || !chatId) {
    return res.status(503).json({ success: false, error: 'Telegram bot token and authorized chat ID are not configured.' });
  }
  if (!/^\d+:[A-Za-z0-9_-]{10,}$/.test(token)) {
    return res.status(503).json({ success: false, error: 'Telegram bot token format is invalid.' });
  }
  const content = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (!content || content.length > 4096) {
    return res.status(400).json({ success: false, error: 'Telegram message must contain 1–4096 characters.' });
  }
  try {
    const result = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: content }),
      signal: AbortSignal.timeout(8000)
    });
    const reply: any = await result.json();
    if (!result.ok || reply?.ok !== true || !Number.isSafeInteger(reply?.result?.message_id)) {
      return res.status(502).json({ success: false, error: 'Telegram API did not confirm message acceptance. No delivery was recorded.' });
    }
    try {
      const message = dbStore.addTelegramMessage({
        id: 'tlg-api-' + crypto.randomUUID(),
        sender: 'owner', text: content, timestamp: new Date().toISOString(),
        deliveryStatus: 'ACCEPTED_BY_TELEGRAM_API',
        telegramMessageId: reply.result.message_id
      });
      return res.json({ success: true, data: message, providerAccepted: true });
    } catch (persistError) {
      console.error('Telegram API accepted message but local ledger write failed:', persistError);
      return res.status(500).json({
        success: false, providerAccepted: true,
        error: 'Telegram API accepted this message but local persistence failed. Check Telegram before retrying to avoid duplicate sends.'
      });
    }
  } catch (err: any) {
    console.error('Telegram outbound unavailable:', err?.message || 'provider error');
    return res.status(502).json({ success: false, error: 'Telegram delivery not confirmed. Check provider connectivity and logs before retrying.' });
  }
});

// Telegram Live Webhook (P1.4 Verified webhook secret & exact quote match)
app.post('/api/telegram/webhook', (req, res) => {
  try {
    const secret = req.headers['x-telegram-bot-api-secret-token'];
    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

    if (!expectedSecret) {
      return res.status(503).json({ success: false, error: 'Telegram webhook is not configured with TELEGRAM_WEBHOOK_SECRET' });
    }
    if (secret !== expectedSecret) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Invalid Telegram webhook secret token' });
    }

    const update = req.body;
    if (!update) {
      return res.status(400).json({ success: false, error: 'Empty payload' });
    }

    const authorizedChat = process.env.TELEGRAM_AUTHORIZED_CHAT_ID;
    const authorizedUser = process.env.TELEGRAM_AUTHORIZED_USER_ID;
    if (!authorizedUser || !authorizedChat) {
      return res.status(503).json({ success: false, error: 'Explicit Telegram authorized user and chat IDs must be configured.' });
    }
    if (!Number.isSafeInteger(update.update_id) || update.update_id < 0) {
      return res.status(400).json({ success: false, error: 'Valid Telegram update_id required for replay protection.' });
    }
    const telegramUser = update.callback_query?.from || update.message?.from;
    const telegramChat = update.callback_query?.message?.chat || update.message?.chat;
    if (String(telegramUser?.id) !== String(authorizedUser) || String(telegramChat?.id) !== String(authorizedChat)) {
      return res.status(403).json({ success: false, error: 'Telegram update sender/chat not authorized.' });
    }
    if (!dbStore.markTelegramUpdateProcessed(update.update_id)) {
      return res.json({ success: true, handled: 'duplicate_ignored', updateId: update.update_id });
    }

    if (update.callback_query) {
      const from = update.callback_query.from;
      const messageChat = update.callback_query.message?.chat;

      if (authorizedUser && String(from?.id) !== String(authorizedUser)) {
        return res.status(403).json({ success: false, error: 'Forbidden: Unauthorized Telegram user' });
      }
      if (authorizedChat && String(messageChat?.id) !== String(authorizedChat)) {
        return res.status(403).json({ success: false, error: 'Forbidden: Unauthorized Telegram chat' });
      }

      const data = update.callback_query.data;
      const actorName = from?.username ? `@${from.username}` : (from?.first_name || 'Telegram Owner');

      if (typeof data === 'string' && data.startsWith('approve_quote_')) {
        const quoteId = data.replace('approve_quote_', '').trim();
        const targetQuote = dbStore.getState().quotes.find(q => q.id === quoteId || q.quoteNumber === quoteId);
        if (!targetQuote) {
          return res.status(404).json({ success: false, error: 'Quotation not found' });
        }
        if (targetQuote.status === 'APPROVED') {
          return res.status(400).json({ success: false, error: 'Quotation already approved' });
        }
        if (targetQuote.status !== 'PENDING_APPROVAL' && targetQuote.status !== 'PENDING_OWNER_APPROVAL') {
          return res.status(400).json({ success: false, error: 'Quotation is not pending approval' });
        }

        const approved = dbStore.approveQuote(targetQuote.id, actorName);
        if (approved) {
          const newEvt = dbStore.addEvent({
            id: `evt-tlg-${crypto.randomUUID()}`,
            timestamp: new Date().toLocaleTimeString(),
            eventType: 'TelegramApprovalCallback',
            agent: `Telegram (${actorName})`,
            summary: `Owner ${actorName} approved quotation #${approved.quoteNumber} via Telegram callback.`,
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
      const from = update.message.from;
      const chat = update.message.chat;

      if (authorizedUser && String(from?.id) !== String(authorizedUser)) {
        return res.status(403).json({ success: false, error: 'Forbidden: Unauthorized Telegram user' });
      }
      if (authorizedChat && String(chat?.id) !== String(authorizedChat)) {
        return res.status(403).json({ success: false, error: 'Forbidden: Unauthorized Telegram chat' });
      }

      const text = update.message.text;
      const user = from?.first_name || 'User';

      dbStore.addTelegramMessage({
        id: `tlg-${crypto.randomUUID()}`,
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
app.post('/api/payments/create-order', requireAuth, requireRole('BUSINESS_OWNER'), (req, res) => {
  const hasGateway = !!process.env.RAZORPAY_KEY_ID && !!process.env.RAZORPAY_KEY_SECRET;
  if (!hasGateway) {
    return res.status(503).json({
      success: false,
      error: 'Payment gateway integration is not configured. Real payment orders cannot be created without valid RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET credentials in .env.'
    });
  }
  res.status(501).json({ success: false, error: 'Payment provider adapter is not implemented yet. Payment transactions cannot be processed.' });
});

app.post('/api/payments/verify', requireAuth, requireRole('BUSINESS_OWNER'), (req, res) => {
  const hasGateway = !!process.env.RAZORPAY_KEY_ID && !!process.env.RAZORPAY_KEY_SECRET;
  if (!hasGateway) {
    return res.status(503).json({
      success: false,
      error: 'Payment verification unavailable: Payment gateway credentials not configured. Fabricated verification is forbidden.'
    });
  }
  res.status(501).json({ success: false, error: 'Payment provider adapter is not implemented yet. Payment verification cannot be processed.' });
});

// GST: Honest, zero-mock IRN generation (Rejects fake IRN generation)
app.post('/api/gst/generate-irn', requireAuth, requireRole('BUSINESS_OWNER'), (req, res) => {
  const hasGstCredentials = !!process.env.GST_API_KEY && !!process.env.GST_SELLER_GSTIN;
  if (!hasGstCredentials) {
    return res.status(503).json({
      success: false,
      error: 'GST e-invoicing integration is not configured. An internal invoice draft can be recorded in the ledger, but a legally verified government IRN cannot be fabricated without active IRP portal credentials.'
    });
  }
  res.status(501).json({ success: false, error: 'GST IRP adapter is not implemented yet. Government IRNs cannot be generated.' });
});

// Real AI BOM & Solution Builder (Protected)
app.post('/api/ai/bom-builder', requireAuth, requireRole('BUSINESS_OWNER', 'SALES_MANAGER'), async (req, res) => {
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

// Real AI Telegram Command & Natural Language Interface (Protected)
app.post('/api/ai/telegram-command', requireAuth, requireRole('BUSINESS_OWNER'), async (req, res) => {
  const { command } = req.body;
  const state = dbStore.getState();

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

  const pendingApprovals = quotes.filter(q => q.status === 'PENDING_APPROVAL' || q.status === 'PENDING_OWNER_APPROVAL');
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
        pendingApprovalsList: pendingApprovals.map(q => ({ quoteNo: q.quoteNumber, customer: q.customerName, amount: q.grandTotal, margin: q.marginPercent })),
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
        pendingApprovals.map((q, idx) => `${idx + 1}️⃣ *Quote #${q.quoteNumber}* — ${q.customerName}\n   • Amount: ₹${q.grandTotal.toLocaleString('en-IN')} | Margin: *${q.marginPercent}%* (Floor: 15.0%)`).join('\n\n') +
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

// Real AI Copilot Endpoint (Executive Dashboard, Protected)
app.post('/api/ai/copilot', requireAuth, requireRole('BUSINESS_OWNER'), async (req, res) => {
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

// Real AI IT Diagnosis & Problem Solver (Protected)
app.post('/api/ai/diagnosis', requireAuth, requireRole('BUSINESS_OWNER', 'ENTERPRISE_IT_HEAD', 'FIELD_ENGINEER'), async (req, res) => {
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
