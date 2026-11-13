// Synthetic Phase 10.5I operator fixture, linked to the SAME source and restore
// evidence as Phase 10.5H. No actual DB, operator or customer.
// Phase 10.5I: signer independence and no-go operator handoff acceptance.
import crypto from 'node:crypto';
import {operatorAttestationBytes,operatorRecordHash} from '../../scripts/postgres/governed_handoff_gate.mjs';


export function makePhaseJOperatorFixture(reviewerFixture){
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const json=x=>Buffer.from(JSON.stringify(x));
const archive=crypto.randomBytes(256);
const sourceHash=hash(reviewerFixture.sourceBytes);
const proof={mode:'INDEPENDENT_DISPOSABLE_RESTORE_REHEARSAL_EVIDENCE',
  verified:true,sourceDatabaseSnapshotSha256:hash('db-synthetic'),originalSourceSha256:sourceHash,
  importTenantKeySha256:hash('tenant-synthetic'),tableCount:18,
  forcedRlsTableCount:16,migrationMarkerCount:8,schemaSha256:hash('RLS-synthetic'),
  tableRecordCounts:{customer_records:2},sqlReadOnly:true,productionCutoverReady:false,
  restoreEqual:true,rollbackAcceptance:'DISPOSABLE_REHEARSAL_ONLY',
  noCustomerMigrationApplied:true};
const evidence=reviewerFixture.evidenceBytes,time=Date.now()-60000;
const t=ms=>time+ms;
const plan={scope:'DISPOSABLE_PG16_RECOVERY_REHEARSAL',operatorSession:'phase_i_synthetic_ci_1',
  sourceSha256:sourceHash,archiveSha256:hash(archive),
  evidenceSha256:hash(evidence),rpoMinutes:3,rtoMinutes:2,
  maximumDowntimeMinutes:5,windowStart:new Date(time).toISOString(),
  windowEnd:new Date(t(180000)).toISOString(),writeFreezeRequired:true,
  freezeMonotonicMs:60000000,
  approvalClassification:'SYNTHETIC_CI_OPERATOR_NO_EXTERNAL_APPROVAL'};
const observations={operatorSession:plan.operatorSession,sourceSha256:sourceHash,
  archiveSha256:hash(archive),evidenceSha256:hash(evidence),
  archiveSizeBytes:archive.length,clock:'CI_RUNNER_WALL_AND_MONOTONIC_MILLISECONDS',
  writeFrozen:true,archiveBeganMs:t(1000),archiveFinishedMs:t(2000),
  initialRestoreBeganMs:t(3000),initialRestoreVerifiedMs:t(12000),
  damageDetectedMs:t(14000),rollbackBeganMs:t(15000),
  rollbackRestoredMs:t(33000),rollbackVerifiedMs:t(41000),writesAllowedMs:t(43000),
  monotonicEventMs:Object.fromEntries([
    ['archiveBeganMs',1000],['archiveFinishedMs',2000],
    ['initialRestoreBeganMs',3000],['initialRestoreVerifiedMs',12000],
    ['damageDetectedMs',14000],['rollbackBeganMs',15000],
    ['rollbackRestoredMs',33000],['rollbackVerifiedMs',41000],
    ['writesAllowedMs',43000]
  ].map(([key,delta])=>[key,plan.freezeMonotonicMs+delta]))};
const planBytes=json(plan),observedBytes=json(observations);
const roles=['DBA_REHEARSAL_OPERATOR','INDEPENDENT_SECURITY_WITNESS'];
const signers=roles.map((role,i)=>{
  const kp=crypto.generateKeyPairSync('ed25519');
  return {role,keyId:'operator-evidence-key-'+i,principal:'review-fixture-'+i,
    publicKeyPem:kp.publicKey.export({type:'spki',format:'pem'}),secret:kp.privateKey};
});
const trust={scope:'OFFLINE_OPERATOR_EVIDENCE_REVIEW_KEYS',keys:signers.map(s=>({
  role:s.role,keyId:s.keyId,principal:s.principal,publicKeyPem:s.publicKeyPem
}))};
const trustBytes=json(trust);
const issued=new Date(Date.now()-1000).toISOString(),
  expires=new Date(Date.now()+3600000).toISOString();
const ticket=hash('synthetic-independent-operator-ticket');
let prev='0'.repeat(64);
const records=signers.map((s,i)=>{
  const row={sequence:i+1,prevRecordSha256:prev,role:s.role,keyId:s.keyId,
    attestation:{planSha256:hash(planBytes),observationsSha256:hash(observedBytes),
      evidenceSha256:hash(evidence),archiveSha256:hash(archive),
      operatorSession:plan.operatorSession,reviewTicketSha256:ticket,
      decision:'REVIEWED_SYNTHETIC_RECOVERY_EVIDENCE_ONLY',
      issuedAt:issued,expiresAt:expires,
      operationTarget:'DISPOSABLE_POSTGRESQL_CI_COPY_ONLY'},signatureBase64:''};
  row.signatureBase64=crypto.sign(null,operatorAttestationBytes(row),s.secret)
    .toString('base64');
  prev=operatorRecordHash(row);
  return row;
});
const permitBytes=json({scope:'OFFLINE_NO_CUSTOMER_MIGRATION_APPROVAL',records});
const bundle={trust:trustBytes,permit:permitBytes,plan:planBytes,
  observations:observedBytes,evidence,archive,trustPin:hash(trustBytes)};

return {bundle,trustBytes,permitBytes,planBytes,observedBytes,
  evidence,archive,signers,ticket,issued,expires};
}
