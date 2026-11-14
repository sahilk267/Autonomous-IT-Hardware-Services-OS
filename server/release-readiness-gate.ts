import type { ReleaseEvidence, ReleaseEvaluation, EvidenceStatus } from './release-governance.ts';

/** This is a readiness check only. Never use this function as deployment authorization.
 * Input MUST come from a separately authenticated and tamper-evident evidence service.
 */
const checks = ['migrationReconciliation', 'tenantIsolation', 'recoveryDrill', 'rtoRpoVerified', 'securityTests'] as const;
const validDigest = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
const validStatus = (value: unknown): value is EvidenceStatus =>
  value === 'VERIFIED' || value === 'FAILED' || value === 'MISSING';

export function evaluateStrictReadiness(input: unknown): ReleaseEvaluation {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { decision: 'NO_GO', blockers: ['invalid evidence payload'] };
  }
  const e = input as Partial<ReleaseEvidence>;
  const blockers: string[] = [];
  let failed = false;
  if (typeof e.releaseId !== 'string' || !e.releaseId.trim()) blockers.push('releaseId missing');
  if (!validDigest(e.artifactDigest)) blockers.push('artifactDigest invalid');
  for (const key of checks) {
    const status = e[key];
    if (!validStatus(status)) { blockers.push(`${key}: invalid status`); failed = true; }
    else if (status !== 'VERIFIED') {
      blockers.push(`${key}: ${status}`);
      if (status === 'FAILED') failed = true;
    }
  }
  const approval = e.approval;
  if (!approval || typeof approval !== 'object') {
    blockers.push('approval missing');
  } else {
    if (!validStatus(approval.status)) { blockers.push('approval invalid status'); failed = true; }
    else if (approval.status !== 'VERIFIED') {
      blockers.push('approval not verified');
      if (approval.status === 'FAILED') failed = true;
    }
    const approver = typeof approval.approverId === 'string' ? approval.approverId.trim() : '';
    const operator = typeof approval.operatorId === 'string' ? approval.operatorId.trim() : '';
    if (!approver || !operator) blockers.push('independent identities missing');
    else if (approver === operator) blockers.push('self approval prohibited');
    if (!validDigest(approval.artifactDigest) || !validDigest(e.artifactDigest) ||
        approval.artifactDigest.toLowerCase() !== e.artifactDigest.toLowerCase()) {
      blockers.push('approval artifact digest mismatch');
    }
  }
  return { decision: failed ? 'NO_GO' : blockers.length ? 'PENDING_EVIDENCE' : 'GO', blockers };
}
