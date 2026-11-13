// Phase 10.5H -- independently evaluate measured restore/rollback acceptance.
// Synthetic timing input is never presented as an approved production RPO/RTO.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {assessRecovery} from '../scripts/postgres/recovery_measurement_gate.mjs';
const sha=x=>crypto.createHash('sha256').update(x).digest('hex'),json=x=>Buffer.from(JSON.stringify(x));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'apex-restore-observation-'));
const archive=crypto.randomBytes(128),sourceSha=sha('synthetic-private-source');
const evidence={
  mode:'INDEPENDENT_DISPOSABLE_RESTORE_REHEARSAL_EVIDENCE',verified:true,
  sourceDatabaseSnapshotSha256:sha('synthetic-restored-rows'),
  originalSourceSha256:sourceSha,importTenantKeySha256:sha('fixture-tenant'),
  tableCount:18,forcedRlsTableCount:16,migrationMarkerCount:8,
  schemaSha256:sha('synthetic-RLS-constraints-indexes'),tableRecordCounts:{customers:2},
  sqlReadOnly:true,productionCutoverReady:false,restoreEqual:true,
  rollbackAcceptance:'DISPOSABLE_REHEARSAL_ONLY',noCustomerMigrationApplied:true
};
const evidenceBytes=json(evidence);
const now=Date.now()-120000;
const time=delta=>now+delta;
const plan={scope:'DISPOSABLE_PG16_RECOVERY_REHEARSAL',
  operatorSession:'synthetic-phase-h-ci',
  sourceSha256:sourceSha,archiveSha256:sha(archive),
  evidenceSha256:sha(evidenceBytes),rpoMinutes:3,rtoMinutes:2,
  maximumDowntimeMinutes:5,
  windowStart:new Date(time(0)).toISOString(),
  windowEnd:new Date(time(240000)).toISOString(),
  writeFreezeRequired:true,freezeMonotonicMs:50000000,
  approvalClassification:'SYNTHETIC_CI_OPERATOR_NO_EXTERNAL_APPROVAL'};
const observations={
  operatorSession:plan.operatorSession,sourceSha256:sourceSha,
  archiveSha256:plan.archiveSha256,evidenceSha256:plan.evidenceSha256,
  archiveSizeBytes:archive.byteLength,clock:'CI_RUNNER_WALL_AND_MONOTONIC_MILLISECONDS',
  writeFrozen:true,
  archiveBeganMs:time(1000),archiveFinishedMs:time(2000),
  initialRestoreBeganMs:time(3000),initialRestoreVerifiedMs:time(12000),
  damageDetectedMs:time(14000),rollbackBeganMs:time(15000),
  rollbackRestoredMs:time(35000),rollbackVerifiedMs:time(42000),
  writesAllowedMs:time(43000),
  monotonicEventMs:Object.fromEntries([
    ['archiveBeganMs',1000],['archiveFinishedMs',2000],
    ['initialRestoreBeganMs',3000],['initialRestoreVerifiedMs',12000],
    ['damageDetectedMs',14000],['rollbackBeganMs',15000],
    ['rollbackRestoredMs',35000],['rollbackVerifiedMs',42000],
    ['writesAllowedMs',43000]
  ].map(([k,delta])=>[k,plan.freezeMonotonicMs+delta]))
};
const bundle={plan:json(plan),observations:json(observations),
  evidence:evidenceBytes,archive};
