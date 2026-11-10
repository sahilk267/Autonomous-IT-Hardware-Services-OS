// Real Chromium browser acceptance: five local roles, two unrelated customers.
// Never point this suite at a deployed host, live customer data or third-party providers.
import { test, expect } from '@playwright/test';
import { randomBytes, scryptSync } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';

let server: ChildProcess | null = null;
let tempFolder = '';
let base = '';
let stdout = '';
const password = 'BrowserOnlyEphemeralPassword!2026';

const portOpen = async (): Promise<number> => new Promise((resolve, reject) => {
  const socket = net.createServer();
  socket.once('error', reject);
  socket.listen(0, '127.0.0.1', () => {
    const address = socket.address();
    if (!address || typeof address === 'string') return reject(new Error('No TCP port allocated'));
    socket.close(() => resolve(address.port));
  });
});

const project = (id: string, customerId: string, name: string, collaborators: string[]) => ({
  id, customerId, projectCode: 'BROWSER-' + id, title: name,
  createdByUserId: 'ci-ithead', collaboratorUserIds: collaborators,
  clientName: customerId === 'ci-customer-a' ? 'Customer Alpha' : 'Customer Beta',
  clientLocation: '', budget: 100, category: 'Hardware Overhaul',
  scopeDescription: 'Browser-only isolated test record',
  deliverables: [], skillsRequired: [], status: 'PROPOSALS_OPEN',
  proposalsCount: 0, createdAt: '2026-11-11', milestones: []
});

