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
starter.customers = [{
  id: 'ci-customer-a', tenantId: starter.tenant.id, name: 'Role CI Client',
  createdAt: new Date().toISOString(), staffUserIds: ['ci-sales', 'ci-field', 'ci-ithead', 'ci-procurement']
}];
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
  priority: 'HIGH', status: 'OPEN', category: 'Network Outage', assignedUserId: 'ci-field'
});
starter.tickets.push({
  id: 'ci-ticket-private', ticketNumber: 'CI-TICKET-PRIVATE', title: 'Private Unassigned Incident',
  priority: 'MEDIUM', status: 'OPEN', category: 'Hardware Fault', assignedAgent: 'Unassigned'
});
starter.jobs.push({
  id: 'ci-job-owned', jobCode: 'CI-JOB-OWNED', title: 'Assigned router task',
  assignedUserId: 'ci-field', technicianName: 'field', customerName: 'CI Client',
  status: 'SCHEDULED', partsConsumed: [], customerSignatureObtained: false
});
starter.jobs.push({
  id: 'ci-job-unassigned', jobCode: 'CI-JOB-UNASSIGNED', title: 'Unassigned private work',
  technicianName: 'Unassigned', customerName: 'CI Private',
  status: 'SCHEDULED', partsConsumed: [], customerSignatureObtained: false
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
    APEX_DATA_FILE: dbFile, APEX_ALLOW_PRODUCTION_RESET: 'false',
    TELEGRAM_WEBHOOK_SECRET: 'ci-only-webhook-secret',
    TELEGRAM_AUTHORIZED_USER_ID: '101',
    TELEGRAM_AUTHORIZED_CHAT_ID: '201',
    TELEGRAM_BOT_TOKEN: ''
  },
  stdio: ['ignore', 'pipe', 'pipe']
});
let stdout = '';
child.stdout.on('data', b => { stdout += b.toString(); });
child.stderr.on('data', b => { stdout += b.toString(); });
async function api(endpoint, { method = 'GET', body = undefined, cookie = '', extraHeaders = {} } = {}) {
  const response = await fetch(base + endpoint, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
      ...extraHeaders
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
  r = await api('/api/projects', {
    method: 'POST', cookie: sessions.ithead,
    body: { customerId: 'ci-customer-a', title: 'Role-scoped CI project', clientName: 'Role CI Client', budget: 500 }
  });
  check('IT manager can create a project with server-authoritative defaults', () =>
    assert.equal(r.status, 201));
  const projectForRole = r.data.data.id;
  r = await api('/api/projects/' + projectForRole, {
    method: 'PATCH', cookie: sessions.ithead, body: { budget: 999999 }
  });
  check('IT manager cannot change project budget', () => assert.equal(r.status, 403));
  r = await api('/api/projects/' + projectForRole + '/milestones', {
    method: 'POST', cookie: sessions.ithead, body: { title: 'Unauthorized', amount: 100, dueDate: '2026-12-31' }
  });
  check('IT manager cannot create owner-only project milestones', () => assert.equal(r.status, 403));
  r = await api('/api/projects/' + projectForRole, {
    method: 'PATCH', cookie: sessions.sales, body: { status: 'COMPLETED' }
  });
  check('Sales cannot forge project status through patch endpoint', () => assert.equal(r.status, 403));
  r = await api('/api/proposals', {
    method: 'POST', cookie: sessions.field,
    body: { projectId: projectForRole, providerName: 'Unauthorized', commercialBid: 10, timelineDays: 5 }
  });
  check('Field engineer cannot submit procurement/project proposal', () => assert.equal(r.status, 403));
  r = await api('/api/proposals', {
    method: 'POST', cookie: sessions.sales,
    body: { projectId: projectForRole, providerName: 'Unauthorized Bid', commercialBid: 300, timelineDays: 10 }
  });
  check('Sales cannot submit into another staff member private project', () => assert.equal(r.status, 404));
  r = await api('/api/projects', { cookie: sessions.sales });
  check('Sales cannot list a private IT-managed project', () =>
    assert.ok(!r.data.data.some(p => p.id === projectForRole)));
  r = await api('/api/projects/' + projectForRole + '/access', {
    method: 'PATCH', cookie: sessions.ithead, body: { userId: 'ci-sales', grant: true }
  });
  check('Project creator cannot self-assign collaborators', () => assert.equal(r.status, 403));
  r = await api('/api/projects/' + projectForRole + '/access', {
    method: 'PATCH', cookie: sessions.owner, body: { userId: 'ci-sales', grant: true }
  });
  check('Owner can explicitly grant project access to sales', () => {
    assert.equal(r.status, 200);
    assert.ok(r.data.data.collaboratorUserIds.includes('ci-sales'));
  });
  r = await api('/api/proposals', {
    method: 'POST', cookie: sessions.sales,
    body: { projectId: projectForRole, providerName: 'Sales Bid', commercialBid: 300, timelineDays: 10,
      id: 'forged-id', status: 'ACCEPTED', providerVerified: true }
  });
  check('Sales can submit but cannot forge accepted or verified bid', () => {
    assert.equal(r.status, 201);
    assert.equal(r.data.data.status, 'SUBMITTED');
    assert.equal(r.data.data.providerVerified, false);
    assert.notEqual(r.data.data.id, 'forged-id');
  });
  const salesProposalId = r.data.data.id;
  r = await api('/api/proposals/' + salesProposalId + '/accept', {
    method: 'PATCH', cookie: sessions.sales
  });
  check('Sales cannot award their own proposal', () => assert.equal(r.status, 403));
  r = await api('/api/proposals/' + salesProposalId + '/accept', {
    method: 'PATCH', cookie: sessions.owner
  });
  check('Owner can award a real submitted proposal', () => {
    assert.equal(r.status, 200);
    assert.equal(r.data.data.status, 'ACCEPTED');
    assert.equal(r.data.project.status, 'IN_PROGRESS');
    assert.equal(r.data.providerNotified, false);
  });

  // Phase 8: same-tenant object authorization is enforced for state AND direct lists.
  r = await api('/api/assets', { method: 'POST', cookie: sessions.owner,
    body: { customerId: 'ci-customer-a', id: 'forged-object', assetTag: 'CI-FIELD-01', name: 'CI Service Asset',
      assignedUserId: 'ci-field', assignedUser: 'field', purchaseCost: 1200 } });
  check('Asset create ignores forged object ID and user assignment', () => {
    assert.equal(r.status, 201);
    assert.notEqual(r.data.data.id, 'forged-object');
    assert.equal(r.data.data.assignedUserId, undefined);
  });
  const ownedAssetId = r.data.data.id;
  r = await api('/api/assets', { method: 'POST', cookie: sessions.owner,
    body: { customerId: 'ci-customer-a', assetTag: 'CI-PRIVATE-01', name: 'Confidential Client Asset', assignedUser: 'field' } });
  check('Private asset creates without granting field access by display name', () =>
    assert.equal(r.status, 201));
  const privateAssetId = r.data.data.id;
  r = await api('/api/assets', { cookie: sessions.field });
  check('Field cannot read private or unassigned assets', () => assert.equal(r.data.data.length, 0));
  r = await api('/api/assets/' + ownedAssetId + '/assign', { method: 'PATCH', cookie: sessions.field,
    body: { assignedUserId: 'ci-field' } });
  check('Field cannot self-assign an asset', () => assert.equal(r.status, 403));
  r = await api('/api/assets/' + ownedAssetId + '/assign', { method: 'PATCH', cookie: sessions.ithead,
    body: { assignedUserId: 'ci-sales' } });
  check('IT manager cannot assign asset to a non-field role', () => assert.equal(r.status, 400));
  r = await api('/api/assets/' + ownedAssetId + '/assign', { method: 'PATCH', cookie: sessions.ithead,
    body: { assignedUserId: 'ci-field' } });
  check('IT manager can assign asset to stable field engineer ID', () =>
    assert.equal(r.data.data.assignedUserId, 'ci-field'));
  r = await api('/api/assets/' + ownedAssetId, { method: 'PATCH', cookie: sessions.ithead,
    body: { assignedUserId: 'ci-owner', purchaseCost: 0 } });
  check('Asset generic patch cannot alter identity or financial fields', () => assert.equal(r.status, 400));
  r = await api('/api/assets', { cookie: sessions.field });
  check('Field asset list includes only explicit ID assignment', () =>
    assert.deepEqual(r.data.data.map(a => a.id), [ownedAssetId]));
  r = await api('/api/endpoints', { method: 'POST', cookie: sessions.ithead,
    body: { customerId: 'ci-customer-a', id: 'forged-ep', deviceName: 'CI Service Endpoint', assignedUserId: 'ci-field', assignedUser: 'field' } });
  check('Endpoint registration does not permit client-assigned field access', () => {
    assert.equal(r.status, 201);
    assert.equal(r.data.data.assignedUserId, undefined);
  });
  const ownedEndpointId = r.data.data.id;
  r = await api('/api/endpoints', { method: 'POST', cookie: sessions.owner,
    body: { customerId: 'ci-customer-a', deviceName: 'Confidential Customer Endpoint', assignedUser: 'field' } });
  check('Private endpoint registered without engineer grant', () => assert.equal(r.status, 201));
  r = await api('/api/endpoints', { cookie: sessions.field });
  check('Field cannot read endpoint without explicit assignment', () =>
    assert.equal(r.data.data.length, 0));
  r = await api('/api/endpoints/' + ownedEndpointId + '/assign', { method: 'PATCH', cookie: sessions.owner,
    body: { assignedUserId: 'ci-field' } });
  check('Owner grants endpoint visibility using exact staff ID', () =>
    assert.equal(r.data.data.assignedUserId, 'ci-field'));
  r = await api('/api/endpoints', { cookie: sessions.field });
  check('Field endpoint list is scoped after assignment', () =>
    assert.deepEqual(r.data.data.map(e => e.id), [ownedEndpointId]));
  r = await api('/api/rma', { method: 'POST', cookie: sessions.field,
    body: { assetTag: 'CI-PRIVATE-01', faultSymptom: 'Unauthorized confidential device request' } });
  check('Field cannot create RMA for another customer asset', () => assert.equal(r.status, 404));
  r = await api('/api/rma', { method: 'POST', cookie: sessions.owner,
    body: { assetTag: 'CI-PRIVATE-01', faultSymptom: 'Private owner-only RMA' } });
  check('Owner can record a private RMA', () => assert.equal(r.status, 201));
  r = await api('/api/rma', { method: 'POST', cookie: sessions.field,
    body: { assetTag: 'CI-FIELD-01', faultSymptom: 'Assigned field device failure' } });
  check('Field can create RMA for an assigned asset', () => assert.equal(r.status, 201));
  const ownedRmaId = r.data.data.id;
  r = await api('/api/rma', { cookie: sessions.field });
  check('Field RMA list is limited to linked assigned assets', () =>
    assert.deepEqual(r.data.data.map(e => e.id), [ownedRmaId]));
  r = await api('/api/state', { cookie: sessions.field });
  check('State response cannot bypass asset, endpoint, or RMA filters', () => {
    assert.deepEqual(r.data.data.assets.map(a => a.id), [ownedAssetId]);
    assert.deepEqual(r.data.data.endpoints.map(e => e.id), [ownedEndpointId]);
    assert.deepEqual(r.data.data.rmaClaims.map(e => e.id), [ownedRmaId]);
  });
  r = await api('/api/assets/' + ownedAssetId + '/assign', { method: 'PATCH', cookie: sessions.owner,
    body: { assignedUserId: null } });
  check('Owner revokes asset access without deleting business data', () => assert.equal(r.status, 200));
  r = await api('/api/rma', { cookie: sessions.field });
  check('Revoking asset access also hides linked RMA', () => assert.equal(r.data.data.length, 0));
  r = await api('/api/assets', { cookie: sessions.owner });
  check('Owner retains legacy/private and unassigned asset records', () => assert.equal(r.data.data.length, 2));
  r = await api('/api/assets', { cookie: sessions.procurement });
  check('Procurement lead retains internal inventory visibility by trusted role', () =>
    assert.equal(r.data.data.length, 2));
  r = await api('/api/projects', { cookie: sessions.procurement });
  check('Procurement cannot enumerate unshared projects', () =>
    assert.ok(!r.data.data.some(p => p.id === projectForRole)));
  r = await api('/api/projects/' + projectForRole + '/access', {
    method: 'PATCH', cookie: sessions.owner, body: { userId: 'ci-sales', grant: false }
  });
  check('Owner can revoke project collaborator access', () => assert.equal(r.status, 200));
  r = await api('/api/proposals', { cookie: sessions.sales });
  check('Revocation immediately removes linked proposals from direct endpoint', () =>
    assert.ok(!r.data.data.some(p => p.id === salesProposalId)));
  r = await api('/api/state', { cookie: sessions.sales });
  check('Revocation also removes project and proposals from state response', () => {
    assert.ok(!r.data.data.projects.some(p => p.id === projectForRole));
    assert.ok(!r.data.data.proposals.some(p => p.projectId === projectForRole));
  });
  r = await api('/api/projects/' + projectForRole, { method: 'PATCH',
    cookie: sessions.ithead, body: { scopeDescription: 'Legitimate project update' } });
  check('Original IT project creator retains project editing rights', () => assert.equal(r.status, 200));

  // Phase 9: two customer accounts with explicit grants, no customer-name inference.
  r = await api('/api/customers', { cookie: sessions.field });
  check('Field customer registry includes only explicitly granted account', () =>
    assert.deepEqual(r.data.data.map(c => c.id), ['ci-customer-a']));
  r = await api('/api/customers', { method: 'POST', cookie: sessions.sales, body: { name: 'Customer B' } });
  check('Sales cannot fabricate a new customer identity', () => assert.equal(r.status, 403));
  r = await api('/api/customers', { method: 'POST', cookie: sessions.owner, body: { name: 'Customer B' } });
  check('Owner can register an independent customer B', () => assert.equal(r.status, 201));
  const customerB = r.data.data.id;
  r = await api('/api/customers', { cookie: sessions.sales });
  check('Sales cannot enumerate ungranted customer B', () =>
    assert.ok(!r.data.data.some(c => c.id === customerB)));
  r = await api('/api/projects', { method: 'POST', cookie: sessions.ithead,
    body: { customerId: customerB, title: 'Cross-customer project', clientName: 'Customer B', budget: 250 } });
  check('IT head cannot create a project for unauthorized customer B', () => assert.equal(r.status, 404));
  r = await api('/api/assets', { method: 'POST', cookie: sessions.ithead,
    body: { customerId: customerB, name: 'Cross-customer asset', assetTag: 'CI-CROSS-ASSET' } });
  check('IT head cannot create another customer asset', () => assert.equal(r.status, 404));
  r = await api('/api/endpoints', { method: 'POST', cookie: sessions.ithead,
    body: { customerId: customerB, deviceName: 'Cross-customer endpoint' } });
  check('IT head cannot register another customer endpoint', () => assert.equal(r.status, 404));
  r = await api('/api/assets', { method: 'POST', cookie: sessions.owner,
    body: { customerId: customerB, name: 'B-only Asset', assetTag: 'CI-CUSTOMER-B' } });
  check('Owner can create isolated customer B asset', () => assert.equal(r.status, 201));
  const assetBId = r.data.data.id;
  r = await api('/api/assets/' + assetBId + '/assign', { method: 'PATCH', cookie: sessions.owner,
    body: { assignedUserId: 'ci-field' } });
  check('Even owner cannot assign customer B asset to engineer without B membership', () =>
    assert.equal(r.status, 403));
  r = await api('/api/customers/' + customerB + '/access', { method: 'PATCH', cookie: sessions.ithead,
    body: { userId: 'ci-field', grant: true } });
  check('IT manager cannot grant customer membership', () => assert.equal(r.status, 403));
  r = await api('/api/customers/' + customerB + '/access', { method: 'PATCH', cookie: sessions.owner,
    body: { userId: 'ci-field', grant: true } });
  check('Owner explicitly grants field engineer customer B membership', () =>
    assert.ok(r.data.data.staffUserIds.includes('ci-field')));
  r = await api('/api/assets/' + assetBId + '/assign', { method: 'PATCH', cookie: sessions.owner,
    body: { assignedUserId: 'ci-field' } });
  check('Customer B asset assignment succeeds only after explicit customer grant', () =>
    assert.equal(r.status, 200));
  r = await api('/api/assets', { cookie: sessions.field });
  check('Engineer can now read assigned record in granted B', () =>
    assert.ok(r.data.data.some(a => a.id === assetBId)));
  r = await api('/api/rma', { method: 'POST', cookie: sessions.field,
    body: { assetTag: 'CI-CUSTOMER-B', faultSymptom: 'Customer B actual problem' } });
  check('Engineer can log RMA for B while authorized', () => assert.equal(r.status, 201));
  const rmaBId = r.data.data.id;
  r = await api('/api/customers/' + customerB + '/access', { method: 'PATCH', cookie: sessions.owner,
    body: { userId: 'ci-field', grant: false } });
  check('Owner revokes customer B membership atomically', () =>
    assert.ok(!r.data.data.staffUserIds.includes('ci-field')));
  r = await api('/api/state', { cookie: sessions.field });
  check('Customer revocation immediately hides B asset and linked RMA in /api/state', () => {
    assert.ok(!r.data.data.assets.some(a => a.id === assetBId));
    assert.ok(!r.data.data.rmaClaims.some(a => a.id === rmaBId));
    assert.ok(!r.data.data.customers.some(c => c.id === customerB));
  });
  r = await api('/api/assets', { cookie: sessions.field });
  check('Direct asset list cannot bypass customer B revocation', () =>
    assert.ok(!r.data.data.some(a => a.id === assetBId)));
  r = await api('/api/rma', { cookie: sessions.field });
  check('Direct RMA list cannot bypass customer B revocation', () =>
    assert.ok(!r.data.data.some(a => a.id === rmaBId)));
  r = await api('/api/projects', { method: 'POST', cookie: sessions.owner,
    body: { customerId: customerB, title: 'Customer B private project',
      clientName: 'Role CI Client', budget: 50 } });
  check('Owner cannot impersonate customer A name under customer B identity', () =>
    assert.equal(r.status, 400));
  r = await api('/api/customers/' + customerB + '/access', { method: 'PATCH', cookie: sessions.owner,
    body: { userId: 'ci-sales', grant: true } });
  check('Owner can permit sales access to customer B', () => assert.equal(r.status, 200));
  r = await api('/api/projects/' + projectForRole + '/access', {
    method: 'PATCH', cookie: sessions.owner, body: { userId: 'ci-procurement', grant: true }
  });
  check('Owner can share project with a customer-authorized procurement lead', () =>
    assert.equal(r.status, 200));

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
  // Phase 5: field engineer can only read / mutate specifically owned records.
  r = await api('/api/state', { cookie: sessions.field });
  check('Field state only contains own tickets and assigned jobs', () => {
    assert.equal(r.status, 200);
    assert.deepEqual(r.data.data.tickets.map(t => t.id), ['ci-ticket-001']);
    assert.deepEqual(r.data.data.jobs.map(j => j.id), ['ci-job-owned']);
  });
  r = await api('/api/tickets', { cookie: sessions.field });
  check('Direct ticket list cannot bypass field record filters', () =>
    assert.deepEqual(r.data.data.map(t => t.id), ['ci-ticket-001']));
  r = await api('/api/jobs', { cookie: sessions.field });
  check('Direct job list cannot bypass field record filters', () =>
    assert.deepEqual(r.data.data.map(j => j.id), ['ci-job-owned']));
  r = await api('/api/field-engineers', { cookie: sessions.field });
  check('Field engineer cannot enumerate staff directory', () => assert.equal(r.status, 403));
  r = await api('/api/field-engineers', { cookie: sessions.ithead });
  check('IT manager sees only ID and name of active eligible engineers', () => {
    assert.equal(r.status, 200);
    assert.equal(r.data.data.length, 1);
    assert.deepEqual(Object.keys(r.data.data[0]).sort(), ['id','name','username']);
  });
  r = await api('/api/jobs/ci-job-unassigned', {
    method: 'PATCH', cookie: sessions.field, body: { status: 'COMPLETED' }
  });
  check('Field engineer cannot change an unassigned job', () => assert.equal(r.status, 404));
  r = await api('/api/jobs/ci-job-unassigned/consume-part', {
    method: 'POST', cookie: sessions.field, body: { productId: 'whatever', quantity: 1 }
  });
  check('Field engineer cannot consume parts on another job', () => assert.equal(r.status, 404));
  r = await api('/api/jobs/ci-job-owned', {
    method: 'PATCH', cookie: sessions.field,
    body: { status: 'EN_ROUTE', customerSignatureObtained: true }
  });
  check('Field engineer cannot forge customer sign-off', () => assert.equal(r.status, 400));
  r = await api('/api/jobs/ci-job-owned', {
    method: 'PATCH', cookie: sessions.field, body: { status: 'COMPLETED' }
  });
  check('Field engineer cannot skip job progress stages', () => assert.equal(r.status, 409));
  r = await api('/api/jobs/ci-job-owned', {
    method: 'PATCH', cookie: sessions.field, body: { status: 'EN_ROUTE' }
  });
  check('Assigned field engineer can advance job by one stage', () => assert.equal(r.status, 200));
  r = await api('/api/jobs/ci-job-unassigned/assign', {
    method: 'PATCH', cookie: sessions.field, body: { assignedUserId: 'ci-field' }
  });
  check('Field cannot assign itself to unassigned jobs', () => assert.equal(r.status, 403));
  r = await api('/api/jobs/ci-job-unassigned/assign', {
    method: 'PATCH', cookie: sessions.ithead, body: { assignedUserId: 'ci-owner' }
  });
  check('Manager cannot assign job to non-field role', () => assert.equal(r.status, 400));
  r = await api('/api/jobs/ci-job-unassigned/assign', {
    method: 'PATCH', cookie: sessions.ithead, body: { assignedUserId: 'ci-field' }
  });
  check('Manager can assign previously unassigned job to real field identity', () => {
    assert.equal(r.status, 200);
    assert.equal(r.data.data.assignedUserId, 'ci-field');
    assert.equal(r.data.externalDispatchSent, false);
  });
  r = await api('/api/tickets/ci-ticket-private', {
    method: 'PATCH', cookie: sessions.field, body: { status: 'RESOLVED' }
  });
  check('Field cannot modify unassigned private ticket', () => assert.equal(r.status, 404));
  r = await api('/api/tickets/ci-ticket-private/assign', {
    method: 'PATCH', cookie: sessions.ithead, body: { assignedUserId: 'ci-field' }
  });
  check('Manager can explicitly assign ticket to field identity', () => {
    assert.equal(r.status, 200);
    assert.equal(r.data.data.assignedUserId, 'ci-field');
    assert.equal(r.data.externalNotificationSent, false);
  });
  r = await api('/api/tickets/ci-ticket-private', {
    method: 'PATCH', cookie: sessions.field, body: { status: 'IN_PROGRESS' }
  });
  check('Assigned engineer can update ticket status', () => assert.equal(r.status, 200));
  r = await api('/api/tickets/ci-ticket-private', {
    method: 'PATCH', cookie: sessions.field, body: { assignedUserId: 'ci-owner', priority: 'CRITICAL' }
  });
  check('Field cannot forge ticket assignee or priority', () => assert.equal(r.status, 400));

  // Official Telegram webhook replay handling with an isolated, authorized test fixture.
  const telegramUpdate = {
    update_id: 90001,
    message: { from: { id: 101, first_name: 'Test Owner' }, chat: { id: 201 }, text: '/pending' }
  };
  const extraHeaders = { 'x-telegram-bot-api-secret-token': 'ci-only-webhook-secret' };
  r = await api('/api/telegram/webhook', { method: 'POST', body: telegramUpdate, extraHeaders });
  check('Authorized Telegram webhook update records once', () => {
    assert.equal(r.status, 200);
    assert.equal(r.data.handled, 'message');
  });
  r = await api('/api/telegram/webhook', { method: 'POST', body: telegramUpdate, extraHeaders });
  check('Replayed Telegram update ID is ignored', () => {
    assert.equal(r.status, 200);
    assert.equal(r.data.handled, 'duplicate_ignored');
  });
  r = await api('/api/telegram/webhook', {
    method: 'POST', extraHeaders,
    body: { update_id: 90002, message: { from: { id: 102 }, chat: { id: 201 }, text: '/pending' } }
  });
  check('Telegram webhook from unauthorized sender is rejected', () => assert.equal(r.status, 403));
  r = await api('/api/state', { cookie: sessions.owner });
  check('Webhook replay does not duplicate stored command records', () => {
    assert.equal(r.status, 200);
    assert.equal(r.data.data.telegramMessages.length, 1);
    assert.ok(!('processedTelegramUpdateIds' in r.data.data));
  });
  r = await api('/api/telegram/send', { method: 'POST', cookie: sessions.field, body: { text: 'Do not send' } });
  check('Field engineer cannot invoke external Telegram send', () => assert.equal(r.status, 403));

  // Phase 4 local staff lifecycle and password revocation. All identities are disposable.
  r = await api('/api/admin/staff', { cookie: sessions.sales });
  check('Non-owner cannot list private staff identities', () => assert.equal(r.status, 403));
  r = await api('/api/admin/staff', { cookie: sessions.owner });
  check('Owner can list staff without password hashes or salts', () => {
    assert.equal(r.status, 200);
    assert.equal(r.data.data.length, 5);
    assert.ok(r.data.data.every(u => !('passwordHash' in u) && !('salt' in u)));
  });
  const staffInput = {
    username: 'phase4field', name: 'Phase Four Field', email: 'phase4field@example.invalid',
    role: 'FIELD_ENGINEER', temporaryPassword: 'Phase4TemporaryPassword!2026',
    id: 'injected-id', tenantId: 'injected-tenant', disabledAt: '2020-01-01'
  };
  r = await api('/api/admin/staff', { method: 'POST', cookie: sessions.sales, body: staffInput });
  check('Sales manager cannot create a staff account', () => assert.equal(r.status, 403));
  r = await api('/api/admin/staff', {
    method: 'POST', cookie: sessions.owner,
    body: { ...staffInput, role: 'BUSINESS_OWNER' }
  });
  check('Owner-only staff API rejects creating another owner role', () => assert.equal(r.status, 400));
  r = await api('/api/admin/staff', { method: 'POST', cookie: sessions.owner, body: staffInput });
  check('Owner creates real local staff with authoritative ID and tenant', () => {
    assert.equal(r.status, 201);
    assert.equal(r.data.data.role, 'FIELD_ENGINEER');
    assert.notEqual(r.data.data.id, 'injected-id');
    assert.equal(r.data.data.tenantId, starter.tenant.id);
    assert.ok(!r.data.data.disabledAt);
    assert.ok(!('passwordHash' in r.data.data));
    assert.ok(!('temporaryPassword' in r.data.data));
    assert.equal(r.data.externalProvisioning, false);
  });
  const newStaffId = r.data.data.id;
  r = await api('/api/admin/staff', { method: 'POST', cookie: sessions.owner, body: staffInput });
  check('Duplicate staff username/email is rejected', () => assert.equal(r.status, 409));
  r = await api('/api/auth/login', {
    method: 'POST', body: { username: 'phase4field', password: staffInput.temporaryPassword }
  });
  check('New staff account can sign in using actual password', () => assert.equal(r.status, 200));
  const newStaffCookie = r.cookie.split(';')[0];
  r = await api(`/api/admin/staff/${newStaffId}/disable`, { method: 'PATCH', cookie: sessions.owner });
  check('Owner disables staff and reports external deprovisioning as false', () => {
    assert.equal(r.status, 200);
    assert.ok(r.data.data.disabledAt);
    assert.equal(r.data.externalDeprovisioning, false);
  });
  r = await api('/api/state', { cookie: newStaffCookie });
  check('Disabled staff existing session is revoked', () => assert.equal(r.status, 401));
  r = await api('/api/auth/login', {
    method: 'POST', body: { username: 'phase4field', password: staffInput.temporaryPassword }
  });
  check('Disabled staff cannot log in again', () => assert.equal(r.status, 401));
  r = await api('/api/admin/staff/ci-owner/disable', { method: 'PATCH', cookie: sessions.owner });
  check('Owner cannot disable their own business-owner identity', () => assert.equal(r.status, 403));
  r = await api('/api/auth/change-password', {
    method: 'POST', cookie: sessions.field,
    body: { currentPassword: 'wrong-password', newPassword: 'Phase4NewPassword!2026' }
  });
  check('Password rotation requires correct current password', () => assert.equal(r.status, 403));
  r = await api('/api/auth/change-password', {
    method: 'POST', cookie: sessions.field,
    body: { currentPassword: password, newPassword: 'short' }
  });
  check('Weak replacement password is rejected', () => assert.equal(r.status, 400));
  r = await api('/api/auth/change-password', {
    method: 'POST', cookie: sessions.field,
    body: { currentPassword: password, newPassword: 'Phase4NewPassword!2026' }
  });
  check('Valid password rotation revokes all sessions and clears browser cookie', () => {
    assert.equal(r.status, 200);
    assert.equal(r.data.reauthenticationRequired, true);
    assert.match(r.cookie, /Max-Age=0/);
  });
  r = await api('/api/state', { cookie: sessions.field });
  check('Old session cannot read private data after password rotation', () => assert.equal(r.status, 401));
  r = await api('/api/auth/login', {
    method: 'POST', body: { username: 'field', password }
  });
  check('Old password cannot authenticate after rotation', () => assert.equal(r.status, 401));
  r = await api('/api/auth/login', {
    method: 'POST', body: { username: 'field', password: 'Phase4NewPassword!2026' }
  });
  check('New password can authenticate after rotation', () => assert.equal(r.status, 200));
  r = await api('/api/state', { cookie: sessions.owner });
  check('Staff audit events and account disable persist atomically', () => {
    assert.equal(r.status, 200);
    assert.ok(r.data.data.events.some(e => e.eventType === 'StaffAccountCreated'));
    assert.ok(r.data.data.events.some(e => e.eventType === 'StaffAccountDisabled'));
    assert.ok(r.data.data.events.some(e => e.eventType === 'PasswordChanged'));
    assert.ok(r.data.data.users.find(u => u.id === newStaffId)?.disabledAt);
  });

  console.log('ROLE API SUMMARY: ' + tests + '/' + tests + ' PASSED');
} finally {
  child.kill('SIGTERM');
  await new Promise(resolve => child.exitCode !== null ? resolve() : child.once('exit', resolve));
  rmSync(dir, { recursive: true, force: true });
}
