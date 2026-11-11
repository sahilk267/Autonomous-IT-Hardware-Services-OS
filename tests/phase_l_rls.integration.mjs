import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';

// SAFETY: This integration test performs DDL and test inserts. It will run
// ONLY against a local disposable database with this EXACT name.
const url = process.env.PG_TEST_URL;
const dbUrl = url ? new URL(url) : null;
const safe = dbUrl &&
  (dbUrl.hostname === '127.0.0.1' || dbUrl.hostname === 'localhost') &&
  dbUrl.pathname === '/apex_phase_l_ci';
if (!safe) {
  throw new Error('PG_TEST_URL must target localhost/apex_phase_l_ci (disposable test database only)');
}

const { Client } = pg;
const a = crypto.randomUUID();
const b = crypto.randomUUID();
const testPassword = crypto.randomBytes(24).toString('hex');

test('real PostgreSQL RLS prevents cross-tenant read/write and audit tampering', async () => {
  const admin = new Client({ connectionString: url });
  let runtime;
  await admin.connect();
  try {
    const migration = fs.readFileSync(path.resolve('database/postgres/001_tenant_core.sql'), 'utf8');
    await admin.query(migration);
    await admin.query(`CREATE ROLE apex_phase_l_runtime LOGIN PASSWORD '${testPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`);
    await admin.query('GRANT USAGE ON SCHEMA public TO apex_phase_l_runtime');
    await admin.query('GRANT SELECT, INSERT, UPDATE, DELETE ON apex_tenants, apex_memberships, apex_sessions, apex_records, apex_audit TO apex_phase_l_runtime');

    await admin.query(
      'INSERT INTO apex_tenants (id,slug,display_name) VALUES ($1,$2,$3),($4,$5,$6)',
      [a, 'company-alpha', 'Company Alpha', b, 'company-beta', 'Company Beta'],
    );
    await admin.query(
      'INSERT INTO apex_records (tenant_id, record_type, record_id, payload) VALUES ($1,$2,$3,$4::jsonb),($5,$6,$7,$8::jsonb)',
      [a, 'products', 'alpha-asset', JSON.stringify({ tenantId: a, name: 'Alpha' }),
       b, 'products', 'beta-asset', JSON.stringify({ tenantId: b, name: 'Beta' })],
    );

    const role = await admin.query("SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = 'apex_phase_l_runtime'");
    assert.equal(role.rows[0].rolbypassrls, false);
    assert.equal(role.rows[0].rolsuper, false);

    runtime = new Client({
      host: '127.0.0.1',
      port: Number(dbUrl.port || 5432),
      database: 'apex_phase_l_ci',
      user: 'apex_phase_l_runtime',
      password: testPassword,
    });
    await runtime.connect();

    // No authenticated tenant context -> no rows.
    let result = await runtime.query('SELECT record_id FROM apex_records');
    assert.equal(result.rows.length, 0);

    await runtime.query('BEGIN');
    await runtime.query("SELECT set_config('apex.tenant_id', $1, true)", [a]);
    result = await runtime.query('SELECT record_id FROM apex_records ORDER BY record_id');
    assert.deepEqual(result.rows.map(row => row.record_id), ['alpha-asset']);
    const other = await runtime.query('UPDATE apex_records SET revision = revision + 1 WHERE record_id = $1', ['beta-asset']);
    assert.equal(other.rowCount, 0);
    await runtime.query('COMMIT');

    // Transaction-scoped tenant context cannot bleed across pooled requests.
    result = await runtime.query('SELECT record_id FROM apex_records');
    assert.equal(result.rows.length, 0);

    await runtime.query('BEGIN');
    await runtime.query("SELECT set_config('apex.tenant_id', $1, true)", [a]);
    await assert.rejects(
      runtime.query(
        'INSERT INTO apex_records(tenant_id,record_type,record_id,payload) VALUES ($1,$2,$3,$4::jsonb)',
        [b, 'products', 'forged-foreign', JSON.stringify({ tenantId: b })],
      ),
      /row.level security|policy|violates/i,
    );
    await runtime.query('ROLLBACK');

    await runtime.query('BEGIN');
    await runtime.query("SELECT set_config('apex.tenant_id', $1, true)", [a]);
    await runtime.query(
      'INSERT INTO apex_audit(tenant_id,action,target_type,target_id) VALUES ($1,$2,$3,$4)',
      [a, 'product.view', 'products', 'alpha-asset'],
    );
    result = await runtime.query('UPDATE apex_audit SET action = $1 WHERE tenant_id = $2', ['tamper', a]);
    assert.equal(result.rowCount, 0);
    await runtime.query('COMMIT');
  } finally {
    await runtime?.end().catch(() => {});
    await admin.end();
  }
});
