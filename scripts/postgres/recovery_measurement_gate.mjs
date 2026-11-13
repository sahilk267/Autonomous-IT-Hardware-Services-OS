#!/usr/bin/env node
// Phase 10.5H: measure operator-run disposable restore window and compare budget.
// No SQL mutation, no restore, no external approval or production migration.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function privateFile(p,max=8_000_000){
  assert.ok(typeof p==='string'&&path.isAbsolute(p),'absolute private evidence path required');
  const real=fs.realpathSync(p),rel=path.relative(process.cwd(),real);
  assert.ok(rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel),
    'checkout path rejected');
  const stat=fs.statSync(real);
  assert.ok(stat.isFile()&&stat.size>0&&stat.size<=max,'evidence file size/type refused');
  if(process.platform!=='win32')assert.equal(stat.mode&0o007,0,'world-accessible evidence rejected');
  return {real,bytes:fs.readFileSync(real)};
}
const keys=(v,allowed)=>{
  assert.ok(v&&typeof v==='object'&&!Array.isArray(v));
  assert.deepEqual(Object.keys(v).sort(),allowed.slice().sort(),'unexpected plan/measurement field');
};
const bounded=(value,low,high,label)=>{
  assert.ok(Number.isSafeInteger(value)&&value>=low&&value<=high,
    'invalid '+label);
};
export function assessRecovery({plan,observations,evidence,archive}){
  const p=JSON.parse(plan),o=JSON.parse(observations),proof=JSON.parse(evidence);
  keys(p,['scope','operatorSession','sourceSha256','archiveSha256','evidenceSha256',
    'rpoMinutes','rtoMinutes','maximumDowntimeMinutes','windowStart','windowEnd',
    'writeFreezeRequired','approvalClassification']);
  assert.equal(p.scope,'DISPOSABLE_PG16_RECOVERY_REHEARSAL');
  assert.equal(p.approvalClassification,'SYNTHETIC_CI_OPERATOR_NO_EXTERNAL_APPROVAL');
  assert.ok(typeof p.operatorSession==='string'&&/^[A-Za-z0-9_-]{12,120}$/.test(p.operatorSession));
  assert.ok(/^[0-9a-f]{64}$/.test(p.sourceSha256));
  assert.equal(p.archiveSha256,sha(archive),'archive hash differs from sealed plan');
  assert.equal(p.evidenceSha256,sha(evidence),'verified restore evidence differs from sealed plan');
  assert.equal(p.writeFreezeRequired,true);
  for(const k of ['rpoMinutes','rtoMinutes','maximumDowntimeMinutes'])
    bounded(p[k],1,240,k);
  assert.ok(p.rtoMinutes<=p.maximumDowntimeMinutes,'RTO exceeds downtime target');
  const windowStart=Date.parse(p.windowStart),windowEnd=Date.parse(p.windowEnd);
  assert.ok(Number.isFinite(windowStart)&&Number.isFinite(windowEnd)&&
    windowEnd>windowStart&&windowEnd-windowStart<=86400000,'invalid rehearsal window');
  keys(o,['operatorSession','sourceSha256','archiveSha256','evidenceSha256','archiveSizeBytes',
    'clock','writeFrozen','archiveBeganMs','archiveFinishedMs',
    'initialRestoreBeganMs','initialRestoreVerifiedMs','damageDetectedMs',
    'rollbackBeganMs','rollbackRestoredMs','rollbackVerifiedMs','writesAllowedMs']);
  assert.equal(o.operatorSession,p.operatorSession);
  assert.equal(o.sourceSha256,p.sourceSha256);
  assert.equal(o.archiveSha256,p.archiveSha256);
  assert.equal(o.evidenceSha256,p.evidenceSha256);
  assert.equal(o.clock,'CI_RUNNER_WALL_CLOCK_MILLISECONDS');
  assert.equal(o.writeFrozen,true,'source writes were not frozen at rehearsal boundary');
  bounded(o.archiveSizeBytes,1,500_000_000,'archive size');
  assert.equal(o.archiveSizeBytes,archive.byteLength,'archive size mismatch');
  const events=[
    'archiveBeganMs','archiveFinishedMs',
    'initialRestoreBeganMs','initialRestoreVerifiedMs',
    'damageDetectedMs','rollbackBeganMs','rollbackRestoredMs',
    'rollbackVerifiedMs','writesAllowedMs'
  ];
  // CI uses wall-clock samples from independent shell processes. NTP slews
  // can make the first archive sample appear up to ~1s before the previously
  // captured freeze boundary. Allow only a 2-second *start* skew, never an
  // extended recovery deadline. Event-to-event ordering and every RPO/RTO/
  // downtime budget remain unchanged; this is NOT a production clock SLA.
  const wallClockStartSkewToleranceMs=2000;
  for(let i=0;i<events.length;i++){
    const value=o[events[i]];
    bounded(value,1,9_999_999_999_999,'timestamp '+events[i]);
    assert.ok(value>=windowStart-wallClockStartSkewToleranceMs&&value<=windowEnd,
      'measurement outside bounded rehearsal window: '+events[i] +
      ' startOffsetMs='+(value-windowStart)+' endOffsetMs='+(value-windowEnd) +
      ' currentWindowMs='+(windowEnd-windowStart));
    if(i)assert.ok(value>=o[events[i-1]],
      'impossible time ordering in operator rehearsal');
  }
  // Age of a no-write synthetic source snapshot at archive capture (RPO
  // surrogate), not actual restored production transaction-loss measurement.
  const archiveAgeMs=o.archiveFinishedMs-windowStart;
  const rtoMs=o.rollbackVerifiedMs-o.damageDetectedMs;
  const downtimeMs=o.writesAllowedMs-windowStart;
  const firstRestoreMs=o.initialRestoreVerifiedMs-o.initialRestoreBeganMs;
  const rollbackMs=o.rollbackVerifiedMs-o.rollbackBeganMs;
  assert.ok(archiveAgeMs<=p.rpoMinutes*60000,
    'archive source-age surrogate exceeds configured RPO budget');
  assert.ok(rtoMs<=p.rtoMinutes*60000,'measured rollback RTO exceeds target');
  assert.ok(downtimeMs<=p.maximumDowntimeMinutes*60000,
    'measured downtime window exceeds target');
  keys(proof,['mode','verified','sourceDatabaseSnapshotSha256','originalSourceSha256',
    'importTenantKeySha256','tableCount','forcedRlsTableCount',
    'migrationMarkerCount','schemaSha256','tableRecordCounts','sqlReadOnly',
    'productionCutoverReady','restoreEqual','rollbackAcceptance',
    'noCustomerMigrationApplied']);
  assert.equal(proof.mode,'INDEPENDENT_DISPOSABLE_RESTORE_REHEARSAL_EVIDENCE');
  assert.equal(proof.originalSourceSha256,p.sourceSha256,'restored source provenance drift');
  assert.ok(proof.verified===true&&proof.restoreEqual===true &&
    proof.sqlReadOnly===true&&proof.productionCutoverReady===false &&
    proof.noCustomerMigrationApplied===true&&
    proof.rollbackAcceptance==='DISPOSABLE_REHEARSAL_ONLY' &&
    proof.tableCount===18&&proof.forcedRlsTableCount===16&&
    proof.migrationMarkerCount===8&&
    /^[0-9a-f]{64}$/.test(proof.schemaSha256),
    'restore provenance/schema/isolation not accepted');
  return {
    mode:'MEASURED_DISPOSABLE_OPERATOR_RECOVERY_ACCEPTANCE',
    observed:true,archiveSha256:sha(archive),
    sourceSha256:p.sourceSha256,evidenceSha256:sha(evidence),
    archiveSizeBytes:archive.byteLength,
    firstRestoreElapsedMs:firstRestoreMs,rollbackElapsedMs:rollbackMs,
    detectedToVerifiedRollbackMs:rtoMs,writeFreezeWindowMs:downtimeMs,
    syntheticFrozenSnapshotAgeMs:archiveAgeMs,
    proposedRpoBudgetMs:p.rpoMinutes*60000,
    proposedRtoBudgetMs:p.rtoMinutes*60000,
    proposedDowntimeBudgetMs:p.maximumDowntimeMinutes*60000,
    budgetsMet:true,clockSource:'CI_RUNNER_WALL_CLOCK_MILLISECONDS',
    wallClockStartSkewToleranceMs,
    observedArchiveStartOffsetMs:o.archiveBeganMs-windowStart,
    realCustomerDataLossMeasured:false,productionRpoRtoValidated:false,
    independentOperatorApprovalVerified:false,
    migrationApplied:false,productionCutoverReady:false,
    decision:'SYNTHETIC_REHEARSAL_BUDGETS_PASS_PRODUCTION_BLOCKED'
  };
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const e=process.env,argv=process.argv.slice(2),
    names=['plan','observations','evidence','archive'];
  if(argv.length!==8 || names.some((s,i)=>argv[2*i]!=='--'+s) ||
    e.NODE_ENV==='production'||e.DATABASE_URL||e.APEX_PG_RUNTIME_ENABLED ||
    e.APEX_PG_STAGING_ACK!=='STAGING_ONLY_NO_PRODUCTION'||
    e.APEX_PG_MEASURED_REHEARSAL_ACK!=='DISPOSABLE_CI_CLONE_ONLY'||
    !['127.0.0.1','localhost'].includes(e.PGHOST||'')||
    !/^apex_stage_[a-z0-9_]{2,60}$/.test(e.PGDATABASE||'')||
    !/^apex_stage_[a-z0-9_]{2,60}$/.test(e.PGRESTORE_DATABASE||'')||
    e.PGDATABASE===e.PGRESTORE_DATABASE){
    console.error('MEASURED RECOVERY REFUSED: local throwaway stage/clone only');
    process.exit(2);
  }
  try{
    const files=names.map((s,i)=>privateFile(argv[2*i+1],
      s==='archive'?500_000_000:8_000_000));
    assert.equal(new Set(files.map(x=>x.real)).size,files.length,'inputs must be distinct');
    const result=assessRecovery(Object.fromEntries(names.map((name,i)=>
      [name,files[i].bytes])));
    for(const file of files)assert.equal(sha(fs.readFileSync(file.real)),
      sha(file.bytes),'rehearsal evidence changed during verification');
    console.log(JSON.stringify(result));
    process.exitCode=3;
  }catch(error){
    console.error('MEASURED RECOVERY FAILED: '+error.message);
    process.exitCode=1;
  }
}
