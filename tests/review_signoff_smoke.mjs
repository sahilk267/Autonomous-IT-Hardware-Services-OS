// Phase 10.5G: hermetic, ephemeral Ed25519 reviewer-signoff negatives.
// No production keys, real reviewer IDs, DB access or network requests.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {roles,canonical,attestationBytes,recordHash,inspectBundle}
  from '../scripts/postgres/review_signoff_gate.mjs';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'apex-signoff-only-'));
const source={tenant:{id:'stage-review-tenant'},customers:[
  {id:'cust-rehearsal-only'}],
  invoices:[{id:'invoice-private-1',unissued:true}],
  products:[{id:'product-private-2',name:'CI synthetic product'}]};
const sourceBytes=Buffer.from(JSON.stringify(source));
const review={tenantId:source.tenant.id,sourceSha256:sha(sourceBytes),
  decisions:[
    {kind:'invoices',id:'invoice-private-1',disposition:'RETAIN_OWNER_ONLY',
      customerId:null,evidenceSha256:'a'.repeat(64),
      reviewerRefs:['custodian-ticket-1','security-ticket-2']},
    {kind:'products',id:'product-private-2',disposition:'PROPOSE_CUSTOMER',
      customerId:'cust-rehearsal-only',evidenceSha256:'b'.repeat(64),
      reviewerRefs:['custodian-ticket-3','security-ticket-4']}
  ]};
const reviewBytes=Buffer.from(JSON.stringify(review));
const evidence={mode:'INDEPENDENT_DISPOSABLE_RESTORE_REHEARSAL_EVIDENCE',
  verified:true,originalSourceSha256:sha(sourceBytes),
  sourceDatabaseSnapshotSha256:'a'.repeat(64),schemaSha256:'b'.repeat(64),
  tableCount:18,forcedRlsTableCount:16,migrationMarkerCount:8,
  sqlReadOnly:true,productionCutoverReady:false,restoreEqual:true,
  rollbackAcceptance:'DISPOSABLE_REHEARSAL_ONLY',
  noCustomerMigrationApplied:true,tableRecordCounts:{customer_records:2},
  importTenantKeySha256:sha(source.tenant.id)};
const evidenceBytes=Buffer.from(JSON.stringify(evidence));
const plan={operation:'DISPOSABLE_REHEARSAL_REVIEW_ONLY',
  sourceSha256:sha(sourceBytes),reviewSha256:sha(reviewBytes),
  restoreEvidenceSha256:sha(evidenceBytes),rpoMinutes:15,rtoMinutes:45,
  maximumDowntimeMinutes:60,windowStart:'2027-01-05T00:00:00Z',
  windowEnd:'2027-01-05T02:00:00Z',writeFreeze:true,
  rollbackOwner:'operator-reviewer-1',incidentOwner:'incident-manager-2',
  rollbackTrigger:'Rehearsal mismatch or access violation'};
const planBytes=Buffer.from(JSON.stringify(plan));
const principals=roles.map((role,i)=>{
  const pair=crypto.generateKeyPairSync('ed25519');
  return {role,keyId:'ephemeral-key-'+i,principal:'ephemeral-reviewer-'+i,
    publicKeyPem:pair.publicKey.export({format:'pem',type:'spki'}),privateKey:pair.privateKey};
});
const trust={scope:'OFFLINE_REVIEW_ONLY',keys:principals.map(({role,keyId,principal,publicKeyPem})=>(
  {role,keyId,principal,publicKeyPem}))};
const trustBytes=Buffer.from(JSON.stringify(trust));
const expires=new Date(Date.now()+14*86400000).toISOString();
function generateRecords(overrides={}){
  let previous='0'.repeat(64);
  return principals.map((x,i)=>{
    const attestation={
      sourceSha256:sha(sourceBytes),reviewSha256:sha(reviewBytes),
      planSha256:sha(planBytes),restoreEvidenceSha256:sha(evidenceBytes),
      decision:'REVIEWED_FOR_DISPOSABLE_REHEARSAL_ONLY',
      scope:'OFFLINE_NO_PRODUCTION_CUTOVER',expiresAt:expires
    };
    const r={sequence:i+1,prevSha256:previous,role:x.role,
      keyId:x.keyId,attestation,signatureBase64:''};
    r.signatureBase64=crypto.sign(null,attestationBytes(r),x.privateKey).toString('base64');
    previous=recordHash(r);
    return r;
  });
}
const bundle={source:sourceBytes,review:reviewBytes,trust:trustBytes,
  plan:planBytes,evidence:evidenceBytes,
  signoffs:Buffer.from(JSON.stringify({records:generateRecords()})),
  trustSha256:sha(trustBytes)};
