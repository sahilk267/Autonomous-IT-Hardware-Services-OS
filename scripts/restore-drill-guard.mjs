import fs from 'node:fs';
import path from 'node:path';

const PREFIX = /^apex_restore_[a-z0-9_]{8,40}$/;
const CONFIRM = 'I_HAVE_VERIFIED_THE_TARGET_IS_EMPTY_AND_DISPOSABLE';

/**
 * Pure safety contract for operator-directed backup/restore rehearsals.
 * User-supplied database URLs are NEVER emitted by this function.
 */
export function validateRestoreDrillConfiguration(env = process.env) {
  const errors = [];
  const sourceRaw = env.APEX_RESTORE_SOURCE_URL;
  const targetRaw = env.APEX_RESTORE_TARGET_URL;
  let source; let target;
  try { source = new URL(sourceRaw); } catch { errors.push('APEX_RESTORE_SOURCE_URL is missing or malformed'); }
  try { target = new URL(targetRaw); } catch { errors.push('APEX_RESTORE_TARGET_URL is missing or malformed'); }
  for (const [label, u] of [['source', source], ['target', target]]) {
    if (!u) continue;
    if (!['postgres:', 'postgresql:'].includes(u.protocol) ||
        !u.hostname || !u.username || !u.password ||
        !/^\/[a-zA-Z0-9_\-]+$/.test(u.pathname)) {
      errors.push(`Invalid ${label} PostgreSQL connection format`);
      continue;
    }
    const mode = u.searchParams.get('sslmode');
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
    if (!local && !['verify-ca', 'verify-full'].includes(mode)) {
      errors.push(`Require authenticated PostgreSQL TLS (sslmode=verify-full) for ${label}`);
    }
    if (u.hash) errors.push(`Unexpected URL fragment in ${label} URL`);
  }
  if (source && target &&
      source.hostname.toLowerCase() === target.hostname.toLowerCase() &&
      (source.port || '5432') === (target.port || '5432') &&
      source.pathname === target.pathname) {
    errors.push('Source and restore target MUST be different databases');
  }
  if (target && !PREFIX.test(target.pathname.slice(1))) {
    errors.push('Target database name must start apex_restore_ followed by 8–40 lowercase characters, digits or underscores');
  }
  if (env.APEX_RESTORE_DRILL_ACK !== CONFIRM) {
    errors.push('Explicit disposable-target acknowledgement is required');
  }
  const scratch = env.APEX_RESTORE_ENCRYPTED_DIR;
  try {
    if (!scratch || !path.isAbsolute(scratch)) throw new Error('missing');
    const st = fs.lstatSync(scratch);
    if (!st.isDirectory() || st.isSymbolicLink()) throw new Error('invalid');
    if (process.platform !== 'win32' && (st.mode & 0o077) !== 0) {
      throw new Error('not private');
    }
  } catch {
    errors.push('APEX_RESTORE_ENCRYPTED_DIR must exist, be an absolute private directory (0700 on Unix), on encrypted storage');
  }
  return { ok: errors.length === 0, errors, source, target, scratch };
}

export const RESTORE_DRILL_ACK = CONFIRM;

export function connectionEnvironment(u, base = process.env) {
  if (!(u instanceof URL)) throw new Error('Validated PostgreSQL URL required');
  const env = { ...base };
  for (const key of ['PGHOST','PGPORT','PGUSER','PGPASSWORD','PGDATABASE','PGSSLMODE']) delete env[key];
  env.PGHOST = u.hostname;
  env.PGPORT = u.port || '5432';
  env.PGUSER = decodeURIComponent(u.username);
  env.PGPASSWORD = decodeURIComponent(u.password);
  env.PGDATABASE = decodeURIComponent(u.pathname.slice(1));
  env.PGSSLMODE = u.searchParams.get('sslmode') || 'prefer';
  return env;
}
