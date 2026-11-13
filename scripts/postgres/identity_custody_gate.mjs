#!/usr/bin/env node
// Phase 10.5H: offline multi-issuer reviewer identity + evidence-custody chain.
// Verifies signed issuer claims against independently pinned roots; it cannot
// validate a real person's HR record, issue credentials or authorize migration.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {inspectBundle,stable,roles,recordHash}
  from './review_signoff_gate.mjs';
export const artifacts=['source','review','trust','signoffs','plan','evidence','identities','revocations'];
export const issuerRoles=['PERSONNEL_OFFICER','SECURITY_COMPLIANCE_OFFICER'];
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const canonical=x=>JSON.stringify(stable(x));
const hex=x=>typeof x==='string'&&/^[0-9a-f]{64}$/.test(x);
const sig64=x=>typeof x==='string' && /^[A-Za-z0-9+/]{86}==$/.test(x);
const keys=(obj,required)=>{
  assert.ok(obj && typeof obj==='object'&&!Array.isArray(obj),'expected object');
  assert.deepEqual(Object.keys(obj).sort(),required.slice().sort(),'object fields not exact');
};
const day=86400000;
const validTime=(s,minimum,maximum)=>{
  const n=Date.parse(s);
  assert.ok(typeof s==='string'&&Number.isFinite(n)&&n>=minimum&&n<=maximum,
    'invalid/expired/future identity or custody timestamp');
};
export const identityBytes=(claim)=>Buffer.from(
  'APEX_10_5H_REVIEWER_IDENTITY_V1\n'+canonical(claim),'utf8');
export const revocationBytes=(status)=>Buffer.from(
  'APEX_10_5H_REVOKED_KEYS_V1\n'+canonical(status),'utf8');
export const custodyBytes=(receipt)=>Buffer.from(
  'APEX_10_5H_CUSTODY_RECEIPT_V1\n'+canonical(receipt),'utf8');
