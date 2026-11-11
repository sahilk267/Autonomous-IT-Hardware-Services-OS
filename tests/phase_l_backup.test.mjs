import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSnapshot, verifySnapshot, restoreSnapshot } from '../scripts/backup-data.mjs';

test('backup is verified, private, and restores only to a NEW file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-backup-test-'));
  try {
    const sourceDir = path.join(dir, 'source');
    const backupDir = path.join(dir, 'backups');
    fs.mkdirSync(sourceDir);
    const source = path.join(sourceDir, 'app-store.json');
    const data = { tenant: { id: 'tenant-test' }, users: [], sessions: [], products: [] };
    fs.writeFileSync(source, JSON.stringify(data));
    const result = createSnapshot(source, backupDir);
    assert.equal(verifySnapshot(result.manifestFile).sha256, result.sha256);
    const restored = path.join(dir, 'restored', 'state.json');
    restoreSnapshot(result.manifestFile, restored);
    assert.deepEqual(JSON.parse(fs.readFileSync(restored, 'utf8')), data);
    assert.throws(() => restoreSnapshot(result.manifestFile, restored), /Refusing to overwrite/);
    if (process.platform !== 'win32') {
      assert.equal(fs.statSync(result.file).mode & 0o777, 0o600);
      assert.equal(fs.statSync(restored).mode & 0o777, 0o600);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('backup tampering is detected before any restore', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-backup-tamper-'));
  try {
    const sourceDir = path.join(dir, 'source');
    fs.mkdirSync(sourceDir);
    const source = path.join(sourceDir, 'state.json');
    fs.writeFileSync(source, JSON.stringify({ tenant: { id: 'tenant-safe' }, users: [], sessions: [] }));
    const result = createSnapshot(source, path.join(dir, 'backups'));
    fs.appendFileSync(result.file, '\nINVALID');
    assert.throws(() => verifySnapshot(result.manifestFile));
    const target = path.join(dir, 'new', 'state.json');
    assert.throws(() => restoreSnapshot(result.manifestFile, target));
    assert.equal(fs.existsSync(target), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
