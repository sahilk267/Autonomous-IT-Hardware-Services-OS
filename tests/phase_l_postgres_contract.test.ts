import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertDatabaseTenantId,
  withTenantTransaction,
  type TenantSqlPool,
  type TenantSqlClient,
} from '../server/postgres/tenantUnitOfWork.ts';

const valid = '49a65581-3b48-4d3b-a6ee-4699a18a8b3c';

function recorder(failOn?: string) {
  const calls: Array<{ sql: string; values?: readonly unknown[] }> = [];
  let released = false;
  const client: TenantSqlClient = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql === failOn) throw new Error('simulated database failure');
      return { rows: [] };
    },
    release() { released = true; },
  };
  const pool: TenantSqlPool = { async connect() { return client; } };
  return { calls, pool, wasReleased: () => released };
}

test('database tenant adapter rejects legacy/untrusted tenant identifiers before opening a connection', async () => {
  assert.throws(() => assertDatabaseTenantId('tenant-1'));
  let connects = 0;
  const pool: TenantSqlPool = {
    async connect() { connects++; throw new Error('should not connect'); },
  };
  await assert.rejects(() => withTenantTransaction(pool, '../../foreign', async () => 0), /verified UUID/);
  assert.equal(connects, 0);
});

test('transaction sets per-request RLS tenant context with a parameter and commits once', async () => {
  const t = recorder();
  const result = await withTenantTransaction(t.pool, valid.toUpperCase(), async client => {
    await client.query('SELECT * FROM apex_records');
    return 42;
  });
  assert.equal(result, 42);
  assert.deepEqual(t.calls.map(v => v.sql), [
    'BEGIN',
    "SELECT set_config('apex.tenant_id', $1, true)",
    'SELECT * FROM apex_records',
    'COMMIT',
  ]);
  assert.deepEqual(t.calls[1].values, [valid]);
  assert.equal(t.wasReleased(), true);
});

test('failed tenant-scoped write rolls back transaction and releases connection', async () => {
  const t = recorder('UPDATE apex_records SET revision = revision + 1');
  await assert.rejects(() => withTenantTransaction(t.pool, valid, async client => {
    await client.query('UPDATE apex_records SET revision = revision + 1');
  }), /simulated database failure/);
  assert.deepEqual(t.calls.map(v => v.sql), [
    'BEGIN',
    "SELECT set_config('apex.tenant_id', $1, true)",
    'UPDATE apex_records SET revision = revision + 1',
    'ROLLBACK',
  ]);
  assert.equal(t.wasReleased(), true);
});
