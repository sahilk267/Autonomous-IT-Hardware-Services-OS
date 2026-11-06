// Production-mode role-permission HTTP smoke tests: isolated fixture only.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { scryptSync, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';

const dir = mkdtempSync(path.join(tmpdir(), 'apex-roles-'));
const dbFile = path.join(dir, 'roles.json');
const starter = JSON.parse(readFileSync('data/app-store.json', 'utf8'));
const password = 'OnlyForEphemeralRoleTest!2026';
for (const [role, username] of [
  ['BUSINESS_OWNER', 'owner'],
  ['SALES_MANAGER', 'sales'],
  ['FIELD_ENGINEER', 'field'],
  ['PROCUREMENT_LEAD', 'procurement'],
  ['ENTERPRISE_IT_HEAD', 'ithead']
]) {
  const salt = randomBytes(16).toString('hex');
  starter.users.push({
    id: 'ci-' + username, username, name: username, email: username + '@example.invalid',
    role, tenantId: starter.tenant.id, createdAt: new Date().toISOString(),
    salt, passwordHash: scryptSync(password, salt, 64).toString('hex')
  });
}
// Only isolated fixture records are used; this cannot mutate deployed data.
starter.invoices.push({
  customer: 'Private CI Customer', invoiceNo: 'CI-INVOICE-001',
  amount: 12000, dueInDays: 30, status: 'ACTIVE',
  createdAt: new Date().toISOString()
});
starter.crmOpportunities.push({
  id: 'ci-crm-001', title: 'Private CI Deal', clientName: 'CI Client',
  value: 5000, stage: 'LEAD', winProbability: 0,
  contactPerson: '', expectedCloseDate: '', assignedEngineer: '', category: ''
});
starter.tickets.push({
  id: 'ci-ticket-001', ticketNumber: 'CI-TICKET-001', title: 'CI Incident',
  priority: 'HIGH', status: 'OPEN', category: 'Network Outage'
});
writeFileSync(dbFile, JSON.stringify(starter));

const getPort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    server.close(() => resolve(port));
  });
});
const port = await getPort(), base = 'http://127.0.0.1:' + port;
const child = spawn(process.execPath, ['dist/server.cjs'], {
  env: {
    ...process.env, NODE_ENV: 'production', PORT: String(port),
    APEX_DATA_FILE: dbFile, APEX_ALLOW_PRODUCTION_RESET: 'false'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});
let stdout = '';
child.stdout.on('data', b => { stdout += b.toString(); });
child.stderr.on('data', b => { stdout += b.toString(); });
async function api(endpoint, { method = 'GET', body = undefined, cookie = '' } = {}) {
  const response = await fetch(base + endpoint, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie') || '' };
}
let tests = 0;
function check(name, callback) { callback(); tests++; console.log('PASS ' + name); }

try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { if ((await api('/api/health')).status === 200) { ready = true; break; } } catch { /* starting */ }
    if (child.exitCode !== null) throw new Error('Server crashed: ' + stdout);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error('Server failed to start: ' + stdout);

  const sessions = {};
  for (const role of ['owner', 'sales', 'field', 'procurement', 'ithead']) {
    const result = await api('/api/auth/login', {
      method: 'POST', body: { username: role, password }
    });
    check(role + ' authenticates with its assigned real role', () => {
      assert.equal(result.status, 200);
      assert.ok(result.cookie.includes('apex_session='));
    });
    sessions[role] = result.cookie.split(';')[0];
  }
  let r = await api('/api/state', { cookie: sessions.field });
  check('Field engineer gets only allowed state collections', () => {
    assert.equal(r.status, 200);
    assert.equal(r.data.data.invoices.length, 0);
    assert.equal(r.data.data.crmOpportunities.length, 0);
    assert.equal(r.data.data.tickets.length, 1);
    assert.equal(r.data.data.users.length, 1);
    assert.ok(!('sessions' in r.data.data));
  });
  r = await api('/api/invoices', { cookie: sessions.field });
  check('Field engineer cannot bypass state filter via invoice endpoint', () => assert.equal(r.status, 403));
  r = await api('/api/crm', { cookie: sessions.procurement });
  check('Procurement cannot read sales CRM', () => assert.equal(r.status, 403));
  r = await api('/api/disputes', { cookie: sessions.sales });
  check('Sales cannot read private dispute records', () => assert.equal(r.status, 403));
  r = await api('/api/integrations/status', { cookie: sessions.field });
  check('Field engineer cannot inspect connector configuration', () => assert.equal(r.status, 403));
  r = await api('/api/tenant', { method: 'POST', cookie: sessions.sales, body: { name: 'Injected Tenant' } });
  check('Sales cannot change tenant configuration', () => assert.equal(r.status, 403));
  r = await api('/api/invoices', { method: 'POST', cookie: sessions.procurement, body: { customer: 'Fraud', amount: 1 } });
  check('Procurement cannot create invoices', () => assert.equal(r.status, 403));
  r = await api('/api/crm', { method: 'POST', cookie: sessions.sales, body: { title: 'CI Sale', clientName: 'CI Customer', value: 100 } });
  check('Sales can create a real CRM record', () => assert.equal(r.status, 201));
  r = await api('/api/assets', { method: 'POST', cookie: sessions.field, body: { assetTag: 'NOT-AUTHORIZED', name: 'Fake Asset' } });
  check('Field engineer cannot modify asset registry', () => assert.equal(r.status, 403));
  r = await api('/api/knowledge', { method: 'POST', cookie: sessions.field, body: { title: 'Unapproved SOP', summary: 'Claim', selfServiceSteps: ['Unreviewed'] } });
  check('Field engineer cannot author published KB records', () => assert.equal(r.status, 403));
  r = await api('/api/state', { cookie: sessions.owner });
  check('Owner can inspect actual tenant collections', () => {
    assert.equal(r.status, 200);
    assert.equal(r.data.data.invoices.length, 1);
    assert.equal(r.data.data.users.length, 5);
    assert.equal(r.data.data.crmOpportunities.length, 2);
  });
  console.log('ROLE API SUMMARY: ' + tests + '/' + tests + ' PASSED');
} finally {
  child.kill('SIGTERM');
  await new Promise(resolve => child.exitCode !== null ? resolve() : child.once('exit', resolve));
  rmSync(dir, { recursive: true, force: true });
}
