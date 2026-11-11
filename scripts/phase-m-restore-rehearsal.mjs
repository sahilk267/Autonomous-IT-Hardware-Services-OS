#!/usr/bin/env node
/**
 * Disposable PostgreSQL 16 backup -> restore rehearsal.
 * The shell workflow performs REAL pg_dump -Fc and pg_restore.
 * This script seeds and verifies deterministic business/tenant fingerprints.
 * NEVER point it at production: it creates databases and roles.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { createSnapshot } from './backup-data.mjs';
import { applyMigrations, provisionTenant, importBackup } from './postgres-admin.mjs';
import { backfillCriticalLedgers } from '../server/postgres/criticalLedger.mjs';
import { verifyCriticalLedger } from '../server/postgres/reconcileLedger.mjs';

const raw = process.env.PG_TEST_URL;
const url = raw && new URL(raw);
if (!url || !['localhost', '127.0.0.1'].includes(url.hostname) ||
    url.pathname !== '/apex_phase_l_ci' || !process.env.PG_REHEARSAL_MANIFEST) {
  throw new Error('Use only disposable localhost/apex_phase_l_ci and an explicit PG_REHEARSAL_MANIFEST');
}
const { Client } = pg;
const tenantSlug = 'phase-m-rehearsal-tenant';
const tables = [
  'apex_tenants', 'apex_memberships', 'apex_sessions', 'apex_records',
  'apex_catalog_products', 'apex_finance_invoices', 'apex_invoice_settlements',
  'apex_inventory_movements', 'apex_finance_quotes', 'apex_critical_ledger_ready', 'apex_audit',
];
function connFor(database) {
  const url2 = new URL(url.href);
  url2.pathname = '/' + database;
  return url2.toString();
}
function sha(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function collections() {
  return ['products', 'leads', 'quotes', 'telegramMessages', 'suppliers', 'rfqs',
    'tickets', 'endpoints', 'jobs', 'assets', 'licenses', 'amcs',
    'projects', 'proposals', 'providers', 'events', 'invoices', 'workflows',
    'connectors', 'rmaClaims', 'knowledgeArticles', 'crmOpportunities',
    'marketplaceDisputes', 'inventoryTransactions'];
}
async function fingerprint(client, tenantId) {
  const counts = {};
  const rows = {};
  for (const table of tables) {
    // Hardcoded table names; never derived from user input.
    const result = await client.query(`SELECT to_jsonb(t) AS row FROM ${table} t WHERE tenant_id=$1`, [tenantId]);
    const records = result.rows.map(x => JSON.stringify(x.row)).sort();
    counts[table] = records.length;
    rows[table] = sha(JSON.stringify(records));
  }
  const verified = await verifyCriticalLedger(client, tenantId);
  return { tenantId, counts, hashes: rows, verified };
}

async function seed() {
  const admin = new Client({ connectionString: url.toString() });
  await admin.connect();
  try { await admin.query('CREATE DATABASE apex_phase_m_source_ci'); }
  finally { await admin.end(); }
  const client = new Client({ connectionString: connFor('apex_phase_m_source_ci') });
  await client.connect();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-phase-m-rehearsal-'));
  try {
    await applyMigrations(client);
    const tenant = await provisionTenant(client, tenantSlug, 'Phase M Rehearsal Ltd');
    const prior = 'tenant-1';
    const now = '2026-11-12T00:00:00.000Z';
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync('test-only-migration-password', salt, 64).toString('hex');
    const state = {
      tenant: { id: prior, name: 'Phase M Legacy Ltd', currency: '₹', state: 'Maharashtra (27)', gstin: '', isConfigured: true },
      users: [{ id: 'u-legacy', tenantId: prior, username: 'owner', name: 'Owner', role: 'BUSINESS_OWNER',
        email: 'owner@rehearsal.invalid', salt, passwordHash: hash }],
      sessions: [],
      ...Object.fromEntries(collections().map(key => [key, []])),
      lastUpdated: now,
    };
    state.products.push({ id: 'p-1', tenantId: prior, sku: 'A-P-1', name: 'Network Router',
      purchaseCost: 700, sellingPrice: 1100, stockAvailable: 3, stockReserved: 0 });
    state.inventoryTransactions.push({ id: 'm-1', tenantId: prior, productId: 'p-1', sku: 'A-P-1',
      productName: 'Network Router', type: 'OUT', qty: 2, previousStock: 5, newStock: 3,
      reason: 'Field repair', timestamp: now, referenceId: 'job-1' });
    state.invoices.push({ id: 'i-1', tenantId: prior, invoiceNo: 'INV-2026-01', customer: 'Rehearsal Client',
      amount: 1299.99, status: 'SETTLED', settledAt: now, paymentReference: 'PAY-REHEARSAL',
      createdAt: '2026-11-11', dueInDays: 30 });
    state.quotes.push({ id: 'q-1', tenantId: prior, quoteNumber: 'QT-2026-01', customerName: 'Rehearsal Client',
      grandTotal: 1299.99, marginPercent: 20, status: 'APPROVED' });
    const source = path.join(tmp, 'original.json');
    fs.writeFileSync(source, JSON.stringify(state), { mode: 0o600 });
    const manifest = createSnapshot(source, path.join(tmp, 'backup'));
    const dry = await importBackup(client, tenant.id, manifest.manifestFile, true);
    if (dry.users !== 1) throw new Error('Migration dry run failed to match seeded user count');
    await importBackup(client, tenant.id, manifest.manifestFile, false);
    await client.query('BEGIN');
    try {
      await client.query("SELECT set_config('apex.tenant_id',$1,true)", [tenant.id]);
      await backfillCriticalLedgers(client, tenant.id);
      await verifyCriticalLedger(client, tenant.id);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
    // Simulate a bad financial mutation: PostgreSQL rejects it and
    // transaction rollback leaves the original invoice unchanged.
    await client.query('BEGIN');
    try {
      await client.query("SELECT set_config('apex.tenant_id',$1,true)", [tenant.id]);
      await client.query('UPDATE apex_finance_invoices SET amount=-20 WHERE tenant_id=$1', [tenant.id]);
      throw new Error('Expected financial check constraint to reject negative amount');
    } catch (error) {
      await client.query('ROLLBACK');
      if (!/check constraint|violates/i.test(error.message)) throw error;
    }

    const summary = await fingerprint(client, tenant.id);
    if (summary.counts.apex_catalog_products !== 1 || summary.counts.apex_finance_invoices !== 1 ||
        summary.counts.apex_invoice_settlements !== 1 || summary.counts.apex_inventory_movements !== 1) {
      throw new Error('Critical ledger seed counts did not match expectations');
    }
    fs.writeFileSync(process.env.PG_REHEARSAL_MANIFEST, JSON.stringify(summary, null, 2), { mode: 0o600 });
    console.log(JSON.stringify({ phase: 'seed', verified: true, counts: summary.counts }));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    await client.end();
  }
}
async function verify() {
  const baseline = JSON.parse(fs.readFileSync(process.env.PG_REHEARSAL_MANIFEST, 'utf8'));
  const restored = new Client({ connectionString: connFor('apex_phase_m_restored_ci') });
  await restored.connect();
  try {
    const summary = await fingerprint(restored, baseline.tenantId);
    if (JSON.stringify(summary) !== JSON.stringify(baseline)) {
      throw new Error('Restored data, audit trail, membership, or reconciliation hashes do not match the backup source');
    }
    const readiness = await restored.query(
      'SELECT schema_version FROM apex_critical_ledger_ready WHERE tenant_id=$1', [baseline.tenantId]);
    if (readiness.rows[0]?.schema_version !== 3) throw new Error('Critical schema readiness marker missing after restore');

    // Real non-owner RLS test, not a superuser check with tenant filters.
    const role = 'apex_phase_m_restore_reader';
    await restored.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOBYPASSRLS`);
    await restored.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
    await restored.query(`GRANT SELECT ON apex_catalog_products,apex_finance_invoices TO ${role}`);
    await restored.query('BEGIN');
    try {
      await restored.query(`SET LOCAL ROLE ${role}`);
      let res = await restored.query('SELECT count(*)::int AS n FROM apex_finance_invoices');
      if (res.rows[0].n !== 0) throw new Error('Restored RLS allows unscoped invoice access');
      await restored.query("SELECT set_config('apex.tenant_id',$1,true)", [baseline.tenantId]);
      res = await restored.query('SELECT count(*)::int AS n FROM apex_finance_invoices');
      if (res.rows[0].n !== 1) throw new Error('Restored RLS fails within the correct tenant');
      await restored.query("SELECT set_config('apex.tenant_id',$1,true)", [crypto.randomUUID()]);
      res = await restored.query('SELECT count(*)::int AS n FROM apex_finance_invoices');
      if (res.rows[0].n !== 0) throw new Error('Restored RLS leaked finance rows to a foreign tenant');
      await restored.query('ROLLBACK');
    } catch (error) {
      await restored.query('ROLLBACK');
      throw error;
    }
    console.log(JSON.stringify({ phase: 'restore', verified: true, counts: summary.counts, matched: true, rls: 'isolated' }));
  } finally { await restored.end(); }
}
const command = process.argv[2];
if (!['seed', 'verify'].includes(command)) throw new Error('Usage: node scripts/phase-m-restore-rehearsal.mjs seed|verify');
(command === 'seed' ? seed() : verify()).catch(error => { console.error(error); process.exitCode = 1; });
