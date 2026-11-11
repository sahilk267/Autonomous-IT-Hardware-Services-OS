#!/usr/bin/env node
/**
 * Offline database-owner utility; NEVER called from an HTTP handler.
 * Credentials belong in APEX_MIGRATION_DATABASE_URL, not DATABASE_URL.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { verifySnapshot } from './backup-data.mjs';

const migrationUrl = process.env.APEX_MIGRATION_DATABASE_URL;
const { Client } = pg;

function digest(data) { return crypto.createHash('sha256').update(data).digest('hex'); }
function requireUuid(value) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || '')) {
    throw new Error('Explicit target tenant UUID is required');
  }
  return value.toLowerCase();
}
function safeIdentifier(value) {
  if (!/^[a-z_][a-z0-9_]{2,63}$/.test(value || '')) throw new Error('Invalid database role identifier');
  return '"' + value + '"';
}

export async function applyMigrations(client) {
  await client.query(`CREATE TABLE IF NOT EXISTS apex_schema_migrations (
    filename text PRIMARY KEY,
    checksum_sha256 text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  for (const file of ['001_tenant_core.sql', '002_runtime_memberships.sql']) {
    const sql = fs.readFileSync(path.resolve('database/postgres', file), 'utf8');
    const checksum = digest(sql);
    const found = await client.query('SELECT checksum_sha256 FROM apex_schema_migrations WHERE filename = $1', [file]);
    if (found.rows.length) {
      if (found.rows[0].checksum_sha256 !== checksum) throw new Error(`MIGRATION_CHECKSUM_MISMATCH: ${file}`);
      continue;
    }
    // Each versioned SQL file is applied atomically together with its checksum.
    // Strip only its outer BEGIN/COMMIT delimiters; DDL and ledger must be one TX.
    const statements = sql
      .replace(/^BEGIN;\s*$/m, '')
      .replace(/^COMMIT;\s*$/m, '');
    await client.query('BEGIN');
    try {
      await client.query(statements);
      await client.query(
        'INSERT INTO apex_schema_migrations(filename,checksum_sha256) VALUES ($1,$2)',
        [file, checksum]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    }
  }
}

export async function provisionTenant(client, slug, displayName) {
  if (!/^[a-z][a-z0-9-]{2,62}$/.test(slug || '')) throw new Error('Invalid tenant slug');
  if (typeof displayName !== 'string' || !displayName.trim() || displayName.length > 256) {
    throw new Error('A non-empty display name of at most 256 characters is required');
  }
  const result = await client.query(
    'INSERT INTO apex_tenants(slug,display_name) VALUES ($1,$2) RETURNING id,slug,display_name',
    [slug, displayName.trim()]
  );
  return result.rows[0];
}

const collections = [
  'users', 'sessions', 'products', 'leads', 'quotes', 'telegramMessages',
  'suppliers', 'rfqs', 'tickets', 'endpoints', 'jobs', 'assets', 'licenses',
  'amcs', 'projects', 'proposals', 'providers', 'events', 'invoices',
  'workflows', 'rmaClaims', 'knowledgeArticles', 'crmOpportunities',
  'marketplaceDisputes', 'inventoryTransactions',
];

function validateImportSnapshot(snapshot, targetTenantId) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot) ||
      !snapshot.tenant || typeof snapshot.tenant.id !== 'string' ||
      !Array.isArray(snapshot.users) ||
      (snapshot.sessions !== undefined && !Array.isArray(snapshot.sessions))) {
    throw new Error('Legacy snapshot has an invalid shape');
  }
  const originalTenant = snapshot.tenant.id;
  const state = structuredClone(snapshot);
  if (state.sessions === undefined) state.sessions = []; // valid pre-session legacy format
  for (const key of collections) {
    if (!Array.isArray(state[key])) throw new Error(`Legacy collection ${key} missing`);
    for (const item of state[key]) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`Invalid ${key} record`);
      if (item.tenantId !== undefined && item.tenantId !== originalTenant) {
        throw new Error(`Foreign-tenant legacy record in ${key}; requires manual review`);
      }
      item.tenantId = targetTenantId;
    }
  }
  const accounts = state.users.map(user => {
    if (!user.salt || !user.passwordHash ||
        !/^[a-f0-9]{32}$/i.test(user.salt) || !/^[a-f0-9]{128}$/i.test(user.passwordHash) ||
        typeof user.username !== 'string' || user.username.length < 3) {
      throw new Error('Legacy administrator is passwordless or malformed; refusing automatic account migration');
    }
    return {
      id: crypto.randomUUID(),
      username: user.username,
      displayName: String(user.name || user.username).slice(0, 256),
      email: String(user.email || '').slice(0, 256),
      role: user.role,
      password: `${user.salt}:${user.passwordHash}`,
    };
  });
  state.tenant.id = targetTenantId;
  state.tenantId = targetTenantId;
  state.users = []; // accounts belong in membership table
  state.sessions = []; // rotate sessions; NEVER import raw legacy tokens
  return { state, accounts, oldTenant: originalTenant };
}

export async function importBackup(client, tenantId, manifestPath, dryRun = true) {
  tenantId = requireUuid(tenantId);
  const verified = verifySnapshot(manifestPath);
  const original = JSON.parse(verified.bytes.toString('utf8'));
  const { state, accounts, oldTenant } = validateImportSnapshot(original, tenantId);
  const summary = {
    targetTenantId: tenantId,
    legacyTenantId: oldTenant,
    users: accounts.length,
    collections: Object.fromEntries(collections.filter(x => x !== 'users' && x !== 'sessions').map(k => [k, state[k].length])),
    sha256: verified.sha256,
    dryRun,
  };
  if (dryRun) return summary;

  await client.query('BEGIN');
  try {
    const tenant = await client.query('SELECT id FROM apex_tenants WHERE id = $1 FOR UPDATE', [tenantId]);
    if (tenant.rowCount !== 1) throw new Error('Destination tenant must be provisioned before import');
    const rows = await client.query('SELECT count(*)::int AS n FROM apex_memberships WHERE tenant_id=$1', [tenantId]);
    const workspace = await client.query(
      "SELECT 1 FROM apex_records WHERE tenant_id=$1 AND record_type='workspace_state' AND record_id='current'", [tenantId]
    );
    if (Number(rows.rows[0].n) !== 0 || workspace.rowCount !== 0) {
      throw new Error('Destination tenant already has accounts or workspace data; refusing overwrite');
    }
    for (const account of accounts) {
      await client.query(
        `INSERT INTO apex_memberships
         (tenant_id,user_id,username,password_hash,role,display_name,email)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [tenantId, account.id, account.username, account.password,
         account.role, account.displayName, account.email]
      );
    }
    await client.query(
      "INSERT INTO apex_records(tenant_id,record_type,record_id,payload) VALUES ($1,'workspace_state','current',$2::jsonb)",
      [tenantId, JSON.stringify(state)]
    );
    await client.query(
      `INSERT INTO apex_audit(tenant_id,action,target_type,target_id,details)
       VALUES ($1,'migration.json_import','workspace_state','current',$2::jsonb)`,
      [tenantId, JSON.stringify({ sourceSha256: verified.sha256, users: accounts.length })]
    );
    await client.query('COMMIT');
    return { ...summary, dryRun: false, imported: true };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  }
}

async function main() {
  if (!migrationUrl) throw new Error('APEX_MIGRATION_DATABASE_URL is required; never use the runtime DATABASE_URL for migrations');
  const [command, ...args] = process.argv.slice(2);
  const client = new Client({ connectionString: migrationUrl });
  await client.connect();
  try {
    // Session-scoped lock serializes migration and provisioning commands.
    await client.query('SELECT pg_advisory_lock($1)', [6102212]);
    let result;
    switch (command) {
      case 'migrate':
        if (args.length) throw new Error('Usage: migrate');
        await applyMigrations(client);
        result = { migrationsApplied: true };
        break;
      case 'provision':
        if (args.length !== 2) throw new Error('Usage: provision <tenant-slug> <display-name>');
        result = await provisionTenant(client, args[0], args[1]);
        break;
      case 'grant-runtime': {
        if (args.length !== 1) throw new Error('Usage: grant-runtime <postgres-role>');
        const role = safeIdentifier(args[0]);
        await client.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
        await client.query(`GRANT SELECT ON apex_tenants TO ${role}`);
        await client.query(`GRANT SELECT, INSERT, UPDATE ON apex_memberships TO ${role}`);
        await client.query(`GRANT SELECT, INSERT, UPDATE ON apex_sessions TO ${role}`);
        await client.query(`GRANT SELECT, INSERT, UPDATE ON apex_records TO ${role}`);
        await client.query(`GRANT SELECT, INSERT ON apex_audit TO ${role}`);
        result = { role: args[0], granted: true };
        break;
      }
      case 'import-dry-run':
      case 'import-confirm':
        if (args.length !== 2) throw new Error('Usage: import-dry-run|import-confirm <tenant-uuid> <absolute-manifest-path>');
        if (!path.isAbsolute(args[1])) throw new Error('Import manifest must use an absolute path');
        result = await importBackup(client, args[0], args[1], command !== 'import-confirm');
        break;
      default:
        throw new Error('Commands: migrate | provision <slug> <name> | grant-runtime <role> | import-dry-run <tenant-id> <manifest> | import-confirm <tenant-id> <manifest>');
    }
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [6102212]).catch(() => {});
    await client.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(`PostgreSQL administrative command failed: ${error.message}`);
    process.exitCode = 1;
  });
}
