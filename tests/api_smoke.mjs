// Production-mode HTTP smoke tests, always using a throwaway database.
// Never point this script at a deployed app, external services or live data.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-api-smoke-'));
const dbFile = path.join(dir, 'isolated-store.json');
const setupToken = 'only-for-ephemeral-ci-' + Math.random().toString(36).slice(2);

function getFreePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const port = s.address().port;
      s.close(() => resolve(port));
    });
  });
}

const port = await getFreePort();
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['dist/server.cjs'], {
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(port),
    APEX_DATA_FILE: dbFile,
    APEX_INITIAL_SETUP_TOKEN: setupToken,
    APEX_ALLOW_PRODUCTION_RESET: 'false',
    TELEGRAM_BOT_TOKEN: '',
    TELEGRAM_WEBHOOK_SECRET: '',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverOutput = '';
child.stdout.on('data', b => { serverOutput += b.toString(); });
child.stderr.on('data', b => { serverOutput += b.toString(); });

async function request(endpoint, options = {}, cookie) {
  const headers = {
    ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
    ...(cookie ? { cookie } : {}),
    ...(options.headers || {}),
  };
  const response = await fetch(base + endpoint, {
    method: options.method || 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const body = await response.json();
  return { response, body };
}
const post = (endpoint, body, cookie) => request(endpoint, { method: 'POST', body }, cookie);
const patch = (endpoint, body, cookie) => request(endpoint, { method: 'PATCH', body }, cookie);

let passed = 0;
function verify(name, test) {
  test();
  passed++;
  console.log('PASS ' + name);
}
try {
  let ready = false;
  for (let n = 0; n < 100; n++) {
    if (child.exitCode !== null) throw new Error('Server exited: ' + serverOutput);
    try {
      const r = await request('/api/health');
      if (r.response.ok) { ready = true; break; }
    } catch { /* startup not finished */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error('Server did not start: ' + serverOutput);

  let publicHealth = await request('/api/health');
  verify('Anonymous liveness never leaks business volumes or integration config', () => {
    assert.equal(publicHealth.response.status, 200);
    assert.ok(!('database' in publicHealth.body));
    assert.ok(!('integrations' in publicHealth.body));
    assert.ok(!('environment' in publicHealth.body));
  });

  let result = await request('/api/state');
  verify('Anonymous private state denied', () => assert.equal(result.response.status, 401));
  result = await request('/api/auth/status');
  verify('Brand new isolated install needs admin setup', () => assert.equal(result.body.needsSetup, true));

  result = await post('/api/auth/setup', { username: 'owner', password: 'TestOwnerPassword!2026', name: 'Test Owner', email: 'owner@example.invalid', setupToken: 'wrong' });
  verify('Unauthorized first-admin setup rejected', () => assert.equal(result.response.status, 403));

  result = await post('/api/auth/setup', { username: 'owner', password: 'TestOwnerPassword!2026', name: 'Test Owner', email: 'owner@example.invalid', setupToken });
  verify('First administrator creates real credentials', () => assert.equal(result.response.status, 201));
  const sessionHeader = result.response.headers.get('set-cookie') || '';
  verify('Production session cookie has HttpOnly and Secure', () => {
    assert.match(sessionHeader, /HttpOnly/);
    assert.match(sessionHeader, /Secure/);
  });
  const cookie = sessionHeader.split(';')[0];

  result = await request('/api/state', {}, cookie);
  verify('Authenticated state redacts password hashes and sessions', () => {
    assert.equal(result.response.status, 200);
    assert.ok(!('passwordHash' in result.body.data.users[0]));
    assert.ok(!('sessions' in result.body.data));
  });

  result = await post('/api/auth/login', { username: 'owner', password: 'bad-password' });
  verify('Incorrect password rejected', () => assert.equal(result.response.status, 401));
  result = await post('/api/auth/login', { username: 'owner', password: 'TestOwnerPassword!2026' });
  verify('Correct password accepted without leaking token in JSON', () => {
    assert.equal(result.response.status, 200);
    assert.ok(!('token' in result.body));
  });

  result = await post('/api/products', {
    sku: 'CI-HW-001', name: 'CI SSD', category: 'Storage', brand: 'Test',
    specs: 'Ephemeral test', purchaseCost: 100, sellingPrice: 200,
    stockAvailable: 3, stockReserved: 0
  }, cookie);
  verify('Owner creates warehouse product', () => assert.equal(result.response.status, 201));
  const productId = result.body.data.id;

  result = await post('/api/jobs', {
    title: 'CI laptop repair', customerName: 'Test Client', address: 'Test Site',
    technicianName: 'Test Engineer', technicianPhone: '', partsConsumed: []
  }, cookie);
  verify('Field job persists', () => assert.equal(result.response.status, 201));
  const jobId = result.body.data.id;
  result = await post(`/api/jobs/${jobId}/consume-part`, { productId, quantity: 2 }, cookie);
  verify('Exact SKU consumption updates job', () => {
    assert.equal(result.response.status, 200);
    assert.equal(result.body.data.partsConsumed[0].cost, 100);
  });
  result = await request('/api/products', {}, cookie);
  verify('Warehouse stock is actually reduced', () => assert.equal(result.body.data.find(p => p.id === productId).stockAvailable, 1));

  result = await post('/api/quotes', {
    customerName: 'Test Client', solutionName: 'Test Solution',
    items: [{ qty: 2, purchaseCost: 100, sellingPrice: 200 }],
    services: [{ name: 'Install', price: 50 }],
    discountAmount: 50
  }, cookie);
  verify('Unclassified quote is saved as pending-tax draft, without assumed 18% GST', () => {
    assert.equal(result.response.status, 201);
    assert.equal(result.body.data.subtotal, 450);
    assert.equal(result.body.data.discountAmount, 50);
    assert.equal(result.body.data.taxStatus, 'PENDING_CLASSIFICATION');
    assert.equal(result.body.data.gstAmount, 0);
    assert.equal(result.body.data.totalAmount, 400); // pre-tax amount, not a final invoice
    assert.equal(result.body.data.status, 'DRAFT');
  });

  // Phase 3: explicit line tax rates and proportional discount allocation.
  result = await post('/api/quotes', {
    customerName: 'Mixed Tax CI Customer', solutionName: 'Hardware + Installation',
    items: [{ qty: 2, purchaseCost: 100, sellingPrice: 200, hsn: '8471', gstPercent: 18 }],
    services: [{ id: 'service-1', name: 'Installation', price: 50, sac: '9987', gstPercent: 5 }],
    discountAmount: 50, gstAmount: 999999, totalAmount: 1
  }, cookie);
  verify('Quote tax uses explicit line rates and allocates the discount', () => {
    assert.equal(result.response.status, 201);
    assert.equal(result.body.data.taxStatus, 'ESTIMATED_UNVERIFIED');
    assert.equal(result.body.data.gstAmount, 66.22);
    assert.equal(result.body.data.totalAmount, 466.22);
    assert.equal(result.body.data.taxBreakdown.length, 2);
    assert.equal(result.body.data.taxBreakdown[0].taxableAmount, 355.56);
    assert.equal(result.body.data.taxBreakdown[1].taxableAmount, 44.44);
  });
  result = await post('/api/quotes', {
    customerName: 'Invalid Tax CI Customer',
    items: [{ qty: 1, purchaseCost: 10, sellingPrice: 100, hsn: '8471', gstPercent: 999 }],
    services: [], discountAmount: 0
  }, cookie);
  verify('Quote rejects invalid declared GST rate rather than hardcoding 18%', () => {
    assert.equal(result.response.status, 400);
  });

  // Phase 3: PO preparation is a real internal ledger record, not an external dispatch.
  result = await post('/api/rfqs', { productName: 'CI SSD', requiredQty: 3, urgency: 'MEDIUM', status: 'PO_DISPATCHED' }, cookie);
  verify('RFQ is created OPEN despite attempted client status forging', () => assert.equal(result.body.data.status, 'OPEN'));
  const rfqId = result.body.data.id;
  result = await post(`/api/rfqs/${rfqId}/dispatch-po`, { supplierId: 'unknown' }, cookie);
  verify('PO preparation rejects unquoted supplier', () => assert.equal(result.response.status, 400));
  result = await post(`/api/rfqs/${rfqId}/quotes`, {
    supplierId: 'supplier-ci', supplierName: 'Real Quote Recorded in CI',
    unitCost: 150, leadTimeDays: 5, inStock: true
  }, cookie);
  verify('Supplier quotation can be recorded', () => assert.equal(result.response.status, 200));
  result = await post(`/api/rfqs/${rfqId}/dispatch-po`, { supplierId: 'supplier-ci' }, cookie);
  verify('Selected supplier PO is prepared, price server-derived, NEVER marked dispatched', () => {
    assert.equal(result.response.status, 200);
    assert.equal(result.body.data.status, 'PO_PREPARED');
    assert.equal(result.body.delivery, 'NOT_SENT');
    assert.equal(result.body.data.preparedPO.amount, 450);
    assert.equal(result.body.data.preparedPO.deliveryStatus, 'NOT_SENT');
    assert.ok(result.body.data.preparedPO.poReference.startsWith('PO-DRAFT-'));
  });
  result = await post(`/api/rfqs/${rfqId}/dispatch-po`, { supplierId: 'supplier-ci' }, cookie);
  verify('Duplicate PO preparation cannot silently overwrite selection', () => assert.equal(result.response.status, 400));
  result = await request('/api/rfqs', {}, cookie);
  verify('PO preparation persists after independent API fetch', () =>
    assert.equal(result.body.data.find(row => row.id === rfqId).status, 'PO_PREPARED'));

  result = await post('/api/telegram/send', { text: 'CI text that must NOT be sent' }, cookie);
  verify('Outbound Telegram requires real configured provider and never simulates delivery', () => assert.equal(result.response.status, 503));

  result = await post('/api/invoices', { customer: 'Test Client', amount: 472, status: 'ACTIVE' }, cookie);
  verify('Invoice draft saved', () => assert.equal(result.response.status, 201));
  const invoiceNo = result.body.data.invoiceNo;
  result = await post('/api/invoices', {
    customer: 'CI Forgery Test', amount: 100,
    status: 'SETTLED', paymentReference: 'FAKE-BANK-REFERENCE',
    settledAt: '2020-01-01', invoiceNo: 'INV-FORGED-CUSTOMER', id: 'forged-id'
  }, cookie);
  verify('Client cannot forge settled invoice, bank proof or invoice number on create', () => {
    assert.equal(result.response.status, 201);
    assert.equal(result.body.data.status, 'ACTIVE');
    assert.ok(!result.body.data.paymentReference);
    assert.ok(!result.body.data.settledAt);
    assert.notEqual(result.body.data.invoiceNo, 'INV-FORGED-CUSTOMER');
    assert.notEqual(result.body.data.id, 'forged-id');
    assert.equal(result.body.taxInvoiceIssued, false);
  });
  result = await post('/api/invoices', { customer: 'CI Negative', amount: -50 }, cookie);
  verify('Client cannot record negative receivable amount', () => assert.equal(result.response.status, 400));
  result = await patch(`/api/invoices/${invoiceNo}/settle`, {}, cookie);
  verify('Invoice settlement without evidence rejected', () => assert.equal(result.response.status, 400));
  result = await patch(`/api/invoices/${invoiceNo}/settle`, { paymentReference: 'BANK-CI-12345' }, cookie);
  verify('Settlement saves payment reference', () => {
    assert.equal(result.response.status, 200);
    assert.equal(result.body.data.paymentReference, 'BANK-CI-12345');
  });

  result = await post('/api/events', { eventType: 'Fake', summary: 'Fake completion' }, cookie);
  verify('Client audit fabrication is rejected', () => assert.equal(result.response.status, 403));
  result = await post('/api/workflows/ci-id/execute', {}, cookie);
  verify('Unsupported automation fails closed', () => assert.equal(result.response.status, 501));
  result = await post('/api/state/reset', { confirm: true }, cookie);
  verify('Production database reset fails closed', () => assert.equal(result.response.status, 403));
  result = await post('/api/telegram/webhook', { update_id: 1 });
  verify('Unconfigured webhook rejects unauthenticated updates', () => assert.equal(result.response.status, 503));


  // Phase 2: typed RMA lifecycle, KB, CRM and dispute APIs must genuinely persist.
  result = await post('/api/assets', {
    assetTag: 'CI-ASSET-001', name: 'CI Test Router', brand: 'Cisco',
    serialNumber: 'CI-SERIAL-001', model: 'Test', purchaseCost: 1000
  }, cookie);
  verify('Real asset registered for RMA', () => assert.equal(result.response.status, 201));

  result = await post('/api/rma', {
    assetTag: 'CI-ASSET-001', faultSymptom: 'WAN interface fails intermittently',
    status: 'OEM_APPROVED', warrantyStatus: 'ACTIVE_WARRANTY',
    oemCaseNumber: 'FAKE-NOT-ACCEPTED', courierTracking: 'FAKE-AWB'
  }, cookie);
  verify('RMA is created without fabricated OEM/warranty/courier evidence', () => {
    assert.equal(result.response.status, 201);
    assert.equal(result.body.data.stage, 'FAULT_LOGGED');
    assert.equal(result.body.data.warrantyStatus, 'UNVERIFIED');
    assert.equal(result.body.data.oemCaseNumber, '');
    assert.equal(result.body.data.courierTracking, '');
  });
  const rmaId = result.body.data.id;
  result = await patch(`/api/rma/${rmaId}`, { stage: 'OEM_APPROVED' }, cookie);
  verify('RMA OEM approval without verified case is rejected', () => assert.equal(result.response.status, 400));
  result = await patch(`/api/rma/${rmaId}`, { stage: 'OEM_APPROVED', oemCaseNumber: 'CI-CASE-001' }, cookie);
  verify('RMA OEM approval with case persists', () => assert.equal(result.body.data.oemCaseNumber, 'CI-CASE-001'));
  result = await patch(`/api/rma/${rmaId}`, { stage: 'IN_TRANSIT' }, cookie);
  verify('RMA courier stage without AWB rejected', () => assert.equal(result.response.status, 400));

  result = await post('/api/knowledge', {
    title: 'Real verified network reset SOP',
    summary: 'Validated steps for the CI test router',
    selfServiceSteps: ['Check physical connectivity', 'Verify route table']
  }, cookie);
  verify('Knowledge article creates using actual UI fields', () => assert.equal(result.response.status, 201));
  const kbId = result.body.data.id;
  result = await post(`/api/knowledge/${kbId}/solve`, {}, cookie);
  verify('KB self-resolution count persists', () => assert.equal(result.body.data.solvedCount, 1));
  result = await patch(`/api/knowledge/${kbId}`, { solvedCount: 999 }, cookie);
  verify('Client cannot forge KB solved count', () => assert.equal(result.body.data.solvedCount, 1));

  result = await post('/api/crm', { title: 'Data Center Refresh', clientName: 'CI Customer', value: 78000, winProbability: 99 }, cookie);
  verify('CRM create cannot fabricate win probability', () => {
    assert.equal(result.response.status, 201);
    assert.equal(result.body.data.stage, 'LEAD');
    assert.equal(result.body.data.winProbability, 0);
  });
  const crmId = result.body.data.id;
  result = await patch(`/api/crm/${crmId}`, { stage: 'WON' }, cookie);
  verify('CRM cannot skip stages', () => assert.equal(result.response.status, 400));
  result = await patch(`/api/crm/${crmId}`, { stage: 'QUALIFIED' }, cookie);
  verify('CRM next stage persists', () => assert.equal(result.body.data.stage, 'QUALIFIED'));

  result = await post('/api/projects', { title: 'CI Network Installation', clientName: 'CI Customer', projectCode: 'CI-PROJ-01' }, cookie);
  verify('Real project created for dispute', () => assert.equal(result.response.status, 201));
  const projectId = result.body.data.id;
  result = await post('/api/disputes', {
    projectId, reason: 'Documented delivery disagreement', customerClaim: 'Router delivery disputed',
    disputedAmount: 1500, escrowHeld: 1500, status: 'RESOLVED_RELEASED'
  }, cookie);
  verify('Dispute starts pending with no fictional escrow held', () => {
    assert.equal(result.response.status, 201);
    assert.equal(result.body.data.escrowHeld, 0);
    assert.equal(result.body.data.status, 'UNDER_ARBITRATION');
  });
  const disputeId = result.body.data.id;
  result = await patch(`/api/disputes/${disputeId}`, { status: 'RESOLVED_REFUND' }, cookie);
  verify('Direct escrow refund status forbidden', () => assert.equal(result.response.status, 400));
  result = await patch(`/api/disputes/${disputeId}`, { resolutionDecision: 'REFUND_RECOMMENDED' }, cookie);
  verify('Dispute internal recommendation is persisted without paying money', () => {
    assert.equal(result.response.status, 200);
    assert.equal(result.body.data.resolutionDecision, 'REFUND_RECOMMENDED');
    assert.equal(result.body.data.status, 'UNDER_ARBITRATION');
  });
  result = await request('/api/state', {}, cookie);
  verify('All four new business collections appear in persisted server state', () => {
    assert.equal(result.body.data.rmaClaims.length, 1);
    assert.equal(result.body.data.knowledgeArticles.length, 1);
    assert.equal(result.body.data.crmOpportunities.length, 1);
    assert.equal(result.body.data.marketplaceDisputes.length, 1);
  });

  // Phase 5: browser CSRF metadata and sign-in failure-rate defenses.
  result = await request('/api/tenant', {
    method: 'POST', body: { name: 'Cross-Origin-Forgery' },
    headers: { origin: 'https://attacker.invalid', 'x-forwarded-host': 'attacker.invalid' }
  }, cookie);
  verify('Attacker-controlled forwarded host cannot bypass Origin checks', () =>
    assert.equal(result.response.status, 403));
  result = await request('/api/tenant', {
    method: 'POST', body: { name: 'Cross-Site-Forgery' },
    headers: { 'sec-fetch-site': 'cross-site' }
  }, cookie);
  verify('Cross-site Fetch Metadata browser mutation is rejected', () =>
    assert.equal(result.response.status, 403));
  result = await request('/api/auth/login', {
    method: 'POST', body: { username: 'owner', password: 'TestOwnerPassword!2026' },
    headers: { origin: base, 'sec-fetch-site': 'same-origin' }
  });
  verify('Valid same-origin login is not blocked by CSRF protection', () =>
    assert.equal(result.response.status, 200));
  const throttledUsername = 'ci-throttle-user';
  for (let i = 0; i < 8; i++) {
    result = await post('/api/auth/login', { username: throttledUsername, password: 'not-the-password' });
    verify('Invalid login attempt ' + (i + 1) + ' uses generic credentials error', () =>
      assert.equal(result.response.status, 401));
  }
  result = await post('/api/auth/login', { username: throttledUsername.toUpperCase(), password: 'not-the-password' });
  verify('Username case change cannot evade failed-login rate threshold', () => {
    assert.equal(result.response.status, 429);
    assert.ok(Number(result.response.headers.get('retry-after')) > 0);
    assert.ok(!('token' in result.body));
  });
  result = await post('/api/auth/login', { username: 'owner', password: 'TestOwnerPassword!2026' });
  verify('Unrelated valid user is not blocked by another username throttle', () =>
    assert.equal(result.response.status, 200));

  verify('Isolated DB was used', () => assert.ok(fs.existsSync(dbFile)));
  console.log('API SMOKE SUMMARY: ' + passed + '/' + passed + ' PASSED');
} finally {
  child.kill('SIGTERM');
  await new Promise(resolve => { if (child.exitCode !== null) resolve(); else child.once('exit', resolve); });
  fs.rmSync(dir, { recursive: true, force: true });
}