let passed=0;
const test=(name,fn)=>{fn();passed++;console.log('PASS '+name);};
function inspect(changes={}){
  return inspectBundle({...bundle,...changes});
}
const bad=(name,mutate,contains)=>{
  const data=structuredClone({
    source,review,trust,evidence,plan,chain:JSON.parse(bundle.signoffs)
  });
  mutate(data);
  const altered={source:Buffer.from(JSON.stringify(data.source)),
    review:Buffer.from(JSON.stringify(data.review)),
    trust:Buffer.from(JSON.stringify(data.trust)),
    evidence:Buffer.from(JSON.stringify(data.evidence)),
    plan:Buffer.from(JSON.stringify(data.plan)),
    signoffs:Buffer.from(JSON.stringify(data.chain)),
    trustSha256:sha(trustBytes)};
  test(name,()=>assert.throws(()=>inspect(altered),
    e=>!contains||e.message.includes(contains)));
};
try{
  const r=inspect();
  test('Four independent pinned Ed25519 reviewer roles and hash-chain verify',()=>{
    assert.equal(r.signedRoleCount,4);
    assert.equal(r.cryptographicReviewSignaturesValid,true);
    assert.equal(r.identityCustodyExternallyCertified,false);
    assert.equal(r.ownershipMigrationApplied,false);
    assert.equal(r.operatorRunAuthorized,false);
    assert.equal(r.productionCutoverReady,false);
    assert.equal(r.decision,'REVIEW_EVIDENCE_ONLY_CUTOVER_BLOCKED');
    assert.equal(r.coveredOwnerOnlyRecords,2);
  });
  bad('Missing reviewer breaks append-only sequence',b=>b.chain.records.pop(),'four ordered');
  bad('Editing a signed approval is cryptographically rejected',b=>{
    b.chain.records[2].attestation.decision='REVIEWED_FOR_DISPOSABLE_REHEARSAL_ONLY_EDITED';
  },'Expected values');
  bad('Reviewer role substitution cannot cross signature role',b=>{
    b.chain.records[1].role='DATA_CUSTODIAN';
  },'role ordering');
  bad('Tampering with previous reviewer hash invalidates chain',b=>{
    b.chain.records[2].prevSha256='b'.repeat(64);
  },'predecessor');
  bad('Signature altered without updating approval cannot verify',b=>{
    b.chain.records[0].signatureBase64='A'.repeat(86)+'==';
  },'signature');
  bad('Independent reviewer key material cannot be reused',b=>{
    b.trust.keys[1].publicKeyPem=b.trust.keys[0].publicKeyPem;
  },'out-of-band registry');
  bad('Review source SHA is bound to signed source',b=>{
    b.review.sourceSha256='a'.repeat(64);
  },'review source SHA');
  bad('A missing legacy ownership decision rejects approval',b=>{
    b.review.decisions.pop();
  },'incomplete historical');
  bad('Unregistered customer cannot be proposed for mapping',b=>{
    b.review.decisions[1].customerId='unknown-customer';
  },'invalid customer');
  bad('Recovery RTO exceeding maximum downtime is a hard blocker',b=>{
    b.plan.rtoMinutes=61;
  },'RTO exceeds');
  bad('Write freeze cannot be bypassed by signed plan',b=>{
    b.plan.writeFreeze=false;
  },'write-freeze');
  bad('RPO must be explicit and bounded',b=>{
    b.plan.rpoMinutes=-1;
  },'recovery objective');
  bad('Evidence that claims production ready is forbidden',b=>{
    b.evidence.productionCutoverReady=true;
  });
  bad('A restore proof from another source cannot approve this source',b=>{
    b.evidence.originalSourceSha256='f'.repeat(64);
  });
  bad('Expiration cannot exceed 90-day signature validity cap',b=>{
    b.chain.records[0].attestation.expiresAt='2099-01-01T00:00:00Z';
  },'too distant');
  test('Trust anchor cannot be changed without independent SHA256 pin',()=>{
    assert.throws(()=>inspect({trustSha256:'0'.repeat(64)}),
      /out-of-band registry SHA256/);
  });
  const labels=['source','review','trust','signoffs','plan','evidence'];
  const paths=labels.map(x=>path.join(dir,x+'.json'));
  for(let i=0;i<labels.length;i++){
    fs.writeFileSync(paths[i],bundle[labels[i]],{mode:0o600});
  }
  const run=(args=labels.flatMap((x,i)=>['--'+x,paths[i]]),env={})=>
    spawnSync(process.execPath,['scripts/postgres/review_signoff_gate.mjs',...args],{
      encoding:'utf8',env:{...process.env,NODE_ENV:'staging',
        APEX_REVIEW_STAGING_ACK:'OFFLINE_ONLY_NEVER_CUTOVER',
        APEX_REVIEW_TRUST_SHA256:sha(trustBytes),...env}});
  const valid=run();
  test('CLI recognizes signatures but always returns BLOCKED exit 3',()=>{
    assert.equal(valid.status,3,valid.stderr);
    const report=JSON.parse(valid.stdout);
    assert.equal(report.productionCutoverReady,false);
    assert.equal(report.operatorRunAuthorized,false);
  });
  let invalid=run(undefined,{APEX_REVIEW_TRUST_SHA256:'0'.repeat(64)});
  test('CLI refuses unpinned or changed trust file',()=>assert.equal(invalid.status,1));
  invalid=run(undefined,{NODE_ENV:'production'});
  test('CLI cannot be used in production',()=>assert.equal(invalid.status,2));
  invalid=run(['--send']);
  test('CLI cannot enable delivery, restore or an approve action',()=>assert.equal(invalid.status,2));
  for(let i=0;i<labels.length;i++){
    assert.deepEqual(fs.readFileSync(paths[i]),bundle[labels[i]],labels[i]+' modified');
  }
  console.log('PHASE 10.5G REVIEW SIGNOFF '+passed+'/'+passed+' PASS');
}finally{
  fs.rmSync(dir,{recursive:true,force:true});
}
