import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  validateRestoreDrillConfiguration, connectionEnvironment, RESTORE_DRILL_ACK,
} from '../scripts/restore-drill-guard.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-restore-guard-'));
const valid = {
  APEX_RESTORE_SOURCE_URL: 'postgresql://audit_user:SOURCE_SECRET@pg.example.com/apex_prod?sslmode=verify-full',
  APEX_RESTORE_TARGET_URL: 'postgresql://restore_user:TARGET_SECRET@pg.example.com/apex_restore_drill_20261112?sslmode=verify-full',
  APEX_RESTORE_DRILL_ACK: RESTORE_DRILL_ACK,
  APEX_RESTORE_ENCRYPTED_DIR: root,
};

test('restore drill accepts source and clearly separate disposable empty-target identity only', () => {
  try {
    const result = validateRestoreDrillConfiguration(valid);
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    assert.deepEqual(result.errors, []);
    const sourceEnv = connectionEnvironment(result.source, {});
    assert.equal(sourceEnv.PGDATABASE, 'apex_prod');
    assert.equal(sourceEnv.PGUSER, 'audit_user');
    assert.equal(sourceEnv.PGPASSWORD, 'SOURCE_SECRET');
    assert.equal(sourceEnv.PGSSLMODE, 'verify-full');
    const targetEnv = connectionEnvironment(result.target, {});
    assert.equal(targetEnv.PGDATABASE, 'apex_restore_drill_20261112');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test('source-target equality, no acknowledgement, or live database name fail closed', () => {
  const base = {
    ...valid, APEX_RESTORE_ENCRYPTED_DIR: os.tmpdir(),
  };
  // Test the reasons independent of OS temp folder permissions.
  for (const [key,value,pattern] of [
    ['APEX_RESTORE_TARGET_URL', valid.APEX_RESTORE_SOURCE_URL, /different databases|name must start/],
    ['APEX_RESTORE_DRILL_ACK', 'yes', /acknowledgement/],
    ['APEX_RESTORE_TARGET_URL', 'postgresql://operator:p@pg.example.com/apex_production?sslmode=verify-full', /name must start/],
    ['APEX_RESTORE_SOURCE_URL', 'postgresql://user:pass@pg.example.com/apex?sslmode=disable', /TLS/],
  ]) {
    const result = validateRestoreDrillConfiguration({ ...base, [key]: value });
    assert.equal(result.ok, false, key);
    assert.ok(result.errors.some(x => pattern.test(x)), JSON.stringify(result.errors));
    assert.equal(JSON.stringify(result.errors).includes('SOURCE_SECRET'), false);
    assert.equal(JSON.stringify(result.errors).includes('TARGET_SECRET'), false);
  }
});
test('missing encrypted scratch and malformed database URLs are rejected without credentials in errors', () => {
  const env = {
    ...valid, APEX_RESTORE_SOURCE_URL: 'not-a-connection',
    APEX_RESTORE_ENCRYPTED_DIR: './unencrypted-or-relative',
  };
  const check = validateRestoreDrillConfiguration(env);
  assert.equal(check.ok, false);
  assert.ok(check.errors.some(x => /SOURCE_URL/.test(x)));
  assert.ok(check.errors.some(x => /ENCRYPTED_DIR/.test(x)));
  assert.equal(JSON.stringify(check.errors).includes('TARGET_SECRET'), false);
});
