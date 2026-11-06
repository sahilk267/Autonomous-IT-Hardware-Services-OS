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
  verify('Quote uses discountAmount and includes service revenue', () => {
    assert.equal(result.response.status, 201);
    assert.equal(result.body.data.subtotal, 450);
    assert.equal(result.body.data.discountAmount, 50);
    assert.equal(result.body.data.totalAmount, 472);
    assert.equal(result.body.data.status, 'DRAFT');
  });

  result = await post('/api/invoices', { customer: 'Test Client', amount: 472, status: 'ACTIVE' }, cookie);
  verify('Invoice draft saved', () => assert.equal(result.response.status, 201));
  const invoiceNo = result.body.data.invoiceNo;
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

  verify('Isolated DB was used', () => assert.ok(fs.existsSync(dbFile)));
  console.log('API SMOKE SUMMARY: ' + passed + '/' + passed + ' PASSED');
} finally {
  child.kill('SIGTERM');
  await new Promise(resolve => { if (child.exitCode !== null) resolve(); else child.once('exit', resolve); });
  fs.rmSync(dir, { recursive: true, force: true });
}
