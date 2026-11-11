import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import pg from 'pg';
import { applyMigrations, provisionTenant } from '../scripts/postgres-admin.mjs';

const adminUrl = process.env.PG_TEST_URL;
const url = adminUrl && new URL(adminUrl);
if (!url || !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    url.pathname !== '/apex_phase_l_ci') {
  throw new Error('Stage 2 E2E is permitted only on disposable localhost/apex_phase_l_ci');
}

const stage2Url = new URL(adminUrl);
stage2Url.pathname = '/apex_stage2_ci';
const runtimePassword = crypto.randomBytes(24).toString('hex');
const runtimeUrl = new URL(stage2Url.href);
runtimeUrl.username = 'apex_stage2_runtime';
runtimeUrl.password = runtimePassword;
const setupToken = crypto.randomBytes(32).toString('hex');

const { Client } = pg;
const processes = [];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function startTenantServer(tenantId, port, domain) {
  const log = [];
  const child = spawn(process.execPath, ['dist/server.cjs', '--port', String(port)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      APEX_STORAGE_MODE: 'postgres',
      DATABASE_URL: runtimeUrl.href,
      APEX_TENANT_ID: tenantId,
      APP_URL: `https://${domain}`,
      APEX_ALLOWED_ORIGINS: '',
      APEX_SETUP_TOKEN: setupToken,
      PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  processes.push(child);
  child.stdout.on('data', value => log.push(value.toString()));
  child.stderr.on('data', value => log.push(value.toString()));
  for (let i = 0; i < 90; i++) {
    if (child.exitCode !== null) throw new Error(`App exited before ready: ${log.join('').slice(-5000)}`);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1000) });
      if (res.ok) return {
        base: `http://127.0.0.1:${port}`,
        origin: `https://${domain}`,
        child,
        log,
      };
    } catch { /* booting */ }
    await sleep(150);
  }
  throw new Error(`App failed to boot: ${log.join('').slice(-5000)}`);
}

async function stop(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise(resolve => child.once('exit', resolve)),
    sleep(3000).then(() => { if (child.exitCode === null) child.kill('SIGKILL'); }),
  ]);
}

async function request(server, pathname, method = 'GET', body, cookie, origin = server.origin) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (method !== 'GET') {
    headers.origin = origin;
    headers['content-type'] = 'application/json';
  }
  const response = await fetch(server.base + pathname, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await response.json();
  const setCookie = response.headers.get('set-cookie');
  return { status: response.status, data: payload, cookie: setCookie?.split(';')[0] || null };
}

async function prepare() {
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query('CREATE DATABASE apex_stage2_ci');
  } finally {
    await admin.end();
  }
  const owner = new Client({ connectionString: stage2Url.href });
  await owner.connect();
  try {
    await owner.query('SELECT pg_advisory_lock($1)', [6102212]);
    await applyMigrations(owner);
    const tenantA = await provisionTenant(owner, 'stage2-tenant-a', 'Stage 2 Company A');
    const tenantB = await provisionTenant(owner, 'stage2-tenant-b', 'Stage 2 Company B');
    await owner.query(
      `CREATE ROLE apex_stage2_runtime LOGIN PASSWORD '${runtimePassword}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`
    );
    await owner.query('GRANT USAGE ON SCHEMA public TO apex_stage2_runtime');
    await owner.query('GRANT SELECT ON apex_tenants TO apex_stage2_runtime');
    await owner.query('GRANT SELECT, INSERT, UPDATE ON apex_memberships TO apex_stage2_runtime');
    await owner.query('GRANT SELECT, INSERT, UPDATE ON apex_sessions TO apex_stage2_runtime');
    await owner.query('GRANT SELECT, INSERT, UPDATE ON apex_records TO apex_stage2_runtime');
    await owner.query('GRANT SELECT, INSERT ON apex_audit TO apex_stage2_runtime');
    return { owner, tenantA, tenantB };
  } catch (error) {
    await owner.end();
    throw error;
  }
}

