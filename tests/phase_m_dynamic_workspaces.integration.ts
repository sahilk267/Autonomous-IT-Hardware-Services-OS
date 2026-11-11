import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import pg from 'pg';
import { applyMigrations, provisionTenant } from '../scripts/postgres-admin.mjs';
import { issueSessionToken, sessionTenantHint } from '../server/postgres/workspaceIdentity.ts';
import { deriveWorkspaceSetupToken } from '../server/security.ts';

const testConnection = process.env.PG_TEST_URL;
const u = testConnection && new URL(testConnection);
if (!u || !['localhost', '127.0.0.1'].includes(u.hostname) || u.pathname !== '/apex_phase_l_ci') {
  throw new Error('Dynamic workspace acceptance restricted to disposable local /apex_phase_l_ci database');
}
const dbUrl = new URL(u);
dbUrl.pathname = '/apex_phase_m_dynamic_ci';
const password = crypto.randomBytes(24).toString('hex');
const appUrl = new URL(dbUrl);
appUrl.username = 'apex_phase_m_runtime';
appUrl.password = password;
const setupToken = crypto.randomBytes(32).toString('hex');
const { Client } = pg;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function ask(base: string, pathname: string, method = 'GET', payload?: any, cookie?: string) {
  const response = await fetch(base + pathname, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(method !== 'GET' ? { origin: 'https://phase-m.test', 'content-type': 'application/json' } : {}),
    },
    body: payload === undefined ? undefined : JSON.stringify(payload),
    signal: AbortSignal.timeout(12000),
  });
  let data = await response.json();
  return { status: response.status, data, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
test('one Node server handles two PostgreSQL workspaces without cross-workspace access', { timeout: 100000 }, async () => {
  const bootstrap = new Client({ connectionString: testConnection });
  await bootstrap.connect();
  try { await bootstrap.query('CREATE DATABASE apex_phase_m_dynamic_ci'); }
  finally { await bootstrap.end(); }

  const owner = new Client({ connectionString: dbUrl.href });
  await owner.connect();
  let child;
  let output = '';
  try {
    await applyMigrations(owner);
    const a = await provisionTenant(owner, 'phase-m-one', 'One Ltd');
    const b = await provisionTenant(owner, 'phase-m-two', 'Two Ltd');
    await owner.query(`CREATE ROLE apex_phase_m_runtime LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`);
    for (const [mode, tables] of [
      ['SELECT', 'apex_tenants'],
      ['SELECT, INSERT, UPDATE', 'apex_memberships,apex_sessions,apex_records'],
      ['SELECT, INSERT', 'apex_audit'],
      ['SELECT, INSERT, UPDATE, DELETE', 'apex_catalog_products'],
      ['SELECT, INSERT, UPDATE', 'apex_finance_invoices,apex_finance_quotes'],
      ['SELECT, INSERT', 'apex_invoice_settlements,apex_inventory_movements,apex_critical_ledger_ready'],
    ]) await owner.query(`GRANT ${mode} ON ${tables} TO apex_phase_m_runtime`);
    await owner.query('GRANT USAGE ON SCHEMA public TO apex_phase_m_runtime');

    const port = 32682;
    const base = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ['dist/server.cjs', '--port', String(port)], {
      cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env, NODE_ENV: 'production', PORT: String(port),
        APEX_STORAGE_MODE: 'postgres', APEX_TENANT_MODE: 'dynamic',
        APEX_TENANT_ID: '', APEX_DATA_DIR: '',
        DATABASE_URL: appUrl.href, APP_URL: 'https://phase-m.test',
        APEX_ALLOWED_ORIGINS: '', APEX_SETUP_TOKEN: setupToken,
      },
    });
    child.stdout.on('data', x => output += x.toString());
    child.stderr.on('data', x => output += x.toString());
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw new Error('Dynamic server exited: ' + output);
      try {
        const result = await ask(base, '/api/health');
        if (result.status === 200 && result.data.tenantMode === 'dynamic') { ready = true; break; }
      } catch {}
      await sleep(150);
    }
    assert.equal(ready, true, output);

    const selection = await ask(base, '/api/auth/status');
    assert.equal(selection.data.workspaceSelectionRequired, true);
    const malformed = await ask(base, '/api/auth/login', 'POST', {
      username: 'owner', password: 'valid-pass-A-2026', workspaceId: 'not-a-uuid',
    });
    assert.equal(malformed.status, 400);
    const aSetup = await ask(base, '/api/auth/setup', 'POST', {
      workspaceId: a.id, username: 'owner', password: 'valid-pass-A-2026', setupToken: deriveWorkspaceSetupToken(setupToken, a.id),
    });
    assert.equal(aSetup.status, 201, JSON.stringify(aSetup.data));
    // Tenant A's enrollment token is NOT accepted by tenant B.
    const crossSetup = await ask(base, '/api/auth/setup', 'POST', {
      workspaceId: b.id, username: 'attacker', password: 'valid-pass-T-2026',
      setupToken: deriveWorkspaceSetupToken(setupToken, a.id),
    });
    assert.equal(crossSetup.status, 403);
    const bSetup = await ask(base, '/api/auth/setup', 'POST', {
      workspaceId: b.id, username: 'owner', password: 'valid-pass-B-2026', setupToken: deriveWorkspaceSetupToken(setupToken, b.id),
    });
    assert.equal(bSetup.status, 201, JSON.stringify(bSetup.data));
    assert.equal(sessionTenantHint(decodeURIComponent(aSetup.cookie.split('=')[1])), a.id);
    assert.equal(sessionTenantHint(decodeURIComponent(bSetup.cookie.split('=')[1])), b.id);
    assert.equal(aSetup.data.user.tenantId, a.id);
    assert.equal(bSetup.data.user.tenantId, b.id);
    const scopeA = await ask(base, '/api/auth/status?workspaceId=' + a.id, 'GET', undefined, aSetup.cookie);
    assert.equal(scopeA.data.authenticated, true);
    const scopeB = await ask(base, '/api/auth/status?workspaceId=' + b.id, 'GET', undefined, aSetup.cookie);
    assert.equal(scopeB.data.authenticated, false);

    const product = await ask(base, '/api/products', 'POST',
      { name: 'Tenant A only', sku: 'A-001', stockAvailable: 0 }, aSetup.cookie);
    assert.equal(product.status, 201, JSON.stringify(product.data));
    const aProducts = await ask(base, '/api/products', 'GET', undefined, aSetup.cookie);
    const bProducts = await ask(base, '/api/products', 'GET', undefined, bSetup.cookie);
    assert.deepEqual(aProducts.data.data.map(x => x.sku), ['A-001']);
    assert.deepEqual(bProducts.data.data, []);

    const attackerBody = await ask(base, '/api/products', 'POST',
      { name: 'spoof', sku: 'SPOOF', tenantId: b.id }, aSetup.cookie);
    assert.notEqual(attackerBody.status, 201);
    const unknownToken = issueSessionToken(a.id, true);
    const forged = await ask(base, '/api/products', 'GET', undefined,
      'apex_session=' + unknownToken);
    assert.equal(forged.status, 401);

    const wrongPass = await ask(base, '/api/auth/login', 'POST', {
      workspaceId: b.id, username: 'owner', password: 'valid-pass-A-2026',
    });
    assert.equal(wrongPass.status, 401);
    const correctPass = await ask(base, '/api/auth/login', 'POST', {
      workspaceId: b.id, username: 'owner', password: 'valid-pass-B-2026',
    });
    assert.equal(correctPass.status, 200);
    const logoutA = await ask(base, '/api/auth/logout', 'POST', {}, aSetup.cookie);
    assert.equal(logoutA.status, 200);
    const dead = await ask(base, '/api/products', 'GET', undefined, aSetup.cookie);
    assert.equal(dead.status, 401);
    const stillB = await ask(base, '/api/products', 'GET', undefined, bSetup.cookie);
    assert.equal(stillB.status, 200);
    const noWebhookTenant = await ask(base, '/api/telegram/webhook', 'POST', {});
    assert.equal(noWebhookTenant.status, 503);
  } catch (error) {
    throw new Error(error.message + '\nSERVER LOG:\n' + output.slice(-5000));
  } finally {
    if (child && child.exitCode === null) {
      child.kill('SIGTERM');
      await Promise.race([new Promise(r => child.once('exit', r)), sleep(2500)]);
      if (child.exitCode === null) child.kill('SIGKILL');
    }
    await owner.end();
  }
});
