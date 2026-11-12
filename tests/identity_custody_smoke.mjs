// Phase 10.5H -- ephemeral offline HR/security root claims and custody negatives.
// Generates only synthetic, non-identifying keys. No customer files or live identity.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {roles,attestationBytes,recordHash} from '../scripts/postgres/review_signoff_gate.mjs';
import {assessIdentityCustody,issuerRoles,artifacts,identityBytes,revocationBytes,
  custodyBytes} from '../scripts/postgres/identity_custody_gate.mjs';
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const now=Date.now(),observedAt=new Date(now-3600000).toISOString(),
  expiresAt=new Date(now+14*86400000).toISOString();
const buf=x=>Buffer.from(JSON.stringify(x));
const participants=roles.map((role,i)=>{
  const pair=crypto.generateKeyPairSync('ed25519');
  return {role,keyId:'phase-h-reviewer-'+i,principal:'phase-h-identity-'+i,
    privateKey:pair.privateKey,
    publicKeyPem:pair.publicKey.export({format:'pem',type:'spki'}),
    organizationIdSha256:sha('synthetic-organizational-person-'+i)};
});
const authorities=issuerRoles.map((role,i)=>{
  const pair=crypto.generateKeyPairSync('ed25519');
  return {role,keyId:'phase-h-issuer-'+i,principal:'offline-fixture-issuer-'+i,
    privateKey:pair.privateKey,
    publicKeyPem:pair.publicKey.export({format:'pem',type:'spki'})};
});
const sigs=(bytes)=>authorities.map(a=>({issuerKeyId:a.keyId,
  signatureBase64:crypto.sign(null,bytes,a.privateKey).toString('base64')}));
const source={tenant:{id:'synthetic-h-tenant'},customers:[{id:'customer-h-only'}],
  invoices:[{id:'invoice-h-legacy'}]};
const sourceBytes=buf(source);
const review={tenantId:source.tenant.id,sourceSha256:sha(sourceBytes),
  decisions:[{kind:'invoices',id:'invoice-h-legacy',customerId:null,
    disposition:'RETAIN_OWNER_ONLY',evidenceSha256:sha('signed offline evidence'),
    reviewerRefs:['fixture-owner-identity','fixture-security-identity']}]};
const reviewBytes=buf(review);
const trust={scope:'OFFLINE_REVIEW_ONLY',keys:participants.map(p=>({
  role:p.role,keyId:p.keyId,principal:p.principal,publicKeyPem:p.publicKeyPem
}))};
const trustBytes=buf(trust);
const evidence={mode:'INDEPENDENT_DISPOSABLE_RESTORE_REHEARSAL_EVIDENCE',
  verified:true,originalSourceSha256:sha(sourceBytes),
  sourceDatabaseSnapshotSha256:'a'.repeat(64),schemaSha256:'b'.repeat(64),
  tableCount:18,forcedRlsTableCount:16,migrationMarkerCount:8,
  sqlReadOnly:true,productionCutoverReady:false,restoreEqual:true,
  rollbackAcceptance:'DISPOSABLE_REHEARSAL_ONLY',
  noCustomerMigrationApplied:true,tableRecordCounts:{invoices:1},
  importTenantKeySha256:sha(source.tenant.id)};
const evidenceBytes=buf(evidence);
const plan={operation:'DISPOSABLE_REHEARSAL_REVIEW_ONLY',sourceSha256:sha(sourceBytes),
  reviewSha256:sha(reviewBytes),restoreEvidenceSha256:sha(evidenceBytes),
  rpoMinutes:15,rtoMinutes:45,maximumDowntimeMinutes:60,
  windowStart:'2027-01-05T00:00:00Z',windowEnd:'2027-01-05T02:00:00Z',
  writeFreeze:true,rollbackOwner:'synthetic-rollback-owner',
  incidentOwner:'synthetic-incident-owner',
  rollbackTrigger:'Any restored clone record or RLS mismatch'};
