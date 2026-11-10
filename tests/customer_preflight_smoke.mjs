// Customer preflight never mutates source. All files are ephemeral and isolated.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'apex-customer-preflight-'));
const source = path.join(dir, 'test-only-store.json');
const baseline = JSON.parse(readFileSync('data/app-store.json', 'utf8'));
const sha256 = file => createHash('sha256').update(readFileSync(file)).digest('hex');
let passed = 0;
function check(name, callback) { callback(); console.log('PASS ' + name); passed++; }
function run() {
  return spawnSync(process.execPath, ['scripts/customer_migration_preflight.mjs','--source',source],
    { encoding: 'utf8' });
}
try {
  baseline.customers = [{
    id: 'ci-cust', tenantId: baseline.tenant.id, name: 'CI Customer',
    staffUserIds: [], createdAt: new Date().toISOString()
  }];
  baseline.projects.push({
    id:'ci-project', customerId:'ci-cust', clientName:'CI Customer',
    title:'Only ephemeral project', milestones:[], proposalsCount:0
  });
  writeFileSync(source, JSON.stringify(baseline), { mode:0o600 });
  const before = sha256(source);
  let result = run();
  check('Read-only preflight validates a fully linked test store', () => {
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.customerMigrationReady, true);
    assert.equal(report.bindings.projects.unmapped, 0);
    assert.equal(report.sourceSha256, before);
  });
  check('Preflight never mutates source bytes', () => assert.equal(sha256(source),before));
  baseline.projects[0].customerId = undefined;
  baseline.assets.push({ id:'ci-asset', customerId:'nonexistent' });
  baseline.rmaClaims.push({ id:'ci-rma', assetId:'ci-asset', customerId:'ci-cust' });
  writeFileSync(source, JSON.stringify(baseline), { mode:0o600 });
  const beforeFailure = sha256(source);
  result = run();
  check('Preflight blocks unmapped and orphaned customer records', () => {
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stdout);
    assert.equal(report.customerMigrationReady, false);
    assert.equal(report.bindings.projects.unmapped, 1);
    assert.equal(report.bindings.assets.invalidCustomerId, 1);
    assert.equal(report.integrity.invalidRmaAssetCustomerLinks, 1);
  });
  check('Unsafe-data report never writes a mapping or changes source', () =>
    assert.equal(sha256(source),beforeFailure));
  result = spawnSync(process.execPath, ['scripts/customer_migration_preflight.mjs','--source','relative.json'],
    { encoding:'utf8' });
  check('Relative source path cannot be accepted', () => assert.equal(result.status,2));
  console.log('CUSTOMER PREFLIGHT SUMMARY: '+passed+'/'+passed+' PASSED');
} finally { rmSync(dir,{recursive:true,force:true}); }
