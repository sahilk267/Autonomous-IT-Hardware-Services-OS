/**
 * Phase L Stage 3: normalized critical ledgers.
 * PostgreSQL transactions (and RLS) are provided by the caller.
 * Existing noncritical modules still use the tenant-owned JSONB workspace.
 */
const criticalKeys = ['products', 'invoices', 'inventoryTransactions', 'quotes'];
const invoiceStates = new Set(['ACTIVE', 'DUE_SOON', 'OVERDUE', 'SETTLED', 'CANCELLED']);
const quoteStates = new Set([
  'DRAFT', 'PENDING_OWNER_APPROVAL', 'APPROVED', 'SENT_TO_CUSTOMER',
  'ACCEPTED', 'REJECTED', 'PENDING_APPROVAL',
]);
const movementTypes = new Set(['IN', 'OUT', 'RESERVE', 'RELEASE']);

export function captureCriticalState(state) {
  return Object.fromEntries(criticalKeys.map(key => [key, structuredClone(state[key] || [])]));
}

function requireText(value, label, max = 256) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new Error(`Invalid ${label}: required non-empty string, at most ${max} characters`);
  }
  return value;
}
function requireInt(value, label, positive = false) {
  if (!Number.isSafeInteger(value) || value < (positive ? 1 : 0)) {
    throw new Error(`Invalid ${label}: expected ${positive ? 'positive' : 'non-negative'} integer`);
  }
  return value;
}
function money(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 ||
      value > 9999999999999999 || Math.abs(value * 100 - Math.round(value * 100)) > 0.00001) {
    throw new Error(`Invalid ${label}: non-negative monetary amount with at most two decimals required`);
  }
  return value.toFixed(2);
}
function timestamp(value, label) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new Error(`Invalid ${label}: valid timestamp required`);
  }
  return new Date(value).toISOString();
}
function assertTenant(row, tenantId, label) {
  if (!row || typeof row !== 'object' || Array.isArray(row) || row.tenantId !== tenantId) {
    throw new Error(`Cross-tenant or malformed ${label} rejected`);
  }
}
function assertUnique(records, field, label, lower = false) {
  const found = new Set();
  for (const value of records) {
    const raw = requireText(value[field], `${label}.${field}`);
    const key = lower ? raw.toLowerCase() : raw;
    if (found.has(key)) throw new Error(`Duplicate ${label} ${field}: ${raw}`);
    found.add(key);
  }
}
function mapBy(rows, field) { return new Map(rows.map(row => [row[field], row])); }
function changed(a, b) { return JSON.stringify(a) !== JSON.stringify(b); }