test.beforeAll(async () => {
  tempFolder = mkdtempSync(path.join(tmpdir(), 'apex-browser-isolation-'));
  const store = path.join(tempFolder, 'only-ci.json');
  const data = JSON.parse(readFileSync('data/app-store.json', 'utf8'));
  data.users = [];
  for (const [username, role] of [
    ['owner', 'BUSINESS_OWNER'],
    ['sales', 'SALES_MANAGER'],
    ['procurement', 'PROCUREMENT_LEAD'],
    ['ithead', 'ENTERPRISE_IT_HEAD'],
    ['field', 'FIELD_ENGINEER']
  ]) {
    const salt = randomBytes(16).toString('hex');
    data.users.push({
      id: 'ci-' + username, username, name: username, email: username + '@example.invalid',
      role, tenantId: data.tenant.id, createdAt: new Date().toISOString(),
      salt, passwordHash: scryptSync(password, salt, 64).toString('hex')
    });
  }
  data.customers = [
    { id: 'ci-customer-a', tenantId: data.tenant.id, name: 'Customer Alpha',
      staffUserIds: ['ci-sales','ci-procurement','ci-ithead','ci-field'],
      createdAt: new Date().toISOString() },
    { id: 'ci-customer-b', tenantId: data.tenant.id, name: 'Customer Beta',
      staffUserIds: ['ci-ithead'], createdAt: new Date().toISOString() }
  ];
  data.projects = [
    project('alpha', 'ci-customer-a', 'Project Alpha Confidential', ['ci-sales','ci-procurement']),
    project('beta', 'ci-customer-b', 'Project Beta Confidential', [])
  ];
  const asset = (id: string, customerId: string, name: string) => ({
    id, customerId, assignedUserId: 'ci-field',
    assetTag: id.toUpperCase(), serialNumber: 'BROWSER-' + id,
    name, category: 'Laptop', brand: 'Test', model: 'Fixture',
    assignedUser: 'field', department: 'IT', location: '',
    purchaseDate: '', purchaseCost: 100, warrantyExpiresAt: '',
    status: 'IN_USE'
  });
  data.assets = [
    asset('asset-alpha', 'ci-customer-a', 'Alpha Asset Confidential'),
    asset('asset-beta', 'ci-customer-b', 'Beta Asset Confidential')
  ];
  writeFileSync(store, JSON.stringify(data), { mode: 0o600 });
  const port = await portOpen();
  base = 'http://localhost:' + port;
  server = spawn(process.execPath, ['dist/server.cjs'], {
    env: { ...process.env, PORT: String(port), NODE_ENV: 'production',
      APEX_DATA_FILE: store, APEX_ALLOW_PRODUCTION_RESET: 'false',
      TELEGRAM_BOT_TOKEN: '', GEMINI_API_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stdout?.on('data', b => { stdout += String(b); });
  server.stderr?.on('data', b => { stdout += String(b); });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error('CI server exited: ' + stdout);
    try { if ((await fetch(base + '/api/health')).ok) { ready = true; break; } }
    catch { /* booting */ }
    await new Promise(r => setTimeout(r, 120));
  }
  if (!ready) throw new Error('Browser fixture server not ready: ' + stdout);
});

test.afterAll(async () => {
  server?.kill('SIGTERM');
  if (tempFolder) rmSync(tempFolder, { recursive: true, force: true });
});

async function signIn(page: import('@playwright/test').Page, username: string) {
  await page.goto(base + '/');
  await expect(page.getByPlaceholder('Enter username')).toBeVisible();
  await page.getByPlaceholder('Enter username').fill(username);
  await page.getByPlaceholder('Enter password').fill(password);
  await page.getByRole('button', { name: 'Authenticate & Access OS' }).click();
  await expect(page.getByRole('button', { name: 'Projects & Marketplace' })).toBeVisible();
  await expect(page.getByPlaceholder('Enter username')).toHaveCount(0);
}

for (const role of [
  { username: 'owner', alpha: true, beta: true },
  { username: 'sales', alpha: true, beta: false },
  { username: 'procurement', alpha: true, beta: false },
  { username: 'ithead', alpha: true, beta: true },
  { username: 'field', alpha: false, beta: false }
]) {
  test('real browser: ' + role.username + ' project and customer isolation', async ({ page }) => {
    await signIn(page, role.username);
    await page.getByRole('button', { name: 'Projects & Marketplace' }).click();
    const alpha = page.getByText('Project Alpha Confidential').first();
    const beta = page.getByText('Project Beta Confidential').first();
    if (role.alpha) await expect(alpha).toBeVisible();
    else await expect(alpha).toHaveCount(0);
    if (role.beta) await expect(beta).toBeVisible();
    else await expect(beta).toHaveCount(0);
    const state = await page.evaluate(async () => {
      const response = await fetch('/api/state');
      return { status: response.status, body: await response.json() };
    });
    expect(state.status).toBe(200);
    const names = (state.body.data.projects as {title:string}[]).map(project => project.title);
    expect(names.includes('Project Alpha Confidential')).toBe(role.alpha);
    expect(names.includes('Project Beta Confidential')).toBe(role.beta);
    if (role.username === 'owner') {
      await page.getByRole('button', { name: 'Account Security & Staff' }).click();
      await expect(page.getByText('Customer Registry & Internal Staff Access')).toBeVisible();
      await expect(page.getByText('Customer Alpha').first()).toBeVisible();
      await expect(page.getByText('Customer Beta').first()).toBeVisible();
    } else if (role.username === 'field') {
      await page.getByRole('button', { name: 'Assets, AMC & SaaS' }).click();
      await expect(page.getByText('Alpha Asset Confidential')).toBeVisible();
      await expect(page.getByText('Beta Asset Confidential')).toHaveCount(0);
      const assetResult = await page.evaluate(async () => (await fetch('/api/assets')).json());
      expect(assetResult.data.map((item: {id: string}) => item.id)).toEqual(['asset-alpha']);
    }
  });
}

test('real browser: anonymous access blocked before sign-in', async ({ page }) => {
  await page.goto(base + '/');
  await expect(page.getByPlaceholder('Enter username')).toBeVisible();
  const result = await page.evaluate(async () => {
    const response = await fetch('/api/state');
    return response.status;
  });
  expect(result).toBe(401);
});


test('real browser: owner grant and customer revocation propagate across existing sales session', async ({ page, browser }) => {
  // No mocked fetch. All clicks update the ephemeral production-mode HTTP server.
  await signIn(page, 'owner');
  await page.getByRole('button', { name: 'Account Security & Staff' }).click();
  const betaGrant = page.getByRole('combobox', { name: 'Select staff for Customer Beta' });
  await betaGrant.selectOption('ci-sales');
  await betaGrant.locator('..').getByRole('button', { name: 'Grant' }).click();
  await expect(page.getByText('Customer staff access granted locally', { exact: false })).toBeVisible();

  await page.getByRole('button', { name: 'Projects & Marketplace' }).click();
  await page.getByText('Project Beta Confidential').first().click();
  const share = page.getByRole('combobox', { name: 'Choose internal project collaborator' });
  await share.selectOption('ci-sales');
  await share.locator('..').getByRole('button', { name: 'Grant' }).click();
  await expect(page.getByText('Local staff access updated', { exact: false })).toBeVisible();

  const salesContext = await browser.newContext();
  try {
    const salesPage = await salesContext.newPage();
    await signIn(salesPage, 'sales');
    await salesPage.getByRole('button', { name: 'Projects & Marketplace' }).click();
    await expect(salesPage.getByText('Project Beta Confidential').first()).toBeVisible();

    await page.getByRole('button', { name: 'Account Security & Staff' }).click();
    const betaRow = page.getByText('Customer Beta', { exact: true }).locator('..');
    await betaRow.getByText('sales (SALES_MANAGER)', { exact: true })
      .locator('..').getByRole('button', { name: 'Revoke' }).click();
    await expect(page.getByText('Customer staff access revoked locally', { exact: false })).toBeVisible();

    const afterRevoke = await salesPage.evaluate(async () => (await fetch('/api/projects')).json());
    expect(afterRevoke.data.some((project: {id: string}) => project.id === 'beta')).toBe(false);
    await salesPage.reload();
    await salesPage.getByRole('button', { name: 'Projects & Marketplace' }).click();
    await expect(salesPage.getByText('Project Beta Confidential')).toHaveCount(0);
  } finally {
    await salesContext.close();
  }
});
