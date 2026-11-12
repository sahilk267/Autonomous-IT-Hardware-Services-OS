#!/usr/bin/env node
// Phase 10.5G: offline Ed25519 reviewer chain / rehearsal preflight, NEVER cutover.
// All inputs private, immutable, independently pinned registry supplied out-of-band.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

export const roles=[
  'DATA_CUSTODIAN','SECURITY_REVIEWER','DBA_RESTORE_REVIEWER','RELEASE_MANAGER'
];
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
export const stable=v=>Array.isArray(v)?v.map(stable):
  v && typeof v==='object' && !Buffer.isBuffer(v)?
    Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
export const canonical=v=>JSON.stringify(stable(v));
export const attestationBytes=r=>Buffer.from(
  'APEX_OS_10_5G_REVIEW_ATTESTATION_V1\n'+canonical({
    sequence:r.sequence,prevSha256:r.prevSha256,
    role:r.role,keyId:r.keyId,attestation:r.attestation
  }), 'utf8');
export const recordHash=r=>sha(Buffer.from(canonical(r),'utf8'));
const strictKeys=(o,keys)=>{
  assert.ok(o && typeof o==='object' && !Array.isArray(o),'object required');
  assert.deepEqual(Object.keys(o).sort(),keys.slice().sort(),'unexpected/missing object fields');
};
const isHash=s=>typeof s==='string'&&/^[0-9a-f]{64}$/.test(s);
function privateInput(file){
  assert.ok(typeof file==='string'&&path.isAbsolute(file),'absolute private input required');
  const real=fs.realpathSync(file);
  const rel=path.relative(process.cwd(),real);
  assert.ok(rel!=='' && (rel==='..'||rel.startsWith('..'+path.sep)||
    path.isAbsolute(rel)),'source inside checkout rejected');
  const stat=fs.statSync(real);
  assert.ok(stat.isFile()&&stat.size<=25_000_000,'invalid input type/size');
  // No ACL assumption; this rejects world-readable review artifacts on POSIX.
  if(process.platform!=='win32')assert.equal(stat.mode & 0o007,0,'world-accessible private input');
  return {bytes:fs.readFileSync(real),real};
}
export function inspectBundle({source,review,trust,signoffs,plan,evidence,trustSha256}){
  const digests={source:sha(source),review:sha(review),trust:sha(trust),
    plan:sha(plan),evidence:sha(evidence)};
  assert.ok(isHash(trustSha256) && digests.trust===trustSha256,
    'out-of-band registry SHA256 pin does not match');
  const json=bytes=>JSON.parse(bytes.toString('utf8'));
  const src=json(source),mapping=json(review),registry=json(trust),
    chain=json(signoffs),operation=json(plan),proof=json(evidence);
  assert.ok(src?.tenant?.id && Array.isArray(src.customers),'source tenant missing');
  strictKeys(mapping,['tenantId','sourceSha256','decisions']);
  assert.equal(mapping.tenantId,src.tenant.id,'review tenant mismatch');
  assert.equal(mapping.sourceSha256,digests.source,'review source SHA mismatch');
  assert.ok(Array.isArray(mapping.decisions),'review decisions missing');
  const registered=new Set(src.customers.map(c=>c.id));
  assert.equal(registered.size,src.customers.length,'duplicate source customers');
  const legacy=[
    'invoices','marketplaceDisputes','knowledgeArticles','inventoryTransactions',
    'products','suppliers','rfqs','telegramMessages','licenses','providers',
    'workflows','connectors'
  ];
  const expected=new Set();
  for(const kind of legacy)for(const row of src[kind]||[]){
    const key=kind+'\0'+row.id;
    assert.ok(row.id && !expected.has(key),'duplicate source legacy ID');
    expected.add(key);
  }
  const seen=new Set();
  for(const d of mapping.decisions){
    strictKeys(d,['kind','id','disposition','customerId','evidenceSha256','reviewerRefs']);
    const key=d.kind+'\0'+d.id;
    assert.ok(expected.has(key)&&!seen.has(key),'missing/duplicate legacy review record');
    seen.add(key);
    assert.ok(isHash(d.evidenceSha256),'review evidence digest missing');
    assert.ok(Array.isArray(d.reviewerRefs)&&d.reviewerRefs.length===2 &&
      d.reviewerRefs[0]!==d.reviewerRefs[1] &&
      d.reviewerRefs.every(x=>typeof x==='string'&&x.length>=6),
      'distinct source record reviewers required');
    assert.ok(d.disposition==='RETAIN_OWNER_ONLY'&&d.customerId===null ||
      d.disposition==='PROPOSE_CUSTOMER'&&registered.has(d.customerId),
      'invalid customer disposition');
  }
  assert.equal(seen.size,expected.size,'incomplete historical ownership review');
  strictKeys(registry,['scope','keys']);
  assert.equal(registry.scope,'OFFLINE_REVIEW_ONLY','trusted scope must be offline review');
  assert.ok(Array.isArray(registry.keys)&&registry.keys.length===4,'four pinned independent public keys');
  const principals=new Set(),fingerprints=new Set(),ids=new Set(),trusted=new Map();
  for(let i=0;i<roles.length;i++){
    const x=registry.keys[i];
    strictKeys(x,['role','keyId','principal','publicKeyPem']);
    assert.equal(x.role,roles[i],'role registry order mismatch');
    assert.ok(typeof x.principal==='string'&&/^[A-Za-z0-9_.:-]{6,100}$/.test(x.principal),
      'invalid reviewer identity label');
    assert.ok(typeof x.keyId==='string'&&/^[A-Za-z0-9_.:-]{6,100}$/.test(x.keyId),
      'invalid reviewer key ID');
    assert.ok(!principals.has(x.principal)&&!ids.has(x.keyId),
      'separation of duties: repeated principal/key');
    const key=crypto.createPublicKey(x.publicKeyPem);
    assert.equal(key.asymmetricKeyType,'ed25519','review signers must use Ed25519');
    const fingerprint=sha(key.export({type:'spki',format:'der'}));
    assert.ok(!fingerprints.has(fingerprint),'duplicate public-key material across roles');
    ids.add(x.keyId);principals.add(x.principal);fingerprints.add(fingerprint);
    trusted.set(x.keyId,{role:x.role,key,fingerprint});
  }
  strictKeys(operation,['operation','sourceSha256','reviewSha256','restoreEvidenceSha256',
    'rpoMinutes','rtoMinutes','maximumDowntimeMinutes','windowStart',
    'windowEnd','writeFreeze','rollbackOwner','incidentOwner','rollbackTrigger']);
  assert.equal(operation.operation,'DISPOSABLE_REHEARSAL_REVIEW_ONLY');
  assert.equal(operation.sourceSha256,digests.source);
  assert.equal(operation.reviewSha256,digests.review);
  assert.equal(operation.restoreEvidenceSha256,digests.evidence);
  for(const f of ['rpoMinutes','rtoMinutes','maximumDowntimeMinutes'])
    assert.ok(Number.isInteger(operation[f])&&operation[f]>=0&&operation[f]<=1440,
      'explicit bounded recovery objective required: '+f);
  assert.ok(operation.rtoMinutes<=operation.maximumDowntimeMinutes,
    'RTO exceeds downtime target');
  const start=Date.parse(operation.windowStart),end=Date.parse(operation.windowEnd);
  assert.ok(Number.isFinite(start)&&Number.isFinite(end)&&end>start &&
    end-start<=86_400_000,'single bounded rehearsal window required');
  assert.equal(operation.writeFreeze,true,'write-freeze is mandatory');
  assert.ok(['rollbackOwner','incidentOwner','rollbackTrigger'].every(f=>
    typeof operation[f]==='string'&&operation[f].trim().length>=8),
    'operator/rollback responsibility missing');
  strictKeys(proof,['mode','verified','originalSourceSha256','sourceDatabaseSnapshotSha256',
    'schemaSha256','tableCount','forcedRlsTableCount','migrationMarkerCount',
    'sqlReadOnly','productionCutoverReady','restoreEqual','rollbackAcceptance',
    'noCustomerMigrationApplied','tableRecordCounts','importTenantKeySha256']);
  assert.equal(proof.mode,'INDEPENDENT_DISPOSABLE_RESTORE_REHEARSAL_EVIDENCE');
  assert.equal(proof.originalSourceSha256,digests.source,'restore provenance differs');
  assert.ok(proof.verified===true && proof.restoreEqual===true &&
    proof.productionCutoverReady===false && proof.sqlReadOnly===true &&
    proof.noCustomerMigrationApplied===true &&
    proof.rollbackAcceptance==='DISPOSABLE_REHEARSAL_ONLY' &&
    proof.tableCount===18 && proof.forcedRlsTableCount===16 &&
    proof.migrationMarkerCount===8 && isHash(proof.schemaSha256) &&
    isHash(proof.sourceDatabaseSnapshotSha256),
    'restore evidence not independently staged');
  assert.equal(proof.importTenantKeySha256,sha(src.tenant.id),
    'restore tenant source mismatch');
  strictKeys(chain,['records']);
  assert.ok(Array.isArray(chain.records)&&chain.records.length===4,'four ordered signatures required');
  const seenRoles=new Set(),signatureHashes=[];
  let previous='0'.repeat(64);
  for(let i=0;i<roles.length;i++){
    const r=chain.records[i];
    strictKeys(r,['sequence','prevSha256','role','keyId','attestation','signatureBase64']);
    assert.equal(r.sequence,i+1,'review chain sequence invalid');
    assert.equal(r.prevSha256,previous,'append-only chain predecessor drift');
    assert.equal(r.role,roles[i],'role ordering invalid');
    const match=trusted.get(r.keyId);
    assert.ok(match&&match.role===r.role,'untrusted/role-swapped reviewer');
    assert.ok(!seenRoles.has(r.role),'duplicate reviewer role');
    seenRoles.add(r.role);
    strictKeys(r.attestation,['sourceSha256','reviewSha256','planSha256',
      'restoreEvidenceSha256','decision','scope','expiresAt']);
    const a=r.attestation;
    assert.equal(a.sourceSha256,digests.source);
    assert.equal(a.reviewSha256,digests.review);
    assert.equal(a.planSha256,digests.plan);
    assert.equal(a.restoreEvidenceSha256,digests.evidence);
    assert.equal(a.decision,'REVIEWED_FOR_DISPOSABLE_REHEARSAL_ONLY');
    assert.equal(a.scope,'OFFLINE_NO_PRODUCTION_CUTOVER');
    assert.ok(Number.isFinite(Date.parse(a.expiresAt)) &&
      Date.parse(a.expiresAt)>Date.now() &&
      Date.parse(a.expiresAt)<=Date.now()+90*86400000,'review signature expired/too distant');
    assert.ok(typeof r.signatureBase64==='string' &&
      /^[A-Za-z0-9+/]{86}==$/.test(r.signatureBase64),'invalid signature encoding');
    const signature=Buffer.from(r.signatureBase64,'base64');
    assert.equal(signature.length,64,'invalid Ed25519 signature size');
    assert.ok(crypto.verify(null,attestationBytes(r),match.key,signature),
      'cryptographic reviewer signature verification failed');
    previous=recordHash(r);
    signatureHashes.push(sha(signature));
  }
  return {
    mode:'INDEPENDENT_OFFLINE_REVIEW_ATTESTATIONS',
    cryptographicReviewSignaturesValid:true,identityCustodyExternallyCertified:false,
    trustManifestSha256:digests.trust,sourceSha256:digests.source,
    reviewSha256:digests.review,planSha256:digests.plan,
    restoreEvidenceSha256:digests.evidence,chainTipSha256:previous,
    signedRoleCount:roles.length,coveredOwnerOnlyRecords:expected.size,
    recoveryObjectives:{rpoMinutes:operation.rpoMinutes,
      rtoMinutes:operation.rtoMinutes,
      maximumDowntimeMinutes:operation.maximumDowntimeMinutes},
    signatureDigests:signatureHashes,ownershipMigrationApplied:false,
    operatorRunAuthorized:false,productionCutoverReady:false,
    decision:'REVIEW_EVIDENCE_ONLY_CUTOVER_BLOCKED'
  };
}
if(process.argv[1] && path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)){
  const args=process.argv.slice(2),fields=['--source','--review','--trust','--signoffs','--plan','--evidence'];
  const env=process.env;
  if(args.length!==12 || fields.some((x,i)=>args[i*2]!==x) ||
    env.NODE_ENV==='production' || env.DATABASE_URL || env.APEX_PG_RUNTIME_ENABLED ||
    env.APEX_REVIEW_DEPLOY_ENABLED || env.APEX_PG_PILOT_ENABLED==='true' && env.APEX_PG_CRM_READ_THROUGH==='true' ||
    env.APEX_REVIEW_STAGING_ACK!=='OFFLINE_ONLY_NEVER_CUTOVER'){
    console.error('REVIEW SIGNOFF GATE REFUSED: offline signed evidence only');
    process.exit(2);
  }
  try{
    const paths=args.filter((_,i)=>i%2===1).map(privateInput);
    assert.equal(new Set(paths.map(x=>x.real)).size,paths.length,'inputs must be separate');
    const result=inspectBundle({
      source:paths[0].bytes,review:paths[1].bytes,trust:paths[2].bytes,
      signoffs:paths[3].bytes,plan:paths[4].bytes,evidence:paths[5].bytes,
      trustSha256:env.APEX_REVIEW_TRUST_SHA256
    });
    console.log(JSON.stringify(result));
    process.exitCode=3; // Valid attestations can NEVER approve production.
  }catch(error){
    console.error('REVIEW SIGNOFF GATE FAILED: '+error.message);
    process.exitCode=1;
  }
}