const planBytes=buf(plan);
let previous='0'.repeat(64);
const signedRecords=participants.map((p,i)=>{
  const a={sourceSha256:sha(sourceBytes),reviewSha256:sha(reviewBytes),
    planSha256:sha(planBytes),restoreEvidenceSha256:sha(evidenceBytes),
    decision:'REVIEWED_FOR_DISPOSABLE_REHEARSAL_ONLY',
    scope:'OFFLINE_NO_PRODUCTION_CUTOVER',expiresAt};
  const r={sequence:i+1,prevSha256:previous,role:p.role,keyId:p.keyId,
    attestation:a,signatureBase64:''};
  r.signatureBase64=crypto.sign(null,attestationBytes(r),p.privateKey).toString('base64');
  previous=recordHash(r);
  return r;
});
const signoffsBytes=buf({records:signedRecords});
const roots={scope:'OFFLINE_INDEPENDENT_ISSUER_CLAIMS',
  issuers:authorities.map(x=>({role:x.role,keyId:x.keyId,principal:x.principal,
    publicKeyPem:x.publicKeyPem}))};
const rootsBytes=buf(roots);
const revocations={asOf:observedAt,revokedPublicKeySha256:[]};
revocations.signatures=sigs(revocationBytes({...revocations}));
const revocationsBytes=buf(revocations);
const identities={registrySha256:sha(trustBytes),
  revocationsSha256:sha(revocationsBytes),certificates:participants.map(p=>{
    const claim={role:p.role,keyId:p.keyId,principal:p.principal,
      publicKeySha256:sha(crypto.createPublicKey(p.publicKeyPem)
        .export({type:'spki',format:'der'})),
      organizationIdSha256:p.organizationIdSha256,
      identityState:'ACTIVE',verifiedAt:observedAt,expiresAt,
      registrySha256:sha(trustBytes),revocationsSha256:sha(revocationsBytes)};
    return {claim,signatures:sigs(identityBytes(claim))};
  })};
const identitiesBytes=buf(identities);
const bundle={source:sourceBytes,review:reviewBytes,trust:trustBytes,
  signoffs:signoffsBytes,plan:planBytes,evidence:evidenceBytes,
  trustSha256:sha(trustBytes)};
const evidenceFiles={...bundle,identities:identitiesBytes,revocations:revocationsBytes};
const custody={scope:'OFFLINE_PRIVATE_EVIDENCE_CUSTODY',entries:[]};
previous='0'.repeat(64);
for(let i=0;i<artifacts.length;i++){
  const artifact=artifacts[i];
  const claim={sequence:i+1,artifact,artifactSha256:sha(evidenceFiles[artifact]),
    observedAt,prevReceiptSha256:previous,
    classification:'PRIVATE_RESTRICTED_REVIEW_ONLY'};
  const entry={claim,signatures:sigs(custodyBytes(claim))};
  custody.entries.push(entry);
  previous=recordHash(entry);
}
const custodyBytesJSON=buf(custody);
const baseline={bundle,roots:rootsBytes,rootPin:sha(rootsBytes),
  identities:identitiesBytes,revocations:revocationsBytes,custody:custodyBytesJSON};
