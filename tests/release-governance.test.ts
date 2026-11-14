import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateRelease, type ReleaseEvidence } from '../server/release-governance.ts';
const valid = (): ReleaseEvidence => ({
  releaseId: 'release-1', artifactDigest: 'a'.repeat(64),
  migrationReconciliation: 'VERIFIED', tenantIsolation: 'VERIFIED',
  recoveryDrill: 'VERIFIED', rtoRpoVerified: 'VERIFIED', securityTests: 'VERIFIED',
  approval: { status: 'VERIFIED', approverId: 'reviewer', operatorId: 'operator', artifactDigest: 'a'.repeat(64) }
});
test('complete evidence is eligible for review, not deployment', () => {
  assert.equal(evaluateRelease(valid()).decision, 'GO');
});
test('missing approval blocks', () => {
  const e = valid(); e.approval.status = 'MISSING';
  assert.equal(evaluateRelease(e).decision, 'PENDING_EVIDENCE');
});
test('failed tenant isolation blocks', () => {
  const e = valid(); e.tenantIsolation = 'FAILED';
  assert.equal(evaluateRelease(e).decision, 'NO_GO');
});
test('self approval blocks', () => {
  const e = valid(); e.approval.operatorId = e.approval.approverId;
  assert.notEqual(evaluateRelease(e).decision, 'GO');
});
test('approval for another artifact blocks', () => {
  const e = valid(); e.approval.artifactDigest = 'b'.repeat(64);
  assert.notEqual(evaluateRelease(e).decision, 'GO');
});
