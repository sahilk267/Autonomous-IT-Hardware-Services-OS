/** Fail-closed release evaluation. Caller MUST load evidence from trusted, immutable storage.
 * This module does not authenticate approvers or execute a deployment.
 */
export type ReleaseDecision = 'GO' | 'NO_GO' | 'PENDING_EVIDENCE';
export type EvidenceStatus = 'VERIFIED' | 'FAILED' | 'MISSING';
export interface ReleaseEvidence {
  releaseId: string;
  artifactDigest: string;
  migrationReconciliation: EvidenceStatus;
  tenantIsolation: EvidenceStatus;
  recoveryDrill: EvidenceStatus;
  rtoRpoVerified: EvidenceStatus;
  securityTests: EvidenceStatus;
  approval: {
    status: EvidenceStatus;
    approverId?: string;
    operatorId?: string;
    artifactDigest?: string;
  };
}
export interface ReleaseEvaluation {
  decision: ReleaseDecision;
  blockers: string[];
}
export function evaluateRelease(e: ReleaseEvidence): ReleaseEvaluation {
  const blockers: string[] = [];
  if (!e.releaseId?.trim()) blockers.push('releaseId missing');
  if (!/^[a-f0-9]{64}$/i.test(e.artifactDigest ?? '')) blockers.push('artifactDigest invalid');
  const checks: Array<keyof Pick<ReleaseEvidence, 'migrationReconciliation' | 'tenantIsolation' | 'recoveryDrill' | 'rtoRpoVerified' | 'securityTests'>> = [
    'migrationReconciliation', 'tenantIsolation', 'recoveryDrill', 'rtoRpoVerified', 'securityTests'
  ];
  for (const key of checks) if (e[key] !== 'VERIFIED') blockers.push(`${key}: ${e[key] ?? 'MISSING'}`);
  if (e.approval?.status !== 'VERIFIED') blockers.push('approval not verified');
  if (!e.approval?.approverId || !e.approval?.operatorId) blockers.push('independent identities missing');
  if (e.approval?.approverId && e.approval.approverId === e.approval.operatorId) blockers.push('approver and operator must differ');
  if (e.approval?.artifactDigest !== e.artifactDigest) blockers.push('approval artifact digest mismatch');
  const failed = checks.some(key => e[key] === 'FAILED') || e.approval?.status === 'FAILED';
  return { decision: failed ? 'NO_GO' : blockers.length ? 'PENDING_EVIDENCE' : 'GO', blockers };
}