test('real production Express API uses PostgreSQL with isolated tenants, sessions and transactions', { timeout: 110_000 }, async () => {
  const { owner, tenantA, tenantB } = await prepare();
  let a; let b;
  try {
    a = await startTenantServer(tenantA.id, 31541, 'tenant-a.example.test');
    b = await startTenantServer(tenantB.id, 31542, 'tenant-b.example.test');

    const crossSite = await request(a, '/api/auth/setup', 'POST', {
      username: 'admin', password: 'secret-password-A-2026', setupToken,
    }, undefined, 'https://attacker.example.test');
    assert.equal(crossSite.status, 403, JSON.stringify(crossSite.data));

    const wrong = await request(a, '/api/auth/setup', 'POST', {
      username: 'admin', password: 'secret-password-A-2026', setupToken: 'invalid',
    });
    assert.equal(wrong.status, 403);

    const setupA = await request(a, '/api/auth/setup', 'POST', {
      username: 'admin', password: 'secret-password-A-2026', setupToken,
      name: 'Owner A', email: 'a@example.test',
    });
    assert.equal(setupA.status, 201, JSON.stringify(setupA.data));
    assert.equal(setupA.data.user.tenantId, tenantA.id);
    assert.ok(setupA.cookie?.startsWith('apex_session='));

    const setupB = await request(b, '/api/auth/setup', 'POST', {
      username: 'admin', password: 'secret-password-B-2026', setupToken,
      name: 'Owner B', email: 'b@example.test',
    });
    assert.equal(setupB.status, 201, JSON.stringify(setupB.data));
    assert.equal(setupB.data.user.tenantId, tenantB.id);

    const repeated = await request(a, '/api/auth/setup', 'POST', {
      username: 'takeover', password: 'secret-password-T-2026', setupToken,
    });
    assert.equal(repeated.status, 403);

    const operator = await request(a, '/api/admin/users', 'POST', {
      username: 'engineer', password: 'operator-secret-password-2026',
      role: 'FIELD_ENGINEER', name: 'Engineer A',
    }, setupA.cookie);
    assert.equal(operator.status, 201, JSON.stringify(operator.data));
    const operatorLogin = await request(a, '/api/auth/login', 'POST', {
      username: 'engineer', password: 'operator-secret-password-2026',
    });
    assert.equal(operatorLogin.status, 200, JSON.stringify(operatorLogin.data));
    const unauthorizedOwnerEdit = await request(a, '/api/tenant', 'POST', {
      name: 'Attacker Tenant Rename',
    }, operatorLogin.cookie);
    assert.equal(unauthorizedOwnerEdit.status, 403);
    const unauthorizedSettlement = await request(a, '/api/invoices/INV-UNKNOWN/settle', 'PATCH', {
      method: 'cash', paymentReference: 'forged',
    }, operatorLogin.cookie);
    assert.equal(unauthorizedSettlement.status, 403);
    const crossTenantOwner = await request(b, '/api/admin/users', 'GET', undefined, setupA.cookie);
    assert.equal(crossTenantOwner.status, 401);
    const disabled = await request(a, `/api/admin/users/${operator.data.user.id}/disable`, 'POST', {}, setupA.cookie);
    assert.equal(disabled.status, 200, JSON.stringify(disabled.data));
    const afterDisable = await request(a, '/api/products', 'GET', undefined, operatorLogin.cookie);
    assert.equal(afterDisable.status, 401);

    const invalidCrossSession = await request(a, '/api/tenant', 'GET', undefined, setupB.cookie);
    assert.equal(invalidCrossSession.status, 401, JSON.stringify(invalidCrossSession.data));

    const tampered = await request(a, '/api/products', 'POST', {
      name: 'Foreign Product', sku: 'FOREIGN-1', tenantId: tenantB.id,
    }, setupA.cookie);
    assert.notEqual(tampered.status, 201, JSON.stringify(tampered.data));

    const created = await request(a, '/api/products', 'POST', {
      name: 'Only A Product', sku: 'A-001', stockAvailable: 3, purchaseCost: 10,
    }, setupA.cookie);
    assert.equal(created.status, 201, JSON.stringify(created.data));

    const listA = await request(a, '/api/products', 'GET', undefined, setupA.cookie);
    const listB = await request(b, '/api/products', 'GET', undefined, setupB.cookie);
    assert.equal(listA.status, 200, JSON.stringify(listA.data));
    assert.equal(listB.status, 200, JSON.stringify(listB.data));
    assert.deepEqual(listA.data.data.map(item => item.sku), ['A-001']);
    assert.deepEqual(listB.data.data, []);

    const invoiceA = await request(a, '/api/invoices', 'POST', {
      customer: 'Client A', amount: 1300,
    }, setupA.cookie);
    assert.equal(invoiceA.status, 201, JSON.stringify(invoiceA.data));

    const state = await request(a, '/api/state', 'GET', undefined, setupA.cookie);
    assert.equal(state.status, 200);
    assert.equal(state.data.data.users.length, 1); // disabled operators are not active
    assert.equal(JSON.stringify(state.data).includes('passwordHash'), false);
    assert.equal(JSON.stringify(state.data).includes('apex_session='), false);
    assert.equal(JSON.stringify(state.data).includes('secret-password-A'), false);

    const db = await owner.query(
      "SELECT payload, revision FROM apex_records WHERE tenant_id = $1 AND record_type = 'workspace_state'",
      [tenantA.id]
    );
    assert.equal(db.rows.length, 1);
    assert.deepEqual(db.rows[0].payload.users, []);
    assert.deepEqual(db.rows[0].payload.sessions, []);
    assert.ok(Number(db.rows[0].revision) >= 3);

    const wrongLoginA = await request(a, '/api/auth/login', 'POST', {
      username: 'admin', password: 'secret-password-B-2026',
    });
    assert.equal(wrongLoginA.status, 401);

    await stop(a.child);
    a = await startTenantServer(tenantA.id, 31541, 'tenant-a.example.test');
    const reLoginA = await request(a, '/api/auth/login', 'POST', {
      username: 'admin', password: 'secret-password-A-2026',
    });
    assert.equal(reLoginA.status, 200, JSON.stringify(reLoginA.data));
    const afterRestart = await request(a, '/api/products', 'GET', undefined, reLoginA.cookie);
    assert.deepEqual(afterRestart.data.data.map(item => item.sku), ['A-001']);

    const reset = await request(a, '/api/state/reset', 'POST', { confirm: true }, reLoginA.cookie);
    assert.equal(reset.status, 200, JSON.stringify(reset.data));
    assert.equal(JSON.stringify(reset.data).includes('passwordHash'), false);
    assert.equal(JSON.stringify(reset.data).includes('apex_session='), false);
    const resetList = await request(a, '/api/products', 'GET', undefined, reLoginA.cookie);
    assert.deepEqual(resetList.data.data, []);
    const stillLoggedIn = await request(a, '/api/auth/me', 'GET', undefined, reLoginA.cookie);
    assert.equal(stillLoggedIn.status, 200);

    const logoutB = await request(b, '/api/auth/logout', 'POST', {}, setupB.cookie);
    assert.equal(logoutB.status, 200);
    const afterLogout = await request(b, '/api/products', 'GET', undefined, setupB.cookie);
    assert.equal(afterLogout.status, 401);

    const audits = await owner.query('SELECT action FROM apex_audit WHERE tenant_id=$1', [tenantA.id]);
    assert.ok(audits.rows.some(row => row.action === 'auth.bootstrap'));
    assert.ok(audits.rows.some(row => row.action === 'api.post'));
  } catch (error) {
    throw new Error(error.message + '\nSERVER A:\n' + (a?.log || []).join('').slice(-3000) +
      '\nSERVER B:\n' + (b?.log || []).join('').slice(-3000));
  } finally {
    await Promise.allSettled(processes.map(stop));
    await owner.end();
  }
});