function verifyTwoSignatures(signatures,bytes,issuers){
  assert.ok(Array.isArray(signatures)&&signatures.length===2,
    'two distinct independent issuer attestations required');
  for(let i=0;i<2;i++){
    const s=signatures[i];
    keys(s,['issuerKeyId','signatureBase64']);
    assert.equal(s.issuerKeyId,issuers[i].keyId,'wrong issuer or reordered signatures');
    assert.ok(sig64(s.signatureBase64),'invalid issuer signature encoding');
    assert.ok(crypto.verify(null,bytes,issuers[i].key,
      Buffer.from(s.signatureBase64,'base64')),'invalid independent issuer signature');
  }
}
export function assessIdentityCustody({bundle,roots,rootPin,identities,revocations,custody}){
  const approved=inspectBundle(bundle);
  assert.ok(hex(rootPin)&&sha(roots)===rootPin,'independent issuer roots SHA256 pin invalid');
  const parse=x=>JSON.parse(x.toString('utf8'));
  const root=parse(roots),registry=parse(bundle.trust);
  const identity=parse(identities),status=parse(revocations),receipts=parse(custody);
  keys(root,['scope','issuers']);
  assert.equal(root.scope,'OFFLINE_INDEPENDENT_ISSUER_CLAIMS');
  assert.ok(Array.isArray(root.issuers)&&root.issuers.length===2,
    'two external issuer public keys required');
  const issuers=root.issuers.map((x,i)=>{
    keys(x,['role','keyId','principal','publicKeyPem']);
    assert.equal(x.role,issuerRoles[i],'issuer role order invalid');
    assert.ok(typeof x.principal==='string'&&/^[A-Za-z0-9._:-]{6,96}$/.test(x.principal));
    assert.ok(typeof x.keyId==='string'&&/^[A-Za-z0-9._:-]{6,96}$/.test(x.keyId));
    const key=crypto.createPublicKey(x.publicKeyPem);
    assert.equal(key.asymmetricKeyType,'ed25519');
    return {...x,key,fingerprint:sha(key.export({type:'spki',format:'der'}))};
  });
  assert.ok(issuers[0].principal!==issuers[1].principal &&
    issuers[0].keyId!==issuers[1].keyId &&
    issuers[0].fingerprint!==issuers[1].fingerprint,
    'identity issuers must have distinct custody and key material');
  const trustKeys=registry.keys;
  for(const x of trustKeys){
    const fingerprint=sha(crypto.createPublicKey(x.publicKeyPem)
      .export({type:'spki',format:'der'}));
    assert.ok(issuers.every(z=>z.principal!==x.principal&&
      z.keyId!==x.keyId&&z.fingerprint!==fingerprint),
      'reviewer cannot also certify own identity');
  }
  const now=Date.now();
  keys(status,['asOf','revokedPublicKeySha256','signatures']);
  validTime(status.asOf,now-day,now+60000);
  assert.ok(Array.isArray(status.revokedPublicKeySha256)&&
    status.revokedPublicKeySha256.every(hex) &&
    new Set(status.revokedPublicKeySha256).size===status.revokedPublicKeySha256.length,
    'revoked-key status malformed');
  verifyTwoSignatures(status.signatures,revocationBytes({
    asOf:status.asOf,revokedPublicKeySha256:status.revokedPublicKeySha256
  }),issuers);
  const revoked=new Set(status.revokedPublicKeySha256);
  keys(identity,['registrySha256','revocationsSha256','certificates']);
  assert.equal(identity.registrySha256,sha(bundle.trust),'identity binds wrong reviewer registry');
  assert.equal(identity.revocationsSha256,sha(revocations),'identity stale revocation snapshot');
  assert.ok(Array.isArray(identity.certificates)&&identity.certificates.length===roles.length,
    'every reviewer needs independent identity claims');
  const staffIdentities=new Set();
  for(let i=0;i<roles.length;i++){
    const cert=identity.certificates[i],known=trustKeys[i];
    keys(cert,['claim','signatures']);
    const v=cert.claim;
    keys(v,['role','keyId','principal','publicKeySha256','organizationIdSha256',
      'identityState','verifiedAt','expiresAt','registrySha256','revocationsSha256']);
    assert.equal(v.role,roles[i],'reviewer role mismatch');
    assert.equal(v.keyId,known.keyId,'reviewer key ID mismatch');
    assert.equal(v.principal,known.principal,'reviewer identity name mismatch');
    const fingerprint=sha(crypto.createPublicKey(known.publicKeyPem)
      .export({type:'spki',format:'der'}));
    assert.equal(v.publicKeySha256,fingerprint,'reviewer certified wrong key');
    assert.ok(!revoked.has(fingerprint),'reviewer key revoked');
    assert.equal(v.registrySha256,identity.registrySha256);
    assert.equal(v.revocationsSha256,identity.revocationsSha256);
    assert.equal(v.identityState,'ACTIVE','retired/suspended reviewer');
    assert.ok(hex(v.organizationIdSha256)&&!staffIdentities.has(v.organizationIdSha256),
      'duplicate/missing external organizational subject');
    staffIdentities.add(v.organizationIdSha256);
    validTime(v.verifiedAt,now-30*day,now+60000);
    validTime(v.expiresAt,now+1,now+90*day);
    assert.ok(Date.parse(v.expiresAt)>Date.parse(v.verifiedAt));
    verifyTwoSignatures(cert.signatures,identityBytes(v),issuers);
  }
  keys(receipts,['scope','entries']);
  assert.equal(receipts.scope,'OFFLINE_PRIVATE_EVIDENCE_CUSTODY');
  assert.ok(Array.isArray(receipts.entries)&&receipts.entries.length===artifacts.length,
    'every artifact needs a witnessed signed receipt');
  let prev='0'.repeat(64);
  for(let i=0;i<artifacts.length;i++){
    const entry=receipts.entries[i];
    keys(entry,['claim','signatures']);
    const v=entry.claim;
    keys(v,['sequence','artifact','artifactSha256','observedAt',
      'prevReceiptSha256','classification']);
    assert.equal(v.sequence,i+1,'custody sequence out of order');
    assert.equal(v.artifact,artifacts[i],'custody artifact order invalid');
    assert.equal(v.artifactSha256,sha(
      i<6?bundle[artifacts[i]]:i===6?identities:revocations),
      'custody artifact changed since signed receipt');
    assert.equal(v.prevReceiptSha256,prev,'custody receipt gap or rewrite');
    assert.equal(v.classification,'PRIVATE_RESTRICTED_REVIEW_ONLY');
    validTime(v.observedAt,now-30*day,now+60000);
    verifyTwoSignatures(entry.signatures,custodyBytes(v),issuers);
    prev=recordHash(entry);
  }
  return {
    mode:'OFFLINE_INDEPENDENT_ISSUER_AND_CUSTODY_EVIDENCE',
    reviewSignatureChainValid:approved.cryptographicReviewSignaturesValid,
    issuerClaimsCryptographicallyVerified:true,
    currentSignedRevocationSnapshotVerified:true,
    reviewerCount:roles.length,evidenceCustodyReceipts:artifacts.length,
    rootPinSha256:sha(roots),reviewChainTipSha256:approved.chainTipSha256,
    custodyChainTipSha256:prev,
    realWorldEmploymentAndAuthorityExternallyConfirmed:false,
    operatorRehearsalExecuted:false,customerMigrationApplied:false,
    productionCutoverReady:false,decision:'EVIDENCE_CRYPTO_VERIFIED_CUTOVER_BLOCKED'
  };
}
function privateFile(v){
  assert.ok(v&&path.isAbsolute(v),'absolute private evidence file required');
  const real=fs.realpathSync(v),rel=path.relative(process.cwd(),real);
  assert.ok(rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel),
    'repository evidence path forbidden');
  const stat=fs.statSync(real);
  assert.ok(stat.isFile()&&stat.size<=25_000_000,'evidence file type/size rejected');
  if(process.platform!=='win32')assert.equal(stat.mode&0o007,0,'world-accessible evidence');
  return {name:real,bytes:fs.readFileSync(real)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const argv=process.argv.slice(2),names=[
    ...artifacts.slice(0,6),'roots','identities','revocations','custody'];
  if(process.env.NODE_ENV==='production'||process.env.DATABASE_URL||
    process.env.APEX_PG_RUNTIME_ENABLED || process.env.APEX_PG_PILOT_ENABLED==='true' ||
    process.env.APEX_REVIEW_IDENTITY_ACK!=='OFFLINE_CUSTODY_ONLY_NO_CUTOVER' ||
    argv.length!==names.length*2 ||
    names.some((name,i)=>argv[2*i]!=='--'+name)){
    console.error('CUSTODY REVIEW REFUSED: explicitly pinned offline private evidence only');
    process.exit(2);
  }
  try{
    const inputs=names.map((name,i)=>privateFile(argv[2*i+1]));
    assert.equal(new Set(inputs.map(x=>x.name)).size,inputs.length,
      'custody inputs must be separate');
    const obj=Object.fromEntries(names.map((name,i)=>[name,inputs[i].bytes]));
    const result=assessIdentityCustody({
      bundle:{source:obj.source,review:obj.review,trust:obj.trust,
        signoffs:obj.signoffs,plan:obj.plan,evidence:obj.evidence,
        trustSha256:process.env.APEX_REVIEW_TRUST_SHA256},
      roots:obj.roots,rootPin:process.env.APEX_REVIEW_IDENTITY_ROOT_SHA256,
      identities:obj.identities,revocations:obj.revocations,custody:obj.custody
    });
    for(let i=0;i<inputs.length;i++){
      assert.equal(sha(fs.readFileSync(inputs[i].name)),sha(inputs[i].bytes),
        'artifact changed during audit');
    }
    console.log(JSON.stringify(result));
    process.exitCode=3;
  }catch(error){
    console.error('CUSTODY REVIEW FAILED: '+error.message);
    process.exitCode=1;
  }
}
