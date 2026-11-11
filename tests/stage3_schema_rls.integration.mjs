import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import crypto from 'node:crypto';
import { applyMigrations, provisionTenant } from '../scripts/postgres-admin.mjs';

const raw = process.env.PG_TEST_URL;
const url = raw && new URL(raw);
if (!url || !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    url.pathname !== '/apex_phase_l_ci') {
  throw new Error('Stage 3 SQL integration is restricted to disposable localhost/apex_phase_l_ci');
}
const stage3Url = new URL(raw);
stage3Url.pathname = '/apex_stage3_ci';
const pw = crypto.randomBytes(24).toString('hex');
const runtimeUrl = new URL(stage3Url);
runtimeUrl.username = 'apex_stage3_app';
runtimeUrl.password = pw;
const { Client } = pg;

async function scoped(client, tenantId, action) {
  await client.query('BEGIN');
  try {
    await client.query("SELECT set_config('apex.tenant_id', $1, true)", [tenantId]);
    const value = await action();
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  }
}
async function rejectsScoped(client, tenantId, action, messagePattern) {
  await assert.rejects(scoped(client, tenantId, action), messagePattern);
}

test('PostgreSQL 16 normalized finance/inventory RLS and SQL constraints under non-owner role', { timeout: 50_000 }, async () => {
  const base = new Client({ connectionString: raw });
  await base.connect();
  try { await base.query('CREATE DATABASE apex_stage3_ci'); }
  finally { await base.end(); }

  const owner = new Client({ connectionString: stage3Url.href });
  await owner.connect();
  let runtime;
  try {
    await applyMigrations(owner);
    const a = await provisionTenant(owner, 'finance-tenant-a', 'Finance Tenant A');
    const b = await provisionTenant(owner, 'finance-tenant-b', 'Finance Tenant B');
    await owner.query(`CREATE ROLE apex_stage3_app LOGIN PASSWORD '${pw}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`);
    await owner.query('GRANT USAGE ON SCHEMA public TO apex_stage3_app');
    await owner.query('GRANT SELECT, INSERT, UPDATE, DELETE ON apex_catalog_products TO apex_stage3_app');
    await owner.query('GRANT SELECT, INSERT, UPDATE ON apex_finance_invoices,apex_finance_quotes TO apex_stage3_app');
    await owner.query('GRANT SELECT, INSERT ON apex_inventory_movements,apex_invoice_settlements TO apex_stage3_app');
    await owner.query('GRANT SELECT ON apex_critical_ledger_ready TO apex_stage3_app');

    runtime = new Client({ connectionString: runtimeUrl.href });
    await runtime.connect();

    const role = await runtime.query("SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user");
    assert.equal(role.rows[0].rolsuper, false);
    assert.equal(role.rows[0].rolbypassrls, false);

    const productPayload = tenantId => JSON.stringify({
      id: 'p-001', sku: 'SHARED-SKU', name: 'Router', tenantId,
      stockAvailable: 5, stockReserved: 0, purchaseCost: 100, sellingPrice: 120,
    });
    async function insertProduct(tenantId) {
      await scoped(runtime, tenantId, async () => {
        await runtime.query(
          `INSERT INTO apex_catalog_products
             (tenant_id,product_id,sku,display_name,stock_available,stock_reserved,purchase_cost,selling_price,payload)
           VALUES ($1,'p-001','SHARED-SKU','Router',5,0,100,120,$2::jsonb)`,
          [tenantId, productPayload(tenantId)]
        );
      });
    }
    await insertProduct(a.id);
    await insertProduct(b.id);
    let rows = await runtime.query('SELECT product_id FROM apex_catalog_products');
    assert.equal(rows.rows.length, 0); // no RLS context

    rows = await scoped(runtime, a.id,
      () => runtime.query('SELECT tenant_id,sku FROM apex_catalog_products'));
    assert.deepEqual(rows.rows.map(x => x.tenant_id), [a.id]);

    await rejectsScoped(runtime, a.id, () => runtime.query(
      `INSERT INTO apex_catalog_products
        (tenant_id,product_id,sku,display_name,payload)
        VALUES ($1,'forged','FORGED','Forbidden',$2::jsonb)`,
      [b.id, JSON.stringify({ id: 'forged', tenantId: b.id })]
    ), /row-level security|policy/i);

    await rejectsScoped(runtime, a.id, () => runtime.query(
      'UPDATE apex_catalog_products SET stock_reserved=10 WHERE tenant_id=$1 AND product_id=$2',
      [a.id, 'p-001']
    ), /check constraint|violates/i);

    const now = new Date().toISOString();
    const movement = JSON.stringify({
      id: 'movement-1', productId: 'p-001', tenantId: a.id, type: 'OUT',
      qty: 2, previousStock: 5, newStock: 3, timestamp: now,
    });
    await scoped(runtime, a.id, async () => {
      await runtime.query(
        `INSERT INTO apex_inventory_movements
           (tenant_id,movement_id,product_id,movement_type,qty,previous_stock,new_stock,occurred_at,payload)
         VALUES ($1,'movement-1','p-001','OUT',2,5,3,$2,$3::jsonb)`,
        [a.id, now, movement]
      );
    });
    await rejectsScoped(runtime, a.id, () => runtime.query(
      'UPDATE apex_inventory_movements SET qty=999 WHERE tenant_id=$1', [a.id]
    ), /permission denied|policy/i);
    await rejectsScoped(runtime, a.id, () => runtime.query(
      `INSERT INTO apex_inventory_movements
         (tenant_id,movement_id,product_id,movement_type,qty,previous_stock,new_stock,occurred_at,payload)
       VALUES ($1,'movement-2','p-001','OUT',2,5,5,$2,$3::jsonb)`,
      [a.id, now, JSON.stringify({ id: 'movement-2', tenantId: a.id })]
    ), /check constraint|violates/i);
    await rejectsScoped(runtime, a.id, () => runtime.query(
      "DELETE FROM apex_catalog_products WHERE tenant_id=$1 AND product_id='p-001'", [a.id]
    ), /foreign key|violates/i);

    await scoped(runtime, a.id, async () => {
      await runtime.query(
        `INSERT INTO apex_finance_invoices
          (tenant_id,invoice_no,customer,amount,status,payload)
         VALUES ($1,'INV-ONE','Acme',129.99,'ACTIVE',$2::jsonb)`,
        [a.id, JSON.stringify({ tenantId: a.id, invoiceNo: 'INV-ONE', customer: 'Acme', amount: 129.99 })]
      );
      await runtime.query(
        `UPDATE apex_finance_invoices SET status='SETTLED',settled_at=$2,
          payment_reference='PAY-001',payload=$3::jsonb
         WHERE tenant_id=$1 AND invoice_no='INV-ONE'`,
        [a.id, now, JSON.stringify({ tenantId: a.id, invoiceNo: 'INV-ONE', status: 'SETTLED' })]
      );
      await runtime.query(
        `INSERT INTO apex_invoice_settlements
          (tenant_id,invoice_no,settled_amount,payment_reference,settled_at)
         VALUES($1,'INV-ONE',129.99,'PAY-001',$2)`,
        [a.id, now]
      );
    });
    await rejectsScoped(runtime, a.id, () => runtime.query(
      "UPDATE apex_finance_invoices SET amount=999 WHERE tenant_id=$1 AND invoice_no='INV-ONE'",
      [a.id]
    ), /Settled invoice financial details cannot be changed/i);
    await rejectsScoped(runtime, a.id, () => runtime.query(
      "UPDATE apex_invoice_settlements SET settled_amount=999 WHERE tenant_id=$1", [a.id]
    ), /permission denied|policy/i);
    await rejectsScoped(runtime, a.id, () => runtime.query(
      `INSERT INTO apex_finance_invoices
       (tenant_id,invoice_no,customer,amount,status,payload)
       VALUES ($1,'INV-NEGATIVE','Oops',-10,'ACTIVE',$2::jsonb)`,
      [a.id, JSON.stringify({ tenantId: a.id, invoiceNo: 'INV-NEGATIVE' })]
    ), /check constraint|violates/i);

    const unseen = await scoped(runtime, b.id, () => runtime.query(
      'SELECT invoice_no FROM apex_finance_invoices'
    ));
    assert.equal(unseen.rows.length, 0);
  } finally {
    await runtime?.end().catch(() => {});
    await owner.end();
  }
});
