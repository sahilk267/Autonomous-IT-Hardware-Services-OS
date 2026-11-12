#!/usr/bin/env node
/**
 * Read-only operator preflight for a not-yet-deployed hosted Apex server.
 * Uses existing process environment or a privately loaded .env file.
 * It NEVER prints connection strings, tokens or credential values.
 */
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function checkHostedDeployment(env = process.env) {
  const errors = [];
  const warnings = [];
  const publicUrl = env.APP_URL;
  let origin = null;
  try {
    const parsed = new URL(publicUrl);
    if (parsed.protocol !== 'https:' || parsed.pathname !== '/' || parsed.hash ||
        parsed.search || parsed.username || parsed.password ||
        !parsed.hostname || ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)) {
      throw new Error('not a public HTTPS origin');
    }
    origin = parsed.origin;
  } catch { errors.push('APP_URL must be the exact public HTTPS server origin (no path or credentials).'); }

  if (env.NODE_ENV !== 'production') errors.push('NODE_ENV must be production.');
  if (env.APEX_DESKTOP_MODE === '1') errors.push('APEX_DESKTOP_MODE must not be enabled on the hosted server.');
  if (env.APEX_MIGRATION_DATABASE_URL) errors.push('Remove APEX_MIGRATION_DATABASE_URL from the application service environment.');
  if (!env.APEX_SETUP_TOKEN || env.APEX_SETUP_TOKEN.length < 32) {
    warnings.push('Initial administrator enrollment will be unavailable until a private 32+ character APEX_SETUP_TOKEN is configured.');
  }
  if (env.APEX_ALLOWED_ORIGINS) {
    for (const item of env.APEX_ALLOWED_ORIGINS.split(',')) {
      const value = item.trim();
      if (!value) continue;
      try {
        const u = new URL(value);
        if (u.protocol !== 'https:' || u.origin !== value || u.pathname !== '/' ||
            u.hash || u.search || u.username || u.password) throw new Error('invalid');
      } catch { errors.push('APEX_ALLOWED_ORIGINS contains a non-HTTPS or malformed origin.'); break; }
    }
  }

  const mode = env.APEX_STORAGE_MODE || 'single';
  if (mode === 'postgres') {
    try {
      const db = new URL(env.DATABASE_URL);
      if (!['postgres:', 'postgresql:'].includes(db.protocol) ||
          !db.hostname || !db.username || !db.password || !db.pathname || db.pathname === '/') {
        throw new Error('invalid');
      }
      if (db.searchParams.get('sslmode') === 'disable') {
        errors.push('DATABASE_URL must not disable PostgreSQL TLS.');
      }
      if (!db.searchParams.has('sslmode')) {
        warnings.push('Verify PostgreSQL TLS certificate validation is enabled by the provider-specific driver configuration.');
      }
    } catch { errors.push('DATABASE_URL must be a complete PostgreSQL runtime-role URL, not a migration or browser URL.'); }

    if (env.APEX_TENANT_MODE === 'dynamic') {
      if (env.APEX_TENANT_ID) errors.push('APEX_TENANT_ID must be unset when APEX_TENANT_MODE=dynamic.');
    } else if (!env.APEX_TENANT_MODE || env.APEX_TENANT_MODE === 'fixed') {
      if (!UUID.test(env.APEX_TENANT_ID || '')) errors.push('Fixed PostgreSQL mode requires a provisioned APEX_TENANT_ID UUID.');
    } else {
      errors.push('APEX_TENANT_MODE must be fixed or dynamic.');
    }
  } else if (mode === 'single') {
    if (!env.APEX_DATA_DIR || !path.isAbsolute(env.APEX_DATA_DIR)) {
      errors.push('Local JSON hosting requires a private absolute APEX_DATA_DIR outside public webroot.');
    }
    warnings.push('JSON mode supports one writer only; use PostgreSQL for multi-instance or dynamic workspaces.');
  } else {
    errors.push('APEX_STORAGE_MODE must be single or postgres.');
  }

  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith('VITE_') && /KEY|SECRET|TOKEN|PASSWORD|DATABASE_URL/i.test(key) && value) {
      errors.push('Do not place server-side secrets in public VITE_* variables.');
      break;
    }
  }
  return {
    ok: errors.length === 0,
    origin,
    storageMode: mode,
    tenantMode: mode === 'postgres' ? (env.APEX_TENANT_MODE || 'fixed') : 'fixed',
    errors, warnings,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkHostedDeployment();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
