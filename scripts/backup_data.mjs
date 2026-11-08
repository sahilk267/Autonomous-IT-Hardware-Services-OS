#!/usr/bin/env node
// Offline, operator-invoked copy of the current JSON store. STOP WRITES before running.
// Never run against a live changing store; never back up inside the deployed web checkout.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const args = process.argv.slice(2);
function getArg(flag) {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : undefined;
}
function fatal(message) {
  console.error('BACKUP REFUSED: ' + message);
  process.exit(1);
}
const source = getArg('--source') || process.env.APEX_DATA_FILE;
const out = getArg('--out');
if (!source || !out || !path.isAbsolute(source) || !path.isAbsolute(out)) {
  fatal('Provide absolute paths: node scripts/backup_data.mjs --source /path/private/store.json --out /path/private/backups/snapshot.json');
}
const src = path.resolve(source), target = path.resolve(out);
if (src === target) fatal('Backup output must differ from the source file.');
const realRoot = fs.realpathSync(process.cwd());
let targetDir;
try {
  targetDir = fs.realpathSync(path.dirname(target));
} catch {
  fatal('Backup directory does not exist. Create a private backup directory first.');
}
const relative = path.relative(realRoot, targetDir);
if (relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) {
  fatal('Backup directory must be outside the application checkout/web root.');
}
let bytes;
try {
  if (!fs.statSync(src).isFile()) fatal('Source is not a regular file.');
  bytes = fs.readFileSync(src);
  const parsed = JSON.parse(bytes.toString('utf8'));
  if (!parsed || typeof parsed !== 'object' || !parsed.tenant ||
      !Array.isArray(parsed.users) || !Array.isArray(parsed.sessions)) {
    fatal('Source is not a valid Apex OS store. Refusing to create a misleading backup.');
  }
} catch (error) {
  fatal('Source could not be safely read and validated: ' + (error?.message || 'unknown error'));
}
let handle;
try {
  // wx: exclusive creation. Existing backups must NEVER be overwritten.
  handle = fs.openSync(target, 'wx', 0o600);
  fs.writeFileSync(handle, bytes);
  fs.fsyncSync(handle);
  fs.closeSync(handle);
  handle = undefined;
  fs.chmodSync(target, 0o600);
} catch (error) {
  if (handle !== undefined) fs.closeSync(handle);
  fatal('Unable to save backup without overwrite: ' + (error?.message || 'unknown error'));
}
const digest = crypto.createHash('sha256').update(bytes).digest('hex');
console.log('BACKUP_CREATED ' + target);
console.log('SHA256 ' + digest);
console.log('BYTES ' + bytes.length);
console.log('Manual verification and offline secure retention required. Never upload this file to Git.');
