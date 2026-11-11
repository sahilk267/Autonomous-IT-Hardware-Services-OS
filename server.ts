import 'dotenv/config';
import express from 'express';
import path from 'path';
import crypto from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import { dbStore, defaultConnectors, hashPassword, verifyPassword } from './server/db.ts';
import { UserRole } from './src/types.ts';
import { LoginRateLimiter, verifySetupToken, sessionCookie, expiredSessionCookie } from './server/security.ts';
import { allowedOrigins, writeOriginGuard } from './server/writeOrigin.ts';
import { PostgresRuntime } from './server/postgres/runtime.ts';
import { registerPostgresAuth } from './server/postgres/auth.ts';

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
const loginRateLimiter = new LoginRateLimiter();
const isProduction = process.env.NODE_ENV === 'production';

// Fail startup on invalid production origin configuration. Do not derive trust
// from an attacker-controlled Host/X-Forwarded-Host header.
app.use(writeOriginGuard(allowedOrigins(
  process.env.APEX_ALLOWED_ORIGINS || process.env.APP_URL || 'http://localhost:3000',
  process.env.NODE_ENV === 'production',
  process.env.APEX_DESKTOP_MODE === '1'
)));
app.use(express.json({ limit: '1mb' }));

// Stage 2: PostgreSQL is the authoritative store when explicitly enabled.
// Its auth router owns sessions and the transactional context wraps all
// remaining business routes without allowing a JSON-file fallback.
const postgresRuntime = process.env.APEX_STORAGE_MODE === 'postgres' ? new PostgresRuntime() : null;
if (postgresRuntime) {
  registerPostgresAuth(app, postgresRuntime);
  app.use('/api', postgresRuntime.scopedApiMiddleware());
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
  const user = dbStore.getUserById(session.userId);
  if (!user || user.tenantId !== dbStore.getState().tenant.id) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Account is no longer active in this workspace' });
  }
  (req as any).user = { ...session, username: user.username, role: user.role };
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
app.get('/api/health', (req, res) => {
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
    database: { status: 'ready' }
  });
});

