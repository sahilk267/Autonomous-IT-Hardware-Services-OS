// Synthetic, private ephemerally signed Phase 10.5H fixture.
// Nothing here represents a real customer or real HR identity.
// Phase 10.5H -- ephemeral offline HR/security root claims and custody negatives.
// Generates only synthetic, non-identifying keys. No customer files or live identity.
import crypto from 'node:crypto';
import {roles,attestationBytes,recordHash} from '../../scripts/postgres/review_signoff_gate.mjs';
import {issuerRoles,artifacts,identityBytes,revocationBytes,custodyBytes} from '../../scripts/postgres/identity_custody_gate.mjs';

export function makePhaseJReviewFixture(){
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

return {baseline,source,sourceBytes,review,reviewBytes,evidenceBytes,rootsBytes,
  trustBytes,participants,authorities,operatorSourceTenant:source.tenant.id};
}
