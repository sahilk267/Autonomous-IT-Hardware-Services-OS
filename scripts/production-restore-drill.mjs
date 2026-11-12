#!/usr/bin/env node
/**
 * Operator-only recovery rehearsal. Source is READ-ONLY; target must be an
 * EXISTING, EMPTY, EXPLICITLY DISPOSABLE DB named apex_restore_*.
 * Never uses '--clean', '--create', or destructive live DB commands.
 * Requires encrypted private scratch; the temporary dump is deleted on exit.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { verifyCriticalLedger } from '../server/postgres/reconcileLedger.mjs';
import { validateRestoreDrillConfiguration, connectionEnvironment } from './restore-drill-guard.mjs';

const SQL_TABLES = [
  'apex_tenants', 'apex_memberships', 'apex_sessions', 'apex_records',
  'apex_audit', 'apex_catalog_products', 'apex_finance_invoices',
  'apex_invoice_settlements', 'apex_inventory_movements',
  'apex_finance_quotes', 'apex_critical_ledger_ready', 'apex_schema_migrations',
];

const sha = text => crypto.createHash('sha256').update(text).digest('hex');

function runPgTool(name, args, env, timeoutMs = 20 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    const processHandle = spawn(name, args, {
      env, shell: false, windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let err = ''; let finished = false;
    const timeout = setTimeout(() => processHandle.kill('SIGKILL'), timeoutMs);
    processHandle.stderr?.on('data', data => {
      // Never expose raw CLI error messages: libpq errors can include
      // database names/hostnames. They are not required for safety triage.
      err += String(data).slice(0, 1200);
    });
    processHandle.once('error', error => {
      clearTimeout(timeout);
      if (!finished) { finished = true; reject(new Error(`${name} unavailable or could not start (${error.code || 'spawn failure'})`)); }
    });
    processHandle.once('exit', code => {
      clearTimeout(timeout);
      if (finished) return;
      finished = true;
      if (code === 0) resolve();
      else reject(new Error(`${name} failed with exit code ${code}; inspect private operator logs (details withheld from output)`));
    });
  });
}

async function adminClient(connectionString) {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    // This tool verifies ALL tenants, not a single request-scoped RLS view.
    const role = await client.query(`
      SELECT (r.rolsuper OR r.rolbypassrls) AS can_audit
      FROM pg_roles r WHERE r.rolname = current_user
    `);
    if (!role.rows[0]?.can_audit) {
      throw new Error('Full-tenant backup verification requires a separately authorized audit role with BYPASSRLS; do not use an app runtime role.');
    }
    return client;
  } catch (error) { await client.end(); throw error; }
}

async function fingerprint(client) {
  const counts = {};
  const hashes = {};
  for (const table of SQL_TABLES) {
    const rows = await client.query(`SELECT to_jsonb(t) AS record FROM ${table} AS t`);
    if (rows.rowCount > 100000) {
      throw new Error('Rehearsal verifier row budget exceeded: use an approved streaming audit tool for this dataset');
    }
    const data = rows.rows.map(r => JSON.stringify(r.record)).sort();
    counts[table] = data.length;
    hashes[table] = sha(JSON.stringify(data));
  }
  const ids = await client.query('SELECT id FROM apex_tenants ORDER BY id');
  for (const { id } of ids.rows) {
    // Stage L normalized critical ledger invariants must survive restore too.
    await verifyCriticalLedger(client, id);
  }
  return { counts, hashes, tenants: ids.rows.length };
}

export async function productionRestoreDrill(environment = process.env) {
  const conf = validateRestoreDrillConfiguration(environment);
  if (!conf.ok) throw new Error('Recovery preflight failed: ' + conf.errors.join('; '));
  const started = Date.now();
  const origin = await adminClient(conf.source.href);
  const destination = await adminClient(conf.target.href);
  let folder;
  try {
    const tables = await destination.query(`
      SELECT tablename FROM pg_catalog.pg_tables
      WHERE schemaname NOT IN ('pg_catalog','information_schema')
        AND schemaname NOT LIKE 'pg_toast%'
    `);
    if (tables.rowCount > 0) {
      throw new Error('Restore target is not EMPTY. Aborting without changing the target database.');
    }
    const existing = await destination.query(`
      SELECT COUNT(*)::int AS n FROM pg_catalog.pg_extension
      WHERE extname NOT IN ('plpgsql')
    `);
    if (existing.rows[0].n > 0) {
      throw new Error('Restore target has nonstandard extensions and is not considered empty.');
    }

    folder = fs.mkdtempSync(path.join(conf.scratch, 'apex-restore-'), { mode: 0o700 });
    const archive = path.join(folder, 'snapshot.pgcustom');
    const sourceEnv = connectionEnvironment(conf.source, environment);
    const targetEnv = connectionEnvironment(conf.target, environment);
    const dumpStarted = Date.now();
    // All secrets go in PG* child environment, NEVER in CLI arguments,
    // GitHub logs, or user-facing reports.
    await runPgTool('pg_dump', ['--format=custom','--no-owner','--file', archive], sourceEnv);
    fs.chmodSync(archive, 0o600);
    const bytes = fs.statSync(archive).size;
    if (bytes < 1000) throw new Error('Backup archive is suspiciously small');
    const digest = crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
    const dumpSeconds = Math.round((Date.now()-dumpStarted)/1000);

    // Do not create/drop a DB. Restore into the already verified empty target
    // in a single transaction so a mid-restore error does not leave partial rows.
    const restoreStarted = Date.now();
    await runPgTool('pg_restore', [
      '--no-owner', '--single-transaction', '--exit-on-error', '--dbname',
      conf.target.pathname.slice(1), archive,
    ], targetEnv);
    const restoreSeconds = Math.round((Date.now()-restoreStarted)/1000);

    const sourceFingerprint = await fingerprint(origin);
    const restoredFingerprint = await fingerprint(destination);
    if (JSON.stringify(sourceFingerprint) !== JSON.stringify(restoredFingerprint)) {
      throw new Error('Restore verification FAILED: source and target membership, audit, finance/inventory or migration digests differ');
    }
    return {
      success: true, verifiedTenants: restoredFingerprint.tenants,
      counts: restoredFingerprint.counts, archiveSha256: digest,
      archiveBytes: bytes,
      dumpSeconds, restoreSeconds, totalSeconds: Math.round((Date.now()-started)/1000),
      note: 'Source not modified; target was empty and disposable. Temporary sensitive dump deleted. Real RTO/RPO and encrypted backups require operational signoff.',
    };
  } finally {
    await Promise.allSettled([origin.end(), destination.end()]);
    if (folder) fs.rmSync(folder, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  productionRestoreDrill()
    .then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => {
      // Error messages from our validation are secret-free; driver/library
      // exceptions are not printed verbatim because they might contain URLs.
      if (/^Recovery preflight failed|^Restore target|^Full-tenant|^Rehearsal verifier|^Restore verification FAILED|^Backup archive/.test(error.message)) {
        console.error(error.message);
      } else {
        console.error('Recovery drill FAILED; inspect the protected operator environment for details (connection secrets withheld).');
      }
      process.exitCode = 1;
    });
}