export function validateCriticalState(input, tenantId) {
  const state = captureCriticalState(input);
  for (const key of criticalKeys) {
    if (!Array.isArray(input[key])) throw new Error(`Missing ${key} collection`);
    for (const item of state[key]) assertTenant(item, tenantId, key);
  }
  for (const p of state.products) {
    requireText(p.id, 'product id');
    requireText(p.sku, 'SKU', 128);
    requireText(p.name, 'product name');
    requireInt(p.stockAvailable ?? 0, 'available stock');
    requireInt(p.stockReserved ?? 0, 'reserved stock');
    if ((p.stockReserved ?? 0) > (p.stockAvailable ?? 0)) throw new Error('Reserved stock exceeds physical stock');
    money(p.purchaseCost ?? 0, 'purchase cost');
    money(p.sellingPrice ?? 0, 'selling price');
  }
  assertUnique(state.products, 'id', 'product');
  assertUnique(state.products, 'sku', 'product', true);

  for (const inv of state.invoices) {
    requireText(inv.invoiceNo, 'invoice number', 128);
    requireText(inv.customer, 'invoice customer');
    if (inv.id !== undefined) requireText(inv.id, 'invoice ID');
    const amount = Number(inv.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Invoice amount must be greater than zero');
    money(amount, 'invoice amount');
    if (!invoiceStates.has(inv.status)) throw new Error('Invalid invoice status');
    if ((inv.status === 'SETTLED') !== !!inv.settledAt) {
      throw new Error('Settled invoice requires a timestamp; unsettled invoice cannot have one');
    }
    if (inv.settledAt) timestamp(inv.settledAt, 'invoice settlement time');
    if (inv.paymentReference !== undefined) requireText(inv.paymentReference, 'payment reference');
  }
  assertUnique(state.invoices, 'invoiceNo', 'invoice');
  const ids = state.invoices.filter(inv => inv.id !== undefined);
  assertUnique(ids, 'id', 'invoice');

  const products = mapBy(state.products, 'id');
  for (const mov of state.inventoryTransactions) {
    requireText(mov.id, 'movement id');
    requireText(mov.productId, 'movement product id');
    requireText(mov.sku, 'movement SKU', 128);
    if (!movementTypes.has(mov.type)) throw new Error('Invalid movement type');
    const qty = requireInt(mov.qty, 'movement quantity', true);
    const before = requireInt(mov.previousStock, 'previous stock');
    const after = requireInt(mov.newStock, 'new stock');
    if ((mov.type === 'IN' && after !== before + qty) ||
        (mov.type === 'OUT' && after !== before - qty) ||
        (['RESERVE', 'RELEASE'].includes(mov.type) && after !== before)) {
      throw new Error('Inventory movement quantity/stock mismatch');
    }
    if (!products.has(mov.productId)) throw new Error('Inventory movement references a missing product');
    timestamp(mov.timestamp, 'inventory movement time');
  }
  assertUnique(state.inventoryTransactions, 'id', 'inventory movement');

  for (const quote of state.quotes) {
    requireText(quote.id, 'quote id');
    requireText(quote.quoteNumber, 'quote number', 128);
    requireText(quote.customerName, 'quote customer');
    if (!quoteStates.has(quote.status)) throw new Error('Invalid quote status');
    money(Number(quote.grandTotal ?? quote.totalAmount ?? 0), 'quote total');
    const margin = Number(quote.marginPercent ?? 0);
    if (!Number.isFinite(margin) || margin < -1000 || margin > 100) throw new Error('Invalid margin percentage');
  }
  assertUnique(state.quotes, 'id', 'quote');
  assertUnique(state.quotes, 'quoteNumber', 'quote', true);
  return state;
}

export async function readCriticalState(client, tenantId, state) {
  // The readiness marker is created only by a reviewed import or new setup.
  const ready = await client.query(
    'SELECT schema_version FROM apex_critical_ledger_ready WHERE tenant_id=$1',
    [tenantId],
  );
  if (ready.rowCount !== 1 || Number(ready.rows[0].schema_version) !== 3) {
    throw new Error('Critical ledgers require operator backfill before this tenant can serve API traffic');
  }
  for (const key of criticalKeys) {
    if (!Array.isArray(state[key]) || state[key].length !== 0) {
      throw new Error(`Divergent legacy ${key} records remain in workspace JSONB; perform reviewed backfill`);
    }
  }
  const configs = [
    ['products', 'apex_catalog_products', 'product_id', 'payload'],
    ['invoices', 'apex_finance_invoices', 'invoice_no', 'payload'],
    ['inventoryTransactions', 'apex_inventory_movements', 'movement_id', 'payload'],
    ['quotes', 'apex_finance_quotes', 'quote_id', 'payload'],
  ];
  for (const [key, table, id] of configs) {
    // Table names are defined by source, NEVER from a request field.
    const rows = await client.query(
      `SELECT payload FROM ${table} WHERE tenant_id=$1 ORDER BY ${id}`, [tenantId],
    );
    state[key] = rows.rows.map(row => row.payload);
  }
  validateCriticalState(state, tenantId);
  return state;
}

async function upsertProducts(client, tenantId, oldState, nextState) {
  const old = mapBy(oldState.products, 'id');
  const next = mapBy(nextState.products, 'id');
  for (const p of nextState.products) {
    if (old.has(p.id) && !changed(old.get(p.id), p)) continue;
    await client.query(
      `INSERT INTO apex_catalog_products
         (tenant_id,product_id,sku,display_name,stock_available,stock_reserved,purchase_cost,selling_price,payload)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
       ON CONFLICT (tenant_id,product_id)
       DO UPDATE SET sku=EXCLUDED.sku,display_name=EXCLUDED.display_name,
          stock_available=EXCLUDED.stock_available,stock_reserved=EXCLUDED.stock_reserved,
          purchase_cost=EXCLUDED.purchase_cost,selling_price=EXCLUDED.selling_price,
          payload=EXCLUDED.payload,revision=apex_catalog_products.revision + 1,updated_at=now()`,
      [tenantId, p.id, p.sku, p.name, p.stockAvailable ?? 0, p.stockReserved ?? 0,
       money(p.purchaseCost ?? 0, 'purchase cost'), money(p.sellingPrice ?? 0, 'selling price'), JSON.stringify(p)],
    );
  }
  return { old, next };
}

async function upsertInvoices(client, tenantId, oldState, nextState, actorId, allowHistoricalSettlements) {
  const old = mapBy(oldState.invoices, 'invoiceNo');
  const next = mapBy(nextState.invoices, 'invoiceNo');
  for (const invoice of nextState.invoices) {
    const prior = old.get(invoice.invoiceNo);
    if (prior && prior.status === 'SETTLED' && changed(prior, invoice)) {
      throw new Error('Settled invoice is immutable');
    }
    if (!prior && invoice.status === 'SETTLED' && !allowHistoricalSettlements) {
      throw new Error('New invoices cannot be created pre-settled');
    }
    if (prior && prior.status === 'CANCELLED' && invoice.status !== 'CANCELLED') {
      throw new Error('Cancelled invoice cannot be reopened');
    }
    if (prior && (prior.customer !== invoice.customer || prior.amount !== invoice.amount)) {
      throw new Error('Invoice financial amount/customer cannot be mutated after issuance');
    }
    if (prior && !changed(prior, invoice)) continue;
    await client.query(
      `INSERT INTO apex_finance_invoices
        (tenant_id,invoice_no,invoice_id,customer,amount,status,settled_at,payment_reference,payload)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
       ON CONFLICT (tenant_id,invoice_no)
       DO UPDATE SET status=EXCLUDED.status,settled_at=EXCLUDED.settled_at,
         payment_reference=EXCLUDED.payment_reference,payload=EXCLUDED.payload,
         revision=apex_finance_invoices.revision + 1,updated_at=now()`,
      [tenantId, invoice.invoiceNo, invoice.id ?? null, invoice.customer,
       money(Number(invoice.amount), 'invoice amount'), invoice.status,
       invoice.settledAt ? timestamp(invoice.settledAt, 'settlement timestamp') : null,
       invoice.paymentReference ?? null, JSON.stringify(invoice)],
    );
    if (invoice.status === 'SETTLED' && (!prior || prior.status !== 'SETTLED')) {
      await client.query(
        `INSERT INTO apex_invoice_settlements
         (tenant_id,invoice_no,settled_amount,payment_reference,settled_at,actor_id)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [tenantId, invoice.invoiceNo, money(Number(invoice.amount), 'settlement amount'),
         invoice.paymentReference ?? null, timestamp(invoice.settledAt, 'settlement timestamp'), actorId],
      );
    }
  }
  for (const prev of oldState.invoices) {
    if (!next.has(prev.invoiceNo)) throw new Error('Invoice deletion is forbidden; cancel or archive using an audited workflow');
  }
}

async function upsertQuotes(client, tenantId, oldState, nextState) {
  const old = mapBy(oldState.quotes, 'id');
  const next = mapBy(nextState.quotes, 'id');
  for (const quote of nextState.quotes) {
    const prior = old.get(quote.id);
    if (prior && prior.quoteNumber !== quote.quoteNumber) throw new Error('Quote number cannot be changed');
    if (prior && prior.status === 'REJECTED' && quote.status !== 'REJECTED') throw new Error('Rejected quote cannot be reopened');
    if (prior && !changed(prior, quote)) continue;
    await client.query(
      `INSERT INTO apex_finance_quotes
        (tenant_id,quote_id,quote_no,customer_name,status,grand_total,margin_percent,payload)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
       ON CONFLICT(tenant_id,quote_id)
       DO UPDATE SET status=EXCLUDED.status,grand_total=EXCLUDED.grand_total,
          margin_percent=EXCLUDED.margin_percent,payload=EXCLUDED.payload,updated_at=now()`,
      [tenantId, quote.id, quote.quoteNumber, quote.customerName, quote.status,
       money(Number(quote.grandTotal ?? quote.totalAmount ?? 0), 'quote total'),
       Number(quote.marginPercent ?? 0), JSON.stringify(quote)],
    );
  }
  for (const prev of oldState.quotes) {
    if (!next.has(prev.id)) throw new Error('Quote deletion is forbidden');
  }
}

async function appendMovements(client, tenantId, oldState, nextState, allowHistorical) {
  const old = mapBy(oldState.inventoryTransactions, 'id');
  const next = mapBy(nextState.inventoryTransactions, 'id');
  for (const prev of oldState.inventoryTransactions) {
    if (!next.has(prev.id) || changed(prev, next.get(prev.id))) {
      throw new Error('Inventory journal is append-only; edits and deletion forbidden');
    }
  }
  const previousProducts = mapBy(oldState.products, 'id');
  const currentProducts = mapBy(nextState.products, 'id');
  const appended = nextState.inventoryTransactions.filter(x => !old.has(x.id));
  for (const [productId, before] of previousProducts) {
    const after = currentProducts.get(productId);
    if (!after) continue;
    const movements = appended.filter(x => x.productId === productId);
    let currentStock = before.stockAvailable ?? 0;
    let currentReserved = before.stockReserved ?? 0;
    for (const movement of movements) {
      if (movement.previousStock !== currentStock) throw new Error('Inventory journal starting stock does not match authoritative balance');
      currentStock = movement.newStock;
      if (movement.type === 'RESERVE') currentReserved += movement.qty;
      if (movement.type === 'RELEASE') currentReserved -= movement.qty;
    }
    if (currentStock !== (after.stockAvailable ?? 0) ||
        currentReserved !== (after.stockReserved ?? 0)) {
      throw new Error('Stock change requires matching append-only inventory movement(s)');
    }
  }
  if (allowHistorical) {
    // Historical snapshots already contain their final balance. SQL CHECKs
    // validate each movement; chronological reconciliation remains manual.
  } else {
    for (const movement of appended) {
      if (!previousProducts.has(movement.productId)) {
        throw new Error('Inventory movements require a pre-existing catalog product');
      }
    }
  }
  for (const movement of appended) {
    await client.query(
      `INSERT INTO apex_inventory_movements
        (tenant_id,movement_id,product_id,movement_type,qty,previous_stock,new_stock,reference_id,occurred_at,payload)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
      [tenantId, movement.id, movement.productId, movement.type, movement.qty,
       movement.previousStock, movement.newStock, movement.referenceId ?? null,
       timestamp(movement.timestamp, 'movement time'), JSON.stringify(movement)],
    );
  }
}

export async function syncCriticalState(client, tenantId, previousState, currentState, options = {}) {
  const before = validateCriticalState(previousState, tenantId);
  const after = validateCriticalState(currentState, tenantId);
  const allowHistorical = options.allowHistorical === true;
  const { old, next } = await upsertProducts(client, tenantId, before, after);
  await upsertInvoices(client, tenantId, before, after, options.actorId || null, allowHistorical);
  await upsertQuotes(client, tenantId, before, after);
  await appendMovements(client, tenantId, before, after, allowHistorical);
  for (const prev of before.products) {
    if (!next.has(prev.id)) {
      await client.query(
        'DELETE FROM apex_catalog_products WHERE tenant_id=$1 AND product_id=$2',
        [tenantId, prev.id]
      );
    }
  }
  return { products: after.products.length, invoices: after.invoices.length,
    movements: after.inventoryTransactions.length, quotes: after.quotes.length };
}

export function scrubWorkspaceCriticalCollections(state) {
  return {
    ...state,
    products: [], invoices: [], inventoryTransactions: [], quotes: [],
  };
}

export async function markEmptyCriticalLedgerReady(client, tenantId) {
  const checks = await Promise.all([
    client.query('SELECT 1 FROM apex_catalog_products WHERE tenant_id=$1 LIMIT 1', [tenantId]),
    client.query('SELECT 1 FROM apex_finance_invoices WHERE tenant_id=$1 LIMIT 1', [tenantId]),
    client.query('SELECT 1 FROM apex_finance_quotes WHERE tenant_id=$1 LIMIT 1', [tenantId]),
    client.query('SELECT 1 FROM apex_inventory_movements WHERE tenant_id=$1 LIMIT 1', [tenantId]),
  ]);
  if (checks.some(x => x.rowCount)) throw new Error('Critical ledgers already contain data; backfill is required');
  await client.query(
    'INSERT INTO apex_critical_ledger_ready(tenant_id,schema_version) VALUES ($1,3)',
    [tenantId]
  );
}

/**
 * Offline migration: run on a verified backup database in a transaction,
 * after downtime/quiescence. Never automatically converts production data.
 */
export async function backfillCriticalLedgers(client, tenantId) {
  const existing = await client.query(
    'SELECT 1 FROM apex_critical_ledger_ready WHERE tenant_id=$1',
    [tenantId]
  );
  if (existing.rowCount) throw new Error('Critical ledgers are already active; refusing repeated backfill');
  const result = await client.query(
    "SELECT payload, revision FROM apex_records WHERE tenant_id=$1 AND record_type='workspace_state' AND record_id='current' FOR UPDATE",
    [tenantId]
  );
  if (result.rowCount !== 1) throw new Error('Legacy workspace missing; cannot backfill');
  const state = result.rows[0].payload;
  if (state.tenant?.id !== tenantId || state.tenantId !== tenantId) {
    throw new Error('Legacy tenant identity mismatch; manual reconciliation required');
  }
  const before = Object.fromEntries(criticalKeys.map(key => [key, []]));
  const summary = await syncCriticalState(client, tenantId, before, state, {
    allowHistorical: true, actorId: null,
  });
  await markEmptyCriticalLedgerReadyForBackfill(client, tenantId, result.rows[0].revision);
  const safe = scrubWorkspaceCriticalCollections(state);
  await client.query(
    `UPDATE apex_records SET payload=$2::jsonb,revision=revision+1,updated_at=now()
     WHERE tenant_id=$1 AND record_type='workspace_state' AND record_id='current'`,
    [tenantId, JSON.stringify(safe)]
  );
  await client.query(
    `INSERT INTO apex_audit (tenant_id,action,target_type,target_id,details)
     VALUES ($1,'migration.critical_ledgers','workspace_state','current',$2::jsonb)`,
    [tenantId, JSON.stringify(summary)]
  );
  return summary;
}

async function markEmptyCriticalLedgerReadyForBackfill(client, tenantId, revision) {
  await client.query(
    'INSERT INTO apex_critical_ledger_ready(tenant_id,schema_version,source_revision) VALUES($1,3,$2)',
    [tenantId, revision]
  );
}
