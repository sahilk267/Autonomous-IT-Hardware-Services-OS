// Phase 10.5I: signer independence and no-go operator handoff acceptance.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {assessGovernedHandoff,operatorAttestationBytes,operatorRecordHash}
  from '../scripts/postgres/governed_handoff_gate.mjs';

const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const json=x=>Buffer.from(JSON.stringify(x));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'apex-operator-review-'));
const archive=crypto.randomBytes(256);
const sourceHash=hash('synthetic-authoritative-source-handoff');
const proof={mode:'INDEPENDENT_DISPOSABLE_RESTORE_REHEARSAL_EVIDENCE',
  verified:true,sourceDatabaseSnapshotSha256:hash('db-synthetic'),originalSourceSha256:sourceHash,
  importTenantKeySha256:hash('tenant-synthetic'),tableCount:18,
  forcedRlsTableCount:16,migrationMarkerCount:8,schemaSha256:hash('RLS-synthetic'),
  tableRecordCounts:{customer_records:2},sqlReadOnly:true,productionCutoverReady:false,
  restoreEqual:true,rollbackAcceptance:'DISPOSABLE_REHEARSAL_ONLY',
  noCustomerMigrationApplied:true};
const evidence=json(proof),time=Date.now()-60000;
const t=ms=>time+ms;
const plan={scope:'DISPOSABLE_PG16_RECOVERY_REHEARSAL',operatorSession:'phase_i_synthetic_ci_1',
  sourceSha256:sourceHash,archiveSha256:hash(archive),
  evidenceSha256:hash(evidence),rpoMinutes:3,rtoMinutes:2,
  maximumDowntimeMinutes:5,windowStart:new Date(time).toISOString(),
  windowEnd:new Date(t(180000)).toISOString(),writeFreezeRequired:true,
  approvalClassification:'SYNTHETIC_CI_OPERATOR_NO_EXTERNAL_APPROVAL'};
const observations={operatorSession:plan.operatorSession,sourceSha256:sourceHash,
  archiveSha256:hash(archive),evidenceSha256:hash(evidence),
  archiveSizeBytes:archive.length,clock:'CI_RUNNER_WALL_CLOCK_MILLISECONDS',
  writeFrozen:true,archiveBeganMs:t(1000),archiveFinishedMs:t(2000),
  initialRestoreBeganMs:t(3000),initialRestoreVerifiedMs:t(12000),
  damageDetectedMs:t(14000),rollbackBeganMs:t(15000),
  rollbackRestoredMs:t(33000),rollbackVerifiedMs:t(41000),writesAllowedMs:t(43000)};
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
let passed=0;
function check(name,fn){fn();passed++;console.log('PASS '+name);}
function alter(file,callback){
  const obj=JSON.parse(bundle[file]);callback(obj);
  return {...bundle,[file]:json(obj)};
}
function reject(name,altered){
  check(name,()=>assert.throws(()=>assessGovernedHandoff(altered)));
}
try{
  const result=assessGovernedHandoff(bundle);
  check('Independent operator plus security witness sign one bounded synthetic recovery report',()=>{
    assert.equal(result.independentOperatorAndWitnessSignaturesValid,true);
    assert.equal(result.distinctSignerCount,2);
    assert.equal(result.measuredCloneRecoveryMs,27000);
    assert.equal(result.realCorporateOperatorApprovalVerified,false);
    assert.equal(result.realProductionRpoRtoMeasured,false);
    assert.equal(result.productionCutoverReady,false);
  });
  reject('Operator public-key registry substitution rejected by independent pin',
    alter('trust',x=>x.keys[0].principal='malicious-operator'));
  reject('Same public key cannot act as operator and security witness',(()=>{
    const t=JSON.parse(trustBytes);
    t.keys[1].publicKeyPem=t.keys[0].publicKeyPem;
    return {...bundle,trust:json(t),trustPin:hash(json(t))};
  })());
  reject('Missing witness cannot create an approved operator handoff',
    alter('permit',x=>x.records.pop()));
  reject('Wrong signature role is rejected',
    alter('permit',x=>x.records[1].role='DBA_REHEARSAL_OPERATOR'));
  reject('Hash-chain predecessor tamper is rejected',
    alter('permit',x=>x.records[1].prevRecordSha256='b'.repeat(64)));
  reject('Operator signature modification fails Ed25519 verification',
    alter('permit',x=>x.records[0].signatureBase64='A'.repeat(86)+'=='));
  reject('Changing out-of-band approval ticket without resigning fails',
    alter('permit',x=>x.records[0].attestation.reviewTicketSha256='f'.repeat(64)));
  reject('Claimed production target is explicitly invalid',
    alter('permit',x=>x.records[0].attestation.operationTarget='PRODUCTION'));
  reject('Expired operational review cannot be used',
    alter('permit',x=>x.records[0].attestation.expiresAt='2020-01-01T00:00:00Z'));
  reject('Changed recovery observation cannot match signed operator packet',
    alter('observations',x=>x.rollbackVerifiedMs+=1000));
  reject('Changed archive bytes invalidate signed restore provenance',
    {...bundle,archive:crypto.randomBytes(256)});
  reject('Synthetic RTO exceeding plan cannot be witnessed',
    alter('observations',x=>x.rollbackVerifiedMs=x.damageDetectedMs+150000));
  reject('Attempt to reclassify synthetic plan as production fails',
    alter('plan',x=>x.approvalClassification='APPROVED_REAL_PRODUCTION'));
  const fileNames=['trust','permit','plan','observations','evidence','archive'];
  const files={};
  for(const key of fileNames){
    files[key]=path.join(temp,key==='archive'?'sealed.dump':key+'.json');
    fs.writeFileSync(files[key],bundle[key],{mode:0o600});
  }
  const args=fileNames.flatMap(key=>['--'+key,files[key]]);
  const cli=(env={},extras=[])=>spawnSync(process.execPath,
    ['scripts/postgres/governed_handoff_gate.mjs',...args,...extras],{
      encoding:'utf8',env:{...process.env,NODE_ENV:'staging',
        APEX_OPERATOR_HANDOFF_ACK:'OFFLINE_SYNTHETIC_REVIEW_ONLY',
        APEX_OPERATOR_TRUST_SHA256:hash(trustBytes),DATABASE_URL:'',
        APEX_PG_RUNTIME_ENABLED:'',...env}
    });
  let r=cli();
  check('Valid synthetic packet always produces BLOCKED exit 3',()=>{
    assert.equal(r.status,3,r.stderr);
    assert.equal(JSON.parse(r.stdout).productionCutoverReady,false);
  });
  r=cli({NODE_ENV:'production'});
  check('Production execution explicitly refused',()=>assert.equal(r.status,2));
  r=cli({APEX_OPERATOR_TRUST_SHA256:'f'.repeat(64)});
  check('Unsigned trust registry cannot authorize an operator handoff',()=>
    assert.equal(r.status,1));
  r=cli({},['--authorize-production']);
  check('No approval, migration or operation execution CLI exists',()=>
    assert.equal(r.status,2));
  console.log('PHASE 10.5I GOVERNED HANDOFF '+passed+'/'+passed+' PASS');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