let passed=0;
const test=(label,fn)=>{fn();passed++;console.log('PASS '+label);};
const bad=(label,changes)=>test(label,()=>assert.throws(()=>assessRecovery(changes)));
function change(which,fn){
  const o=JSON.parse(bundle[which]);fn(o);
  return {...bundle,[which]:json(o)};
}
try{
  const result=assessRecovery(bundle);
  test('Observed synthetic recovery meets exact bounded RPO surrogate, RTO and downtime',()=>{
    assert.equal(result.budgetsMet,true);
    assert.equal(result.detectedToVerifiedRollbackMs,28000);
    assert.equal(result.writeFreezeWindowMs,43000);
    assert.equal(result.syntheticFrozenSnapshotAgeMs,2000);
    assert.equal(result.realCustomerDataLossMeasured,false);
    assert.equal(result.productionRpoRtoValidated,false);
    assert.equal(result.independentOperatorApprovalVerified,false);
    assert.equal(result.productionCutoverReady,false);
  });
  const skewed={...observations,archiveBeganMs:time(-1000)};
  test('Small isolated CI wall-clock backward slews are explicitly tolerated at freeze start',()=>{
    const row=assessRecovery({...bundle,observations:Buffer.from(JSON.stringify(skewed))});
    assert.equal(row.wallClockStartSkewToleranceMs,2000);
    assert.equal(row.observedArchiveStartOffsetMs,-1000);
    assert.equal(row.productionCutoverReady,false);
  });
  bad('Clock skew larger than the bounded 2-second allowance is rejected',
    change('observations',x=>x.archiveBeganMs=time(-2500)));
  bad('Out-of-order monotonic recovery events cannot be hidden by plausible wall-clock values',
    change('observations',x=>
      x.monotonicEventMs.rollbackVerifiedMs=x.monotonicEventMs.rollbackBeganMs-100));
  bad('An implausible monotonic drift outside the declared window is denied',
    change('observations',x=>x.monotonicEventMs.archiveFinishedMs=plan.freezeMonotonicMs+250000));
  bad('Archive bytes changed from sealed operator plan',{...bundle,archive:crypto.randomBytes(128)});
  bad('RTO over budget fails independent evaluator',change('plan',x=>x.rtoMinutes=0));
  bad('Too-small rollback RTO budget rejects measured recovery',
    change('observations',x=>x.rollbackVerifiedMs=x.damageDetectedMs+180000));
  bad('Archive older than stated synthetic snapshot-age budget fails',change('plan',x=>x.rpoMinutes=0));
  bad('Downtime beyond configured plan is refused',
    change('observations',x=>x.writesAllowedMs=x.archiveBeganMs+360000));
  bad('Reordered restore/detection timestamps are rejected',
    change('observations',x=>x.rollbackBeganMs=x.initialRestoreBeganMs));
  bad('Restored source hash mismatch fails rehearsal',
    change('evidence',x=>x.originalSourceSha256='0'.repeat(64)));
  bad('Fake real-world operator approval scope is not accepted',
    change('plan',x=>x.approvalClassification='REAL_APPROVED'));
  bad('Missing write-freeze proof is rejected',
    change('observations',x=>x.writeFrozen=false));
  bad('Unexpected evidence acceptance state is denied',
    change('evidence',x=>x.productionCutoverReady=true));
  const files={};
  for(const [k,v] of Object.entries(bundle)){
    files[k]=path.join(temp,k==='archive'?'synthetic.dump':k+'.json');
    fs.writeFileSync(files[k],v,{mode:0o600});
  }
  const args=['plan','observations','evidence','archive']
    .flatMap(k=>['--'+k,files[k]]);
  const run=(env={},extra=[])=>spawnSync(process.execPath,
    ['scripts/postgres/recovery_measurement_gate.mjs',...args,...extra],{
      encoding:'utf8',env:{...process.env,NODE_ENV:'staging',
        APEX_PG_STAGING_ACK:'STAGING_ONLY_NO_PRODUCTION',
        APEX_PG_MEASURED_REHEARSAL_ACK:'DISPOSABLE_CI_CLONE_ONLY',
        PGHOST:'127.0.0.1',PGDATABASE:'apex_stage_fixture',
        PGRESTORE_DATABASE:'apex_stage_restorefixture',
        DATABASE_URL:'',APEX_PG_RUNTIME_ENABLED:'',...env}
    });
  let cli=run();
  test('Real CLI returns blocked exit 3 even on perfect synthetic timing',()=>{
    assert.equal(cli.status,3,cli.stderr);
    assert.equal(JSON.parse(cli.stdout).productionCutoverReady,false);
  });
  cli=run({NODE_ENV:'production'});
  test('Production environment cannot enter recovery measurement CLI',()=>assert.equal(cli.status,2));
  cli=run({PGRESTORE_DATABASE:'postgres'});
  test('Restore target outside disposable stage is rejected',()=>assert.equal(cli.status,2));
  cli=run({},['--execute']);
  test('CLI has no restore or cutover execution option',()=>assert.equal(cli.status,2));
  console.log('PHASE 10.5H RECOVERY MEASUREMENT SUMMARY '+passed+'/'+passed+' PASS');
}finally{
  fs.rmSync(temp,{recursive:true,force:true});
}
