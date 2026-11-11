#!/usr/bin/env node
/**
 * Operator-only local JSON snapshot/verification tool.
 * The live app-store.json is committed through atomic rename; reading a
 * single file gives a consistent snapshot, but it is NOT a PostgreSQL backup.
 * Never store these snapshots in Git, webroot, or an unencrypted shared drive.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

function checkRegularFile(filename) {
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Refusing nonregular or symlinked file');
}

function safeJson(bytes) {
  const data = JSON.parse(bytes.toString('utf8'));
  if (!data || typeof data !== 'object' || Array.isArray(data) ||
      !data.tenant || typeof data.tenant.id !== 'string' ||
      !Array.isArray(data.users) || !Array.isArray(data.sessions)) {
    throw new Error('Invalid Apex datastore shape');
  }
  return data;
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function writePrivate(filename, bytes) {
  const fd = fs.openSync(filename, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

export function createSnapshot(source, destinationDir) {
  if (!path.isAbsolute(source) || !path.isAbsolute(destinationDir)) {
    throw new Error('Both source and backup directory must be absolute paths');
  }
  checkRegularFile(source);
  if (path.resolve(destinationDir) === path.dirname(path.resolve(source))) {
    throw new Error('Backup directory must be separate from runtime data directory');
  }
  const bytes = fs.readFileSync(source);
  safeJson(bytes);
  fs.mkdirSync(destinationDir, { recursive: true, mode: 0o700 });
  if (!fs.lstatSync(destinationDir).isDirectory()) throw new Error('Backup path is not a directory');
  const filename = `apex-state-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(8).toString('hex')}.json`;
  const file = path.join(destinationDir, filename);
  writePrivate(file, bytes);
  const manifest = {
    format: 'apex-json-snapshot-v1',
    sourceKind: 'single-tenant-json',
    file: filename,
    sha256: sha256(bytes),
    bytes: bytes.length,
    createdAt: new Date().toISOString(),
  };
  const manifestFile = file + '.manifest.json';
  writePrivate(manifestFile, Buffer.from(JSON.stringify(manifest, null, 2) + '\n'));
  return { file, manifestFile, sha256: manifest.sha256 };
}

export function verifySnapshot(manifestPath) {
  checkRegularFile(manifestPath);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.format !== 'apex-json-snapshot-v1' ||
      typeof manifest.file !== 'string' || path.basename(manifest.file) !== manifest.file ||
      !/^apex-state-[\w-]+\.json$/.test(manifest.file)) {
    throw new Error('Invalid or unsafe manifest');
  }
  const file = path.join(path.dirname(manifestPath), manifest.file);
  checkRegularFile(file);
  const bytes = fs.readFileSync(file);
  safeJson(bytes);
  if (bytes.length !== manifest.bytes || sha256(bytes) !== manifest.sha256) {
    throw new Error('Backup integrity mismatch — refusing restore');
  }
  return { file, bytes, sha256: manifest.sha256 };
}

export function restoreSnapshot(manifestPath, destination) {
  if (!path.isAbsolute(destination)) throw new Error('Restore target must be an absolute path');
  const { bytes, sha256: checksum } = verifySnapshot(manifestPath);
  if (fs.existsSync(destination)) throw new Error('Refusing to overwrite existing application data');
  const directory = path.dirname(destination);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  writePrivate(destination, bytes);
  return { destination, sha256: checksum };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , command, ...args] = process.argv;
  try {
    if (command === 'backup' && args.length === 2) {
      console.log(JSON.stringify(createSnapshot(args[0], args[1])));
    } else if (command === 'verify' && args.length === 1) {
      const { file, sha256: checksum } = verifySnapshot(args[0]);
      console.log(JSON.stringify({ file, sha256: checksum, verified: true }));
    } else if (command === 'restore-new' && args.length === 2) {
      console.log(JSON.stringify(restoreSnapshot(args[0], args[1])));
    } else {
      throw new Error('Usage: node scripts/backup-data.mjs backup <absolute-source> <absolute-backup-directory> | verify <manifest> | restore-new <manifest> <new-absolute-destination>');
    }
  } catch (error) {
    console.error(`Backup operation rejected: ${error.message}`);
    process.exitCode = 1;
  }
}