let passed=0;
const test=(name,fn)=>{fn();passed++;console.log('PASS '+name);};
function mutateJson(label,change){
  const edited=JSON.parse(baseline[label].toString('utf8'));change(edited);
  return {...baseline,[label]:buf(edited)};
}
const negative=(name,changes)=>{
  test(name,()=>assert.throws(()=>assessIdentityCustody(changes)));
};
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'apex-custody-'));
try{
  const report=assessIdentityCustody(baseline);
  test('Two independently pinned issuer claims validate all four distinct reviewer roles',()=>{
    assert.equal(report.reviewerCount,4);
    assert.equal(report.evidenceCustodyReceipts,8);
    assert.equal(report.issuerClaimsCryptographicallyVerified,true);
    assert.equal(report.currentSignedRevocationSnapshotVerified,true);
    assert.equal(report.realWorldEmploymentAndAuthorityExternallyConfirmed,false);
    assert.equal(report.operatorRehearsalExecuted,false);
    assert.equal(report.productionCutoverReady,false);
  });
  negative('Forged root registry without independently changed pin is rejected',
    mutateJson('roots',x=>{x.issuers[0].principal='forged-issuer';}));
  negative('Self-signing reviewer cannot also be an external authority',(()=>{
    const edited=JSON.parse(baseline.roots);
    edited.issuers[0].keyId=participants[0].keyId;
    edited.issuers[0].principal=participants[0].principal;
    edited.issuers[0].publicKeyPem=participants[0].publicKeyPem;
    return {...baseline,roots:buf(edited),rootPin:sha(buf(edited))};
  })());
  negative('Identity role mismatch rejects signed record',
    mutateJson('identities',x=>{x.certificates[1].claim.role='BUSINESS_OWNER';}));
  negative('Suspended employee identity cannot pass even with valid original signatures',
    mutateJson('identities',x=>{x.certificates[1].claim.identityState='SUSPENDED';}));
  negative('Duplicate real-world subject cannot occupy two review roles',
    mutateJson('identities',x=>{x.certificates[1].claim.organizationIdSha256=
      x.certificates[0].claim.organizationIdSha256;}));
  negative('Replaced review public key invalidates independent identity attestation',
    mutateJson('identities',x=>{x.certificates[2].claim.publicKeySha256='f'.repeat(64);}));
  negative('Revocation snapshot tampering invalidates two issuer signatures',
    mutateJson('revocations',x=>{x.revokedPublicKeySha256=['a'.repeat(64)];}));
  negative('Issuer attestation signature corruption is rejected',
    mutateJson('identities',x=>{x.certificates[0].signatures[0].signatureBase64='A'.repeat(86)+'==';}));
  negative('Custody missing a single artifact is rejected',
    mutateJson('custody',x=>{x.entries.pop();}));
  negative('Custody chain predecessor cannot be rewritten',
    mutateJson('custody',x=>{x.entries[3].claim.prevReceiptSha256='c'.repeat(64);}));
  negative('Custody artifact digest mismatch is detected',
    mutateJson('custody',x=>{x.entries[5].claim.artifactSha256='d'.repeat(64);}));
  negative('Custody issuer signature corruption is rejected',
    mutateJson('custody',x=>{x.entries[0].signatures[0].signatureBase64='A'.repeat(86)+'==';}));
  const names=[...artifacts.slice(0,6),'roots','identities','revocations','custody'];
  const input={source:sourceBytes,review:reviewBytes,trust:trustBytes,
    signoffs:signoffsBytes,plan:planBytes,evidence:evidenceBytes,roots:rootsBytes,
    identities:identitiesBytes,revocations:revocationsBytes,custody:custodyBytesJSON};
  const args=[];
  for(const name of names){
    const file=path.join(temp,name+'.json');
    fs.writeFileSync(file,input[name],{mode:0o600});
    args.push('--'+name,file);
  }
  const run=(env={},suffix=[])=>spawnSync(process.execPath,
    ['scripts/postgres/identity_custody_gate.mjs',...args,...suffix],{
    encoding:'utf8',env:{...process.env,NODE_ENV:'staging',
      APEX_REVIEW_IDENTITY_ACK:'OFFLINE_CUSTODY_ONLY_NO_CUTOVER',
      APEX_REVIEW_IDENTITY_ROOT_SHA256:sha(rootsBytes),
      APEX_REVIEW_TRUST_SHA256:sha(trustBytes),...env}
  });
  let result=run();
  test('CLI confirms cryptographic custody but always exits BLOCKED 3',()=>{
    assert.equal(result.status,3,result.stderr);
    assert.equal(JSON.parse(result.stdout).productionCutoverReady,false);
  });
  result=run({APEX_REVIEW_IDENTITY_ROOT_SHA256:'f'.repeat(64)});
  test('Identity authority key cannot be swapped without out-of-band pin',()=>{
    assert.equal(result.status,1);
  });
  result=run({NODE_ENV:'production'});
  test('Real production environment explicitly refused',()=>assert.equal(result.status,2));
  result=run({APEX_PG_PILOT_ENABLED:'true'});
  test('Active SQL pilot environment explicitly refused',()=>assert.equal(result.status,2));
  result=run({},['--approve']);
  test('CLI has no approval or mutation action',()=>assert.equal(result.status,2));
  console.log('PHASE 10.5H IDENTITY CUSTODY SUMMARY '+passed+'/'+passed+' PASS');
}finally{
  fs.rmSync(temp,{recursive:true,force:true});
}
