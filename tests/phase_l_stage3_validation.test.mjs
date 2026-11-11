import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateCriticalState, captureCriticalState, scrubWorkspaceCriticalCollections,
  syncCriticalState,
} from '../server/postgres/criticalLedger.mjs';

const tenantId = '5da124e7-3ddd-4f8f-8e4b-884039c28220';
const other = '9e255e3b-9213-4e13-bac7-d15c984a56cc';
function state() {
  return {
    products: [{ id: 'prod-1', sku: 'A-1', name: 'Router', tenantId,
      stockAvailable: 5, stockReserved: 1, purchaseCost: 250.50, sellingPrice: 350 }],
    invoices: [{ id: 'inv-1', invoiceNo: 'INV-1', customer: 'Customer', amount: 99.25,
      status: 'ACTIVE', tenantId }],
    quotes: [{ id: 'q-1', quoteNumber: 'QT-1', customerName: 'Customer',
      status: 'APPROVED', grandTotal: 100, marginPercent: 18, tenantId }],
    inventoryTransactions: [],
  };
}
test('critical ledger validates a normal tenant-owned catalog and finance snapshot', () => {
  const s = state();
  assert.deepEqual(validateCriticalState(s, tenantId), captureCriticalState(s));
});
test('tenant injection and duplicate case-insensitive SKUs are rejected', () => {
  const s = state();
  s.products[0].tenantId = other;
  assert.throws(() => validateCriticalState(s, tenantId), /Cross-tenant/);
  s.products[0].tenantId = tenantId;
  s.products.push({ ...s.products[0], id: 'prod-2', sku: 'a-1' });
  assert.throws(() => validateCriticalState(s, tenantId), /Duplicate product sku/);
});
test('negative, fractional or reserved-over-stock inventory is refused', () => {
  for (const [field, value] of [['stockAvailable', -1], ['stockAvailable', 1.5], ['stockReserved', 6]]) {
    const s = state();
    s.products[0][field] = value;
    assert.throws(() => validateCriticalState(s, tenantId), /stock|Reserved/);
  }
});
test('fractional cents and pre-settled invoices without proof are rejected', () => {
  const s = state();
  s.invoices[0].amount = 100.001;
  assert.throws(() => validateCriticalState(s, tenantId), /monetary amount/);
  s.invoices[0].amount = 100.25;
  s.invoices[0].status = 'SETTLED';
  assert.throws(() => validateCriticalState(s, tenantId), /timestamp/);
});
test('inventory movements require authoritative product FK and exact quantity equation', () => {
  const s = state();
  s.inventoryTransactions.push({
    id: 'mov-1', tenantId, productId: 'prod-1', sku: 'A-1', type: 'OUT',
    qty: 2, previousStock: 5, newStock: 4, timestamp: new Date().toISOString(),
  });
  assert.throws(() => validateCriticalState(s, tenantId), /mismatch/);
  s.inventoryTransactions[0].newStock = 3;
  assert.doesNotThrow(() => validateCriticalState(s, tenantId));
  s.inventoryTransactions[0].productId = 'foreign-id';
  assert.throws(() => validateCriticalState(s, tenantId), /missing product/);
});
test('silent direct stock edits fail without matching journal append', async () => {
  const before = state();
  const next = state();
  next.products[0].stockAvailable = 999;
  const queries = [];
  const client = { async query(sql, parameters) { queries.push({ sql, parameters }); return { rowCount: 1 }; } };
  await assert.rejects(
    syncCriticalState(client, tenantId, before, next),
    /Stock change requires matching append-only inventory movement/
  );
  assert.ok(queries.length > 0); // transaction caller must roll back these tentative writes
});
test('settled invoices cannot be changed and invoice creation cannot be pre-settled', async () => {
  const before = state();
  const next = state();
  next.invoices[0].status = 'SETTLED';
  next.invoices[0].settledAt = new Date().toISOString();
  const client = { async query() { return { rowCount: 1 }; } };
  await assert.doesNotReject(syncCriticalState(client, tenantId, before, next));
  const oldSettled = structuredClone(next);
  next.invoices[0].amount = 500;
  await assert.rejects(syncCriticalState(client, tenantId, oldSettled, next), /immutable|amount/);
  const entirelyNew = state();
  entirelyNew.invoices = [];
  await assert.rejects(syncCriticalState(client, tenantId, entirelyNew, oldSettled),
    /pre-settled/);
});
test('normalized business collections are removed from JSONB snapshots', () => {
  const source = { tenant: { id: tenantId }, ...state(), events: [{ id: '1' }] };
  const cleaned = scrubWorkspaceCriticalCollections(source);
  for (const key of ['products', 'invoices', 'quotes', 'inventoryTransactions']) {
    assert.deepEqual(cleaned[key], []);
  }
  assert.deepEqual(source.products.length, 1);
  assert.equal(cleaned.events.length, 1);
});
