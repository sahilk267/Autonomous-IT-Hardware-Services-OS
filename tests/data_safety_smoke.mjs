// All tests use disposable fixtures. Never read or overwrite deployed customer data.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, statSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const dir = mkdtempSync(path.join(tmpdir(), 'apex-data-safety-'));
let passes = 0;
function check(label, fn) { fn(); passes++; console.log('PASS ' + label); }
function runScript(args, env = {}) {
  return spawnSync(process.execPath, args, {
    cwd: process.cwd(), env: { ...process.env, ...env },
    encoding: 'utf8', timeout: 12000
  });
}
try {
  const starter = path.join(process.cwd(), 'data', 'app-store.json');
  const starterBefore = crypto.createHash('sha256').update(readFileSync(starter)).digest('hex');
  const missing = runScript(['dist/server.cjs'], {
    NODE_ENV: 'production', PORT: '0', APEX_DATA_FILE: ''
  });
  check('Production server refuses implicit checked-in DB path', () => {
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr + missing.stdout, /PRODUCTION DATA SAFETY/);
  });
  const tracked = runScript(['dist/server.cjs'], {
    NODE_ENV: 'production', PORT: '0', APEX_DATA_FILE: starter
  });
  check('Production server refuses explicitly pointing at tracked store', () => {
    assert.notEqual(tracked.status, 0);
    assert.match(tracked.stderr + tracked.stdout, /PRODUCTION DATA SAFETY/);
  });
  const after = crypto.createHash('sha256').update(readFileSync(starter)).digest('hex');
  check('Fail-closed startup never changes tracked starter database', () => assert.equal(after, starterBefore));

  const source = path.join(dir, 'private-source.json');
  const fixture = JSON.parse(readFileSync(starter, 'utf8'));
  fixture.lastUpdated = 'CI_PRIVATE_FIXTURE';
  writeFileSync(source, JSON.stringify(fixture));
  const sourceBefore = readFileSync(source);
  const relativeSource = path.relative(process.cwd(), source);
  const relative = runScript(['dist/server.cjs'], {
    NODE_ENV: 'production', PORT: '0', APEX_DATA_FILE: relativeSource
  });
  check('Production server requires an absolute private data file path', () => {
    assert.notEqual(relative.status, 0);
    assert.match(relative.stderr + relative.stdout, /PRODUCTION DATA SAFETY/);
    assert.deepEqual(readFileSync(source), sourceBefore);
  });
  const backupDir = path.join(dir, 'private-backups');
  mkdirSync(backupDir, { mode: 0o700 });
  const output = path.join(backupDir, 'apex-snapshot.json');
  const backed = runScript(['scripts/backup_data.mjs', '--source', source, '--out', output]);
  check('Offline backup creates a byte-identical private snapshot', () => {
    assert.equal(backed.status, 0, backed.stderr);
    assert.deepEqual(readFileSync(output), sourceBefore);
    assert.match(backed.stdout, /SHA256/);
  });
  check('Private backup has 0600 file permissions', () => {
    assert.equal(statSync(output).mode & 0o777, 0o600);
  });
  const repeat = runScript(['scripts/backup_data.mjs', '--source', source, '--out', output]);
  check('Backup refuses to overwrite an existing snapshot', () => assert.notEqual(repeat.status, 0));
  check('Rejected backup leaves source and previous snapshot intact', () => {
    assert.deepEqual(readFileSync(source), sourceBefore);
    assert.deepEqual(readFileSync(output), sourceBefore);
  });
  const invalidSource = path.join(dir, 'bad.json');
  writeFileSync(invalidSource, '{"not":"an apex database"}');
  const invalidOut = path.join(backupDir, 'invalid-backup.json');
  const invalid = runScript(['scripts/backup_data.mjs', '--source', invalidSource, '--out', invalidOut]);
  check('Invalid source cannot produce a misleading backup', () => {
    assert.notEqual(invalid.status, 0);
    assert.equal(existsSync(invalidOut), false);
  });
  console.log('DATA SAFETY SUMMARY: ' + passes + '/' + passes + ' PASSED');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
