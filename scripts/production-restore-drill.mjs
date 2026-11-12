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

function classifyPgToolFailure(stderr = '') {
  // Only return SAFE error categories. Raw pg_restore stderr can contain
  // SQL business values, usernames, connection details or table payloads.
  const e = String(stderr).toLowerCase();
  if (/unsupported version|version mismatch|archive version/.test(e)) return 'VERSION_MISMATCH';
  if (/role .* does not exist|role .* is not a member/.test(e)) return 'MISSING_DATABASE_ROLE';
  if (/already exists|duplicate object/.test(e)) return 'TARGET_NOT_EMPTY';
  if (/permission denied|must be owner|not permitted/.test(e)) return 'DATABASE_PERMISSION';
  if (/unrecognized configuration parameter|unknown configuration parameter/.test(e)) return 'CLIENT_SERVER_VERSION';
  if (/violates row-level security/.test(e)) return 'ROW_LEVEL_SECURITY';
  if (/violates foreign key|violates check constraint|duplicate key/.test(e)) return 'DATA_INTEGRITY';
  if (/could not open|no such file|no space left/.test(e)) return 'FILE_IO';
  if (/connection refused|could not connect|timeout expired/.test(e)) return 'CONNECTION';
  if (/error:/.test(e)) return 'SQL_RESTORE_ERROR';
  return 'TOOL_FAILURE';
}

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
      else {
        const failure = new Error(`${name} failed. Raw PostgreSQL details withheld.`);
        failure.code = classifyPgToolFailure(err);
        reject(failure);
      }
    });
  });
}

async function installedPgClientMajor(command) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, ['--version'], {
      shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
    });
    let output = '';
    child.stdout.on('data', chunk => { output += String(chunk).slice(0, 160); });
    child.once('error', () => reject(new Error('PostgreSQL backup or restore executable is unavailable')));
    child.once('exit', code => {
      const match = /PostgreSQL\)\s*(\d+)(?:\.|\s|$)/i.exec(output);
      if (code !== 0 || !match) reject(new Error('Cannot determine PostgreSQL backup/restore client version'));
      else resolve(Number(match[1]));
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
    const rows = await client.query(`SELECT to_jsonb(t) AS record FROM ${table} AS t LIMIT 100001`);
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
  let origin;
  let destination;
  let folder;
  let phase = 'SOURCE_CONNECTION';
  try {
    origin = await adminClient(conf.source.href);
    phase = 'TARGET_CONNECTION';
    destination = await adminClient(conf.target.href);
    phase = 'CLIENT_VERSION_CHECK';
    const [sourceVersion, targetVersion] = await Promise.all([
      origin.query("SELECT current_setting('server_version_num')::int AS v"),
      destination.query("SELECT current_setting('server_version_num')::int AS v"),
    ]);
    const sourceMajor = Math.floor(sourceVersion.rows[0].v / 10000);
    const targetMajor = Math.floor(targetVersion.rows[0].v / 10000);
    const [dumpMajor, restoreMajor] = await Promise.all([
      installedPgClientMajor('pg_dump'), installedPgClientMajor('pg_restore'),
    ]);
    if (sourceMajor !== targetMajor || sourceMajor !== dumpMajor || sourceMajor !== restoreMajor) {
      throw new Error('PostgreSQL client version mismatch: use pg_dump and pg_restore from the SAME major version as both source and target servers');
    }
    phase = 'TARGET_EMPTY_CHECK';
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

    phase = 'CREATE_PRIVATE_SNAPSHOT';
    folder = fs.mkdtempSync(path.join(conf.scratch, 'apex-restore-'), { mode: 0o700 });
    const archive = path.join(folder, 'snapshot.pgcustom');
    const sourceEnv = connectionEnvironment(conf.source, environment);
    const targetEnv = connectionEnvironment(conf.target, environment);
    const dumpStarted = Date.now();
    // All secrets go in PG* child environment, NEVER in CLI arguments,
    // GitHub logs, or user-facing reports.
    phase = 'PG_DUMP';
    await runPgTool('pg_dump', ['--format=custom','--no-owner','--file', archive], sourceEnv);
    fs.chmodSync(archive, 0o600);
    const bytes = fs.statSync(archive).size;
    if (bytes < 1000) throw new Error('Backup archive is suspiciously small');
    const hash = crypto.createHash('sha256');
    for await (const chunk of fs.createReadStream(archive)) hash.update(chunk);
    const digest = hash.digest('hex');
    const dumpSeconds = Math.round((Date.now()-dumpStarted)/1000);

    // Do not create/drop a DB. Restore into the already verified empty target
    // in a single transaction so a mid-restore error does not leave partial rows.
    const restoreStarted = Date.now();
    phase = 'PG_RESTORE';
    await runPgTool('pg_restore', [
      '--no-owner', '--single-transaction', '--exit-on-error', '--dbname',
      conf.target.pathname.slice(1), archive,
    ], targetEnv);
    const restoreSeconds = Math.round((Date.now()-restoreStarted)/1000);

    phase = 'SOURCE_RECONCILIATION';
    const sourceFingerprint = await fingerprint(origin);
    phase = 'TARGET_RECONCILIATION';
    const restoredFingerprint = await fingerprint(destination);
    phase = 'COMPARE_DIGESTS';
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
  } catch (error) {
    if (/^(PostgreSQL client version mismatch|Restore target|Full-tenant|Rehearsal verifier|Restore verification FAILED|Backup archive)/.test(error.message)) {
      throw error;
    }
    const code = typeof error?.code === 'string' && /^[A-Za-z0-9_]{1,40}$/.test(error.code)
      ? error.code : 'UNCLASSIFIED';
    // Never echo PostgreSQL connection strings or raw libpq error messages.
    throw new Error(`RECOVERY_STAGE_${phase}_FAILED [${code}]`);
  } finally {
    await Promise.allSettled([origin?.end(), destination?.end()]);
    if (folder) fs.rmSync(folder, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  productionRestoreDrill()
    .then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => {
      // Error messages from our validation are secret-free; driver/library
      // exceptions are not printed verbatim because they might contain URLs.
      if (/^Recovery preflight failed|^RECOVERY_STAGE_|^PostgreSQL client version mismatch|^Restore target|^Full-tenant|^Rehearsal verifier|^Restore verification FAILED|^Backup archive/.test(error.message)) {
        console.error(error.message);
      } else {
        console.error('Recovery drill FAILED; inspect the protected operator environment for details (connection secrets withheld).');
      }
      process.exitCode = 1;
    });
}