// Auth Status (Check if first-time administrator enrollment is needed)
app.get('/api/auth/status', (req, res) => {
  const users = dbStore.getUsers();
  const token = getSessionToken(req);
  const session = token ? dbStore.getSession(token) : null;
  const account = session ? dbStore.getUserById(session.userId) : null;
  const active = !!account && account.tenantId === dbStore.getState().tenant.id;
  res.json({
    success: true,
    needsSetup: users.length === 0,
    setupRequired: users.length === 0,
    authenticated: active,
    user: active && session ? {
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
    const setupTokenResult = verifySetupToken(process.env.APEX_SETUP_TOKEN, req.body?.setupToken);
    if (setupTokenResult === 'unconfigured') {
      return res.status(503).json({ success: false, error: 'Setup is locked. Configure APEX_SETUP_TOKEN (32+ characters) on the server before enrollment.' });
    }
    if (setupTokenResult !== 'valid') {
      return res.status(403).json({ success: false, error: 'Invalid setup authorization token.' });
    }
    const { username, password, name, email } = req.body ?? {};
    if (!username || typeof username !== 'string' || username.trim().length < 3) {
      return res.status(400).json({ success: false, error: 'Username must be at least 3 characters.' });
    }
    if (!password || typeof password !== 'string' || password.length < 12) {
      return res.status(400).json({ success: false, error: 'Password must be at least 12 characters.' });
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
    res.setHeader('Set-Cookie', sessionCookie(session.token, isProduction));
    res.status(201).json({
      success: true,
      user: {
        id: newUser.id,
        username: newUser.username,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        tenantId: newUser.tenantId
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Secure Login (scrypt KDF verification)
app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body ?? {};
    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password are required.' });
    }
    const key = `${req.ip || req.socket.remoteAddress || 'unknown'}:${username.toLowerCase().trim()}`;
    const retryAfter = loginRateLimiter.check(key);
    if (retryAfter) {
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ success: false, error: 'Too many login attempts. Try again later.' });
    }
    const user = dbStore.getUserByUsername(username);
    if (!user || !user.salt || !user.passwordHash) {
      loginRateLimiter.fail(key);
      return res.status(401).json({ success: false, error: 'Invalid username or password.' });
    }
    const isValid = verifyPassword(password, user.salt, user.passwordHash);
    if (!isValid) {
      loginRateLimiter.fail(key);
      return res.status(401).json({ success: false, error: 'Invalid username or password.' });
    }

    loginRateLimiter.success(key);
    const session = dbStore.createSession(user.id, user.username, user.role);
    res.setHeader('Set-Cookie', sessionCookie(session.token, isProduction));
    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Protected Authentication & Tenant Endpoints ---

app.get('/api/auth/me', requireAuth, (req, res) => {
  const session = (req as any).user;
  const user = dbStore.getUserById(session.userId)!;
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
  res.setHeader('Set-Cookie', expiredSessionCookie(isProduction));
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
    const safeUsers = rawState.users.map(({ passwordHash, salt, ...u }) => u);
    res.json({
      success: true,
      data: {
        ...rawState,
        users: safeUsers,
        sessions: undefined
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Administrative Clean State Reset (Protected, requires BUSINESS_OWNER + explicit confirmation)
app.post('/api/state/reset', requireAuth, requireRole('BUSINESS_OWNER'), (req, res) => {
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
      data: {
        ...cleaned,
        users: cleaned.users.map(({ passwordHash, salt, ...user }) => user),
        sessions: undefined
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Products CRUD (Protected)
app.get('/api/products', requireAuth, (req, res) => {
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
    if (postgresRuntime && req.body && ('stockAvailable' in req.body || 'stockReserved' in req.body)) {
      return res.status(400).json({
        success: false, error: 'Use the audited stock-adjustment API for PostgreSQL inventory changes',
      });
    }
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

// Audited stock adjustment. Never allow clients to patch stock balances without
// a matching append-only inventory movement inside the same SQL transaction.
app.post('/api/products/:id/stock-adjust', requireAuth,
  requireRole('BUSINESS_OWNER', 'PROCUREMENT_LEAD'), (req, res) => {
  if (!postgresRuntime) return res.status(501).json({
    success: false, error: 'Audited stock adjustments require PostgreSQL mode',
  });
  try {
    const delta = req.body?.delta;
    const reason = req.body?.reason;
    if (!Number.isSafeInteger(delta) || delta === 0 || Math.abs(delta) > 1000000 ||
        typeof reason !== 'string' || reason.trim().length < 3 || reason.length > 300) {
      return res.status(400).json({ success: false, error: 'Valid nonzero integer delta and reason (3-300 characters) required' });
    }
    const adjusted = dbStore.commit(draft => {
      const item = draft.products.find(p => p.id === req.params.id);
      if (!item) return null;
      const previousStock = item.stockAvailable ?? 0;
      const next = previousStock + delta;
      if (!Number.isSafeInteger(next) || next < (item.stockReserved ?? 0)) {
        throw new Error('Stock adjustment would violate reserved or available stock limits');
      }
      item.stockAvailable = next;
      const movement = {
        id: `tx-${crypto.randomUUID()}`,
        tenantId: draft.tenant.id,
        productId: item.id,
        sku: item.sku,
        productName: item.name,
        type: delta > 0 ? 'IN' as const : 'OUT' as const,
        qty: Math.abs(delta),
        previousStock,
        newStock: next,
        reason: reason.trim(),
        referenceId: `manual-adjustment:${(req as any).user.userId}`,
        timestamp: new Date().toISOString(),
      };
      draft.inventoryTransactions.push(movement);
      return { product: item, movement };
    });
    if (!adjusted) return res.status(404).json({ success: false, error: 'Product not found' });
    return res.json({ success: true, data: adjusted });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

// Suppliers CRUD (Protected)
app.get('/api/suppliers', requireAuth, (req, res) => {
  res.json({ success: true, data: dbStore.getState().suppliers });
});

app.post('/api/suppliers', requireAuth, (req, res) => {
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
app.get('/api/rfqs', requireAuth, (req, res) => {
  res.json({ success: true, data: dbStore.getState().rfqs });
});

app.post('/api/rfqs', requireAuth, (req, res) => {
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

app.post('/api/rfqs/:id/quotes', requireAuth, (req, res) => {
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

app.post('/api/rfqs/:id/dispatch-po', requireAuth, requireRole('BUSINESS_OWNER', 'PROCUREMENT_LEAD'), (req, res) => {
  try {
    const { supplierId } = req.body;
    const updated = dbStore.dispatchPO(req.params.id, supplierId);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'RFQ not found' });
    }

    dbStore.addEvent({
      id: `evt-${crypto.randomUUID()}`,
      timestamp: new Date().toLocaleTimeString(),
      eventType: 'PurchaseOrderDispatched',
      agent: (req as any).user?.username || 'Procurement',
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

// Quotations CRUD (Protected, P3.2 Server-side Recalculation)
app.get('/api/quotes', requireAuth, (req, res) => {
  res.json({ success: true, data: dbStore.getState().quotes });
});

app.post('/api/quotes', requireAuth, requireRole('BUSINESS_OWNER', 'SALES_MANAGER'), (req, res) => {
  try {
    const quote = req.body;
    if (!quote || !quote.customerName) {
      return res.status(400).json({ success: false, error: 'customerName is required' });
    }

    const items = Array.isArray(quote.items) ? quote.items : [];
    let calculatedSubtotal = 0;
    let calculatedTotalCost = 0;

    for (const item of items) {
      const q = Number(item.qty) || 0;
      const unitCost = Number(item.purchaseCost) || 0;
      const unitPrice = Number(item.sellingPrice) || 0;
      if (q <= 0 || unitCost < 0 || unitPrice < 0) {
        return res.status(400).json({ success: false, error: 'Invalid item values: qty must be > 0, costs must be non-negative' });
      }
      calculatedSubtotal += q * unitPrice;
      calculatedTotalCost += q * unitCost;
    }

    const discount = Number(quote.discount) || 0;
    if (discount < 0 || (calculatedSubtotal > 0 && discount >= calculatedSubtotal)) {
      return res.status(400).json({ success: false, error: 'Discount must be non-negative and less than subtotal' });
    }

    const netSubtotal = Math.max(0, calculatedSubtotal - discount);
    const profit = netSubtotal - calculatedTotalCost;
    const marginPercent = netSubtotal > 0 ? Math.round(((profit / netSubtotal) * 100) * 10) / 10 : 0;
    const gstTotal = Math.round(netSubtotal * 0.18);
    const grandTotal = netSubtotal + gstTotal;

    const isException = marginPercent < 15;
    const authoritativeStatus = isException ? 'PENDING_APPROVAL' : 'APPROVED';

    const created = dbStore.addQuote({
      ...quote,
      id: `quote-${crypto.randomUUID()}`,
      quoteNumber: quote.quoteNumber || `QT-${Date.now().toString().slice(-6)}`,
      items,
      subtotal: calculatedSubtotal,
      discount,
      gstTotal,
      grandTotal,
      marginPercent,
      status: authoritativeStatus,
      createdAt: new Date().toISOString()
    });

    dbStore.addEvent({
      id: `evt-${crypto.randomUUID()}`,
      timestamp: new Date().toLocaleTimeString(),
      eventType: isException ? 'MarginThresholdBreach' : 'QuotationGenerated',
      agent: (req as any).user?.username || 'Pricing Engine',
      summary: `Quotation ${created.quoteNumber} created for ${created.customerName} (${created.marginPercent}% margin, Total: ₹${created.grandTotal.toLocaleString('en-IN')}).`,
      autonomousActionTaken: isException ? 'Placed on hold for Owner authorization' : 'Pricing verified against policy rules.',
      humanApprovalRequired: isException,
      approvalStatus: isException ? 'PENDING_TELEGRAM' : 'AUTO_APPROVED',
      confidenceScore: 1.0
    });

    res.status(201).json({ success: true, data: created });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/quotes/:id/approve', requireAuth, requireRole('BUSINESS_OWNER'), (req, res) => {
  try {
    const actor = (req as any).user?.username || 'Business Owner';
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
app.get('/api/invoices', requireAuth, (req, res) => {
  res.json({ success: true, data: dbStore.getState().invoices });
});

app.post('/api/invoices', requireAuth, requireRole('BUSINESS_OWNER', 'SALES_MANAGER'), (req, res) => {
  try {
    const inv = req.body;
    if (!inv || typeof inv.customer !== 'string' || !inv.customer.trim() ||
        typeof inv.amount !== 'number' || !Number.isFinite(inv.amount) ||
        inv.amount <= 0 || Math.abs(inv.amount * 100 - Math.round(inv.amount * 100)) > 0.00001 ||
        (inv.status && inv.status !== 'ACTIVE')) {
      return res.status(400).json({
        success: false, error: 'A valid positive invoice amount and ACTIVE status are required',
      });
    }
    const created = dbStore.addInvoice({
      ...inv,
      id: inv.id || `inv-${crypto.randomUUID()}`,
      invoiceNo: inv.invoiceNo || `INV-${Date.now().toString().slice(-6)}`,
      createdAt: inv.createdAt || new Date().toISOString().split('T')[0],
      status: inv.status || 'ACTIVE'
    });

    dbStore.addEvent({
      id: `evt-${crypto.randomUUID()}`,
      timestamp: new Date().toLocaleTimeString(),
      eventType: 'InvoiceCreated',
      agent: (req as any).user?.username || 'Billing',
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

app.patch('/api/invoices/:invoiceNo/settle', requireAuth, requireRole('BUSINESS_OWNER'), (req, res) => {
  try {
    const { paymentReference, method } = req.body ?? {};
    if (postgresRuntime) {
      const already = dbStore.getState().invoices.find(i => i.invoiceNo === req.params.invoiceNo);
      if (already?.status === 'SETTLED') {
        return res.status(409).json({ success: false, error: 'Invoice has already been settled; duplicate settlement blocked' });
      }
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
app.get('/api/tickets', requireAuth, (req, res) => {
  res.json({ success: true, data: dbStore.getState().tickets });
});

app.post('/api/tickets', requireAuth, (req, res) => {
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

app.patch('/api/tickets/:id', requireAuth, (req, res) => {
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
app.get('/api/endpoints', requireAuth, (req, res) => {
  res.json({ success: true, data: dbStore.getState().endpoints });
});

app.post('/api/endpoints', requireAuth, (req, res) => {
  try {
    const ep = req.body;
    if (!ep || !ep.deviceName) {
      return res.status(400).json({ success: false, error: 'deviceName is required' });
    }
    const created = dbStore.addEndpoint({
      ...ep,
      id: ep.id || `ep-${crypto.randomUUID()}`,
      lastSeen: new Date().toISOString()
    });

    dbStore.addEvent({
      id: `evt-${crypto.randomUUID()}`,
      timestamp: new Date().toLocaleTimeString(),
      eventType: 'RMMAgentEnrolled',
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
app.get('/api/jobs', requireAuth, (req, res) => {
  res.json({ success: true, data: dbStore.getState().jobs });
});

app.post('/api/jobs', requireAuth, (req, res) => {
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

app.patch('/api/jobs/:id', requireAuth, (req, res) => {
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
app.post('/api/jobs/:id/consume-part', requireAuth, requireRole('BUSINESS_OWNER', 'FIELD_ENGINEER'), (req, res) => {
  try {
    const { productId, partName, quantity, cost } = req.body;
    const targetProduct = productId || partName;
    if (!targetProduct) {
      return res.status(400).json({ success: false, error: 'productId or partName is required' });
    }
    const qty = Number(quantity) || 1;
    if (qty <= 0 || !Number.isInteger(qty)) {
      return res.status(400).json({ success: false, error: 'Quantity must be a positive integer' });
    }
    const updated = dbStore.consumeJobPart(
      req.params.id,
      targetProduct,
      qty,
      cost !== undefined ? Number(cost) : undefined
    );
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Assets CRUD (Protected)
app.get('/api/assets', requireAuth, (req, res) => {
  res.json({ success: true, data: dbStore.getState().assets });
});

app.post('/api/assets', requireAuth, (req, res) => {
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

app.patch('/api/assets/:id', requireAuth, (req, res) => {
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
app.get('/api/licenses', requireAuth, (req, res) => {
  res.json({ success: true, data: dbStore.getState().licenses });
});

app.post('/api/licenses', requireAuth, (req, res) => {
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

app.patch('/api/licenses/:id/reclaim', requireAuth, (req, res) => {
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
app.get('/api/amcs', requireAuth, (req, res) => {
  res.json({ success: true, data: dbStore.getState().amcs });
});

app.post('/api/amcs', requireAuth, (req, res) => {
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
app.get('/api/projects', requireAuth, (req, res) => {
  res.json({ success: true, data: dbStore.getState().projects });
});

app.post('/api/projects', requireAuth, (req, res) => {
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

app.patch('/api/projects/:id', requireAuth, (req, res) => {
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

app.patch('/api/projects/:id/milestones/:milestoneId', requireAuth, (req, res) => {
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

app.get('/api/proposals', requireAuth, (req, res) => {
  res.json({ success: true, data: dbStore.getState().proposals });
});

app.post('/api/proposals', requireAuth, (req, res) => {
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

app.patch('/api/proposals/:id/accept', requireAuth, (req, res) => {
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

// P3.4 Missing Collections: RMA, Knowledge Base, CRM, Disputes
app.get('/api/rma', requireAuth, (req, res) => {
  res.json({ success: true, data: dbStore.getState().rmaClaims });
});

app.post('/api/rma', requireAuth, (req, res) => {
  try {
    const claim = req.body;
    if (!claim || !claim.assetName || !claim.faultDescription) {
      return res.status(400).json({ success: false, error: 'assetName and faultDescription are required' });
    }
    const created = dbStore.addRMAClaim({
      ...claim,
      id: claim.id || `rma-${crypto.randomUUID()}`,
      status: 'FAULT_LOGGED',
      createdAt: new Date().toISOString()
    });
    res.status(201).json({ success: true, data: created });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/rma/:id', requireAuth, (req, res) => {
  try {
    const updated = dbStore.updateRMAClaim(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'RMA claim not found' });
    }
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/knowledge', requireAuth, (req, res) => {
  res.json({ success: true, data: dbStore.getState().knowledgeArticles });
});

app.post('/api/knowledge', requireAuth, (req, res) => {
  try {
    const article = req.body;
    if (!article || !article.title || !article.content) {
      return res.status(400).json({ success: false, error: 'title and content are required' });
    }
    const created = dbStore.addKnowledgeArticle({
      ...article,
      id: article.id || `kb-${crypto.randomUUID()}`,
      views: 0,
      helpfulCount: 0,
      tags: article.tags || [],
      lastUpdated: new Date().toISOString()
    });
    res.status(201).json({ success: true, data: created });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/knowledge/:id', requireAuth, (req, res) => {
  try {
    const updated = dbStore.updateKnowledgeArticle(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Knowledge article not found' });
    }
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/crm', requireAuth, (req, res) => {
  res.json({ success: true, data: dbStore.getState().crmOpportunities });
});

app.post('/api/crm', requireAuth, (req, res) => {
  try {
    const opp = req.body;
    if (!opp || !opp.clientName || !opp.title) {
      return res.status(400).json({ success: false, error: 'clientName and title are required' });
    }
    const created = dbStore.addCRMOpportunity({
      ...opp,
      id: opp.id || `crm-${crypto.randomUUID()}`,
      createdAt: new Date().toISOString()
    });
    res.status(201).json({ success: true, data: created });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/crm/:id', requireAuth, (req, res) => {
  try {
    const updated = dbStore.updateCRMOpportunity(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'CRM opportunity not found' });
    }
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/disputes', requireAuth, (req, res) => {
  res.json({ success: true, data: dbStore.getState().marketplaceDisputes });
});

app.post('/api/disputes', requireAuth, (req, res) => {
  try {
    const dispute = req.body;
    if (!dispute || !dispute.reason || !dispute.projectTitle) {
      return res.status(400).json({ success: false, error: 'reason and projectTitle are required' });
    }
    const created = dbStore.addMarketplaceDispute({
      ...dispute,
      id: dispute.id || `dsp-${crypto.randomUUID()}`,
      status: 'UNDER_ARBITRATION',
      createdAt: new Date().toISOString()
    });
    res.status(201).json({ success: true, data: created });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/disputes/:id', requireAuth, (req, res) => {
  try {
    const updated = dbStore.updateMarketplaceDispute(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Dispute not found' });
    }
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Workflows CRUD (Protected)
app.get('/api/workflows', requireAuth, (req, res) => {
  res.json({ success: true, data: dbStore.getState().workflows });
});

app.post('/api/workflows', requireAuth, (req, res) => {
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

app.patch('/api/workflows/:id/toggle', requireAuth, (req, res) => {
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
app.get('/api/connectors', requireAuth, (req, res) => {
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

// Authoritative Audit Events (Protected - P1.5 Server-side Agent Assignment)
app.get('/api/events', requireAuth, (req, res) => {
  res.json({ success: true, data: dbStore.getState().events });
});

// Audit records are authoritative server transitions, never user-submitted approval claims.
app.post('/api/events', requireAuth, (_req, res) => {
  return res.status(405).json({ success: false, error: 'Direct audit event creation is disabled. Server transitions emit audit evidence.' });
});

// Telegram Live Webhook (P1.4 Verified webhook secret & exact quote match)
app.post('/api/telegram/webhook', (req, res) => {
  try {
    const secret = req.headers['x-telegram-bot-api-secret-token'];
    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

    if (!expectedSecret) {
      return res.status(503).json({ success: false, error: 'Telegram webhook is not configured with TELEGRAM_WEBHOOK_SECRET' });
    }
    const providedSecret = typeof secret === 'string' ? secret : '';
    const validSecret = crypto.timingSafeEqual(
      crypto.createHash('sha256').update(providedSecret).digest(),
      crypto.createHash('sha256').update(expectedSecret).digest()
    );
    if (!validSecret) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Invalid Telegram webhook secret token' });
    }

    const update = req.body;
    if (!update) {
      return res.status(400).json({ success: false, error: 'Empty payload' });
    }

    const authorizedChat = process.env.TELEGRAM_AUTHORIZED_CHAT_ID;
    const authorizedUser = process.env.TELEGRAM_AUTHORIZED_USER_ID;
    if (!authorizedUser || !authorizedChat) {
      return res.status(503).json({ success: false, error: 'Telegram owner authorization requires both TELEGRAM_AUTHORIZED_USER_ID and TELEGRAM_AUTHORIZED_CHAT_ID.' });
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
app.post('/api/payments/create-order', requireAuth, (req, res) => {
  const hasGateway = !!process.env.RAZORPAY_KEY_ID && !!process.env.RAZORPAY_KEY_SECRET;
  if (!hasGateway) {
    return res.status(503).json({
      success: false,
      error: 'Payment gateway integration is not configured. Real payment orders cannot be created without valid RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET credentials in .env.'
    });
  }
  res.status(501).json({ success: false, error: 'Payment provider adapter is not implemented yet. Payment transactions cannot be processed.' });
});

app.post('/api/payments/verify', requireAuth, (req, res) => {
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
app.post('/api/gst/generate-irn', requireAuth, (req, res) => {
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
app.post('/api/ai/bom-builder', requireAuth, async (req, res) => {
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
app.post('/api/ai/telegram-command', requireAuth, async (req, res) => {
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
app.post('/api/ai/copilot', requireAuth, async (req, res) => {
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
app.post('/api/ai/diagnosis', requireAuth, async (req, res) => {
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
  // Refuse to listen if the tenant is absent, migrations are pending, or the
  // database role can bypass RLS. Production must fail closed, not use JSON.
  if (postgresRuntime) await postgresRuntime.preflight();
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
