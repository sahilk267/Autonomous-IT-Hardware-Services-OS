/**
 * Read-only Stage 3 reconciliation for operator-controlled rollout.
 * The caller must begin a transaction and SET LOCAL apex.tenant_id from a
 * previously provisioned and verified UUID. Never accept request headers here.
 */
export async function verifyCriticalLedger(client, tenantId) {
  const workspace = await client.query(
    `SELECT payload FROM apex_records
       WHERE tenant_id=$1 AND record_type='workspace_state' AND record_id='current'`,
    [tenantId],
  );
  if (workspace.rowCount !== 1) throw new Error('Workspace data missing');
  for (const key of ['products', 'invoices', 'inventoryTransactions', 'quotes']) {
    const list = workspace.rows[0].payload[key];
    if (!Array.isArray(list) || list.length !== 0) {
      throw new Error(`Workspace contains duplicated ${key} critical records`);
    }
  }
  const ready = await client.query(
    'SELECT 1 FROM apex_critical_ledger_ready WHERE tenant_id=$1 AND schema_version=3',
    [tenantId],
  );
  if (ready.rowCount !== 1) throw new Error('Critical ledger readiness marker missing');

  const tableCounts = [
    ['products', 'apex_catalog_products'],
    ['invoices', 'apex_finance_invoices'],
    ['quotes', 'apex_finance_quotes'],
    ['movements', 'apex_inventory_movements'],
    ['settlements', 'apex_invoice_settlements'],
  ];
  const counts = {};
  for (const [key, table] of tableCounts) {
    const result = await client.query(
      `SELECT count(*)::integer AS n FROM ${table} WHERE tenant_id=$1`, [tenantId],
    );
    counts[key] = result.rows[0].n;
  }

  const invalidSettlements = await client.query(
    `SELECT i.invoice_no FROM apex_finance_invoices i
       LEFT JOIN apex_invoice_settlements s
         ON i.tenant_id=s.tenant_id AND i.invoice_no=s.invoice_no
      WHERE i.tenant_id=$1 AND (
        (i.status='SETTLED' AND (
          s.invoice_no IS NULL OR i.amount<>s.settled_amount OR
          i.settled_at<>s.settled_at OR
          i.payment_reference IS DISTINCT FROM s.payment_reference
        )) OR
        (i.status<>'SETTLED' AND s.invoice_no IS NOT NULL)
      ) LIMIT 1`,
    [tenantId],
  );
  if (invalidSettlements.rowCount) {
    throw new Error('Invoice settlement ledger reconciliation mismatch');
  }
  const missedBalance = await client.query(
    `SELECT p.product_id FROM apex_catalog_products p
      JOIN LATERAL (
        SELECT new_stock FROM apex_inventory_movements j
          WHERE j.tenant_id=p.tenant_id AND j.product_id=p.product_id
          ORDER BY j.occurred_at DESC,j.movement_id DESC LIMIT 1
      ) latest ON true
      WHERE p.tenant_id=$1 AND latest.new_stock<>p.stock_available LIMIT 1`,
    [tenantId],
  );
  if (missedBalance.rowCount) {
    throw new Error('Movement journal disagrees with current catalog stock');
  }
  return { tenantId, counts, settlementPairsValid: true, stockReconciled: true };
}
