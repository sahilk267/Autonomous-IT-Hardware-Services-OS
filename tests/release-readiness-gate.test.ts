import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateStrictReadiness } from '../server/release-readiness-gate.ts';

const valid = () => ({
  releaseId: 'release-1', artifactDigest: 'a'.repeat(64),
  migrationReconciliation: 'VERIFIED', tenantIsolation: 'VERIFIED',
  recoveryDrill: 'VERIFIED', rtoRpoVerified: 'VERIFIED', securityTests: 'VERIFIED',
  approval: { status: 'VERIFIED', approverId: 'reviewer', operatorId: 'operator', artifactDigest: 'a'.repeat(64) }
});
test('complete verified readiness produces GO but does not authorize deployment', () => {
  assert.equal(evaluateStrictReadiness(valid()).decision, 'GO');
});
test('null and array payloads fail closed', () => {
  assert.equal(evaluateStrictReadiness(null).decision, 'NO_GO');
  assert.equal(evaluateStrictReadiness([]).decision, 'NO_GO');
});
test('missing approval blocks', () => {
  const e: any = valid(); delete e.approval;
  assert.notEqual(evaluateStrictReadiness(e).decision, 'GO');
});
test('self approval including whitespace blocks', () => {
  const e = valid(); e.approval.operatorId = ' reviewer ';
  assert.notEqual(evaluateStrictReadiness(e).decision, 'GO');
});
test('tampered artifact digest blocks', () => {
  const e = valid(); e.approval.artifactDigest = 'b'.repeat(64);
  assert.notEqual(evaluateStrictReadiness(e).decision, 'GO');
});
test('invalid evidence status fails closed', () => {
  const e: any = valid(); e.tenantIsolation = 'UNKNOWN';
  assert.equal(evaluateStrictReadiness(e).decision, 'NO_GO');
});
test('failed security check produces NO_GO', () => {
  const e = valid(); e.securityTests = 'FAILED';
  assert.equal(evaluateStrictReadiness(e).decision, 'NO_GO');
});
test('missing digest blocks', () => {
  const e = valid(); e.artifactDigest = '';
  assert.notEqual(evaluateStrictReadiness(e).decision, 'GO');
});
