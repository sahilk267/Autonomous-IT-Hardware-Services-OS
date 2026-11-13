#!/usr/bin/env node
// Phase 10.5J: cryptographically auditable private intake for a future
// authorized nonproduction rehearsal. NO external authority is inferred from
// self-supplied keys, signed claims, paths, synthetic CI or a passed review.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {stable} from './review_signoff_gate.mjs';
import {assessIdentityCustody} from './identity_custody_gate.mjs';
import {assessGovernedHandoff} from './governed_handoff_gate.mjs';

const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const canonical=o=>JSON.stringify(stable(o));
const exact=(o,expected)=>{
  assert.ok(o&&typeof o==='object'&&!Array.isArray(o),'expected strict object');
  assert.deepEqual(Object.keys(o).sort(),expected.slice().sort(),'unexpected/missing dossier keys');
};
const isHash=x=>typeof x==='string'&&/^[0-9a-f]{64}$/.test(x);
const assertHash=x=>assert.ok(isHash(x),'mandatory SHA256 digest malformed');
const validId=x=>typeof x==='string'&&/^[a-zA-Z0-9._:-]{6,96}$/.test(x);
const expires=(start,end,reference)=>{
  const a=Date.parse(start),b=Date.parse(end);
  assert.ok(Number.isFinite(a)&&Number.isFinite(b)&&a<=reference&&b>reference &&
    b>a&&b-a<=90*86400000,'outdated, future or unbounded authorization validity');
};
const day=86400000;
export const authorityRoles=[
  'EXTERNAL_PERSONNEL_IDENTITY_ISSUER','EXTERNAL_SECURITY_IDENTITY_ISSUER',
  'DATA_CONTROLLER_CUSTODIAN','PRIVACY_DATA_PROTECTION_OFFICER'
];
export const credentialBytes=claim=>Buffer.from(
  'APEX_10_5J_OPERATOR_IDENTITY_CREDENTIAL_V1\n'+canonical(claim));
export const releaseRevocationBytes=claim=>Buffer.from(
  'APEX_10_5J_REVOKED_OPERATOR_KEYS_V1\n'+canonical(claim));
export const authorizationBytes=claim=>Buffer.from(
  'APEX_10_5J_NONPRODUCTION_DATA_CUSTODY_V1\n'+canonical(claim));

function signerRegistry(roots,rootPin,other){
  assertHash(rootPin);
  assert.equal(sha(roots),rootPin,'external release authority registry not independently pinned');
  const o=JSON.parse(roots);
  exact(o,['scope','keys']);
  assert.equal(o.scope,'OFFLINE_EXTERNALLY_GOVERNED_RELEASE_AUTHORITIES');
  assert.ok(Array.isArray(o.keys)&&o.keys.length===4,'four distinct authority keys required');
  const ids=new Set(),principals=new Set(),fingerprints=new Set(other);
  const keys=o.keys.map((item,i)=>{
    exact(item,['role','keyId','principal','publicKeyPem']);
    assert.equal(item.role,authorityRoles[i],'wrong external authority role order');
    assert.ok(validId(item.keyId)&&validId(item.principal),'invalid authority identity reference');
    const key=crypto.createPublicKey(item.publicKeyPem);
    assert.equal(key.asymmetricKeyType,'ed25519','authority credentials must be Ed25519');
    const fp=sha(key.export({format:'der',type:'spki'}));
    assert.ok(!ids.has(item.keyId)&&!principals.has(item.principal)&&
      !fingerprints.has(fp),'external authority role/key separation violated');
    ids.add(item.keyId);principals.add(item.principal);fingerprints.add(fp);
    return {...item,key,fp};
  });
  return keys;
}
function verifySignedClaim(signatures,message,issuers){
  assert.ok(Array.isArray(signatures)&&signatures.length===issuers.length,
    'one distinct cryptographic signature per issuer required');
  for(let i=0;i<issuers.length;i++){
    const s=signatures[i],issuer=issuers[i];
    exact(s,['keyId','signatureBase64']);
    assert.equal(s.keyId,issuer.keyId,'signature issuer swapped or reused');
    assert.ok(typeof s.signatureBase64==='string' &&
      /^[A-Za-z0-9+/]{86}==$/.test(s.signatureBase64),
      'Ed25519 signature encoding invalid');
    const raw=Buffer.from(s.signatureBase64,'base64');
    assert.equal(raw.byteLength,64,'Ed25519 signature length invalid');
    assert.ok(crypto.verify(null,message,issuer.key,raw),
      'external authority signature does not match pinned key/claim');
  }
}
function allKeyFingerprints({reviewTrust,reviewRoots,operatorTrust}){
  const combined=[
    ...JSON.parse(reviewTrust).keys,
    ...JSON.parse(reviewRoots).issuers,
    ...JSON.parse(operatorTrust).keys
  ];
  const fingerprints=new Set();
  for(const k of combined){
    const fp=sha(crypto.createPublicKey(k.publicKeyPem).export({format:'der',type:'spki'}));
    assert.ok(!fingerprints.has(fp),'review/identity/operator key reused across trust domains');
    fingerprints.add(fp);
  }
  return fingerprints;
}
export function assessReleaseDossier({
  reviewPacket,operatorPacket,authorityRoots,authorityRootPin,
  operatorCredentials,custodyAuthorization
}){
  const {source,review,trust,signoffs,plan,evidence,roots,identities,revocations,custody,
    reviewerTrustPin,reviewerRootPin}=reviewPacket;
  const {operatorTrust,operatorPermit,operatorPlan,observations,archive,
    operatorTrustPin}=operatorPacket;
  // Re-run the cryptographic / read-only validators from Phase H and I.
  // Their results cannot be substituted with user-written JSON success claims.
  const humanReview=assessIdentityCustody({
    bundle:{source,review,trust,signoffs,plan,evidence,trustSha256:reviewerTrustPin},
    roots,rootPin:reviewerRootPin,identities,revocations,custody
  });
  const rehearsal=assessGovernedHandoff({
    trust:operatorTrust,permit:operatorPermit,plan:operatorPlan,
    observations,evidence,archive,trustPin:operatorTrustPin
  });
  const reviewObj=JSON.parse(review),sourceObj=JSON.parse(source),
    planObj=JSON.parse(operatorPlan),operatorRegistry=JSON.parse(operatorTrust);
  const provenance=JSON.parse(evidence),operatorReview=JSON.parse(operatorPermit);
  // Across both histories there must be EXACTLY one immutable customer source,
  // staging import and clone evidence. No copy/swap of a foreign tenant source.
  assert.equal(reviewObj.sourceSha256,sha(source),'legacy review is not this source');
  assert.equal(reviewObj.tenantId,sourceObj.tenant.id);
  assert.equal(planObj.sourceSha256,sha(source),'operator is reviewing a different source');
  assert.equal(planObj.evidenceSha256,sha(evidence),'operator and reviewer restore evidence differ');
  assert.equal(provenance.originalSourceSha256,sha(source));
  assert.equal(provenance.importTenantKeySha256,sha(sourceObj.tenant.id));
  assert.equal(rehearsal.reviewTicketKeySha256,
    operatorReview.records[0].attestation.reviewTicketSha256);
  assert.equal(humanReview.reviewSignatureChainValid,true);
  assert.equal(rehearsal.independentOperatorAndWitnessSignaturesValid,true);
  assert.equal(rehearsal.measuredRecoveryBudgetChecksPassed,true);
  const authorityKeys=signerRegistry(authorityRoots,authorityRootPin,
    allKeyFingerprints({reviewTrust:trust,reviewRoots:roots,operatorTrust}));
  const [personnel,security,controller,privacy]=authorityKeys;
  const credentialObj=JSON.parse(operatorCredentials);
  exact(credentialObj,['scope','revocations','certificates']);
  assert.equal(credentialObj.scope,'OFFLINE_OPERATOR_CREDENTIAL_INTAKE');
  const status=credentialObj.revocations;
  exact(status,['asOf','revokedKeySha256','signatures']);
  assert.ok(Number.isFinite(Date.parse(status.asOf))&&
    Date.parse(status.asOf)>=Date.now()-day &&
    Date.parse(status.asOf)<=Date.now()+60000,'operator key revocation status too old/future');
  assert.ok(Array.isArray(status.revokedKeySha256)&&
    status.revokedKeySha256.every(isHash)&&
    new Set(status.revokedKeySha256).size===status.revokedKeySha256.length,
    'operator key revocation list invalid');
  verifySignedClaim(status.signatures,releaseRevocationBytes({
    asOf:status.asOf,revokedKeySha256:status.revokedKeySha256
  }),[personnel,security]);
  const revoked=new Set(status.revokedKeySha256);
  const revocationSha256=sha(Buffer.from(canonical(status)));
  assert.ok(Array.isArray(credentialObj.certificates)&&
    credentialObj.certificates.length===2,'two independently credentialed operators required');
  const subjects=new Set(),idpSubjects=new Set();
  for(let i=0;i<2;i++){
    const c=credentialObj.certificates[i],key=operatorRegistry.keys[i];
    exact(c,['claim','signatures']);
    const v=c.claim;
    exact(v,['role','keyId','principal','publicKeySha256',
      'corporateSubjectSha256','idpAccountSha256','mfaAssertionSha256',
      'identityState','lastVerifiedAt','expiresAt','operatorPlanSha256',
      'revocationsSha256','authorityRootsSha256']);
    assert.equal(v.role,key.role,'operator role not identical to witness registry');
    assert.equal(v.keyId,key.keyId,'operator key ID differs from witness key');
    assert.equal(v.principal,key.principal,'operator principal differs from witness key');
    const fp=sha(crypto.createPublicKey(key.publicKeyPem).export({format:'der',type:'spki'}));
    assert.equal(v.publicKeySha256,fp,'operator identity bound to wrong signed key');
    assert.ok(!revoked.has(fp),'operator credentials revoked');
    for(const hash of ['corporateSubjectSha256','idpAccountSha256','mfaAssertionSha256'])
      assertHash(v[hash]);
    assert.ok(!subjects.has(v.corporateSubjectSha256)&&
      !idpSubjects.has(v.idpAccountSha256),'operator and witness share identity provider subject');
    subjects.add(v.corporateSubjectSha256);idpSubjects.add(v.idpAccountSha256);
    assert.equal(v.identityState,'ACTIVE_HARDWARE_MFA_CLAIM');
    assert.equal(v.operatorPlanSha256,sha(operatorPlan));
    assert.equal(v.revocationsSha256,revocationSha256);
    assert.equal(v.authorityRootsSha256,sha(authorityRoots));
    expires(v.lastVerifiedAt,v.expiresAt,Date.now());
    assert.ok(Date.parse(v.lastVerifiedAt)>=Date.now()-30*day,
      'operator identity assertion stale');
    // Credential vetting must PRECEDE the review's recorded rehearsal window.
    assert.ok(Date.parse(v.lastVerifiedAt)<=Date.parse(planObj.windowStart),
      'operator identity assertion made only after the rehearsal began');
    verifySignedClaim(c.signatures,credentialBytes(v),[personnel,security]);
  }
  const doc=JSON.parse(custodyAuthorization);
  exact(doc,['scope','claim','signatures']);
  assert.equal(doc.scope,'OFFLINE_NONPRODUCTION_DATA_PERMISSION');
  const a=doc.claim;
  exact(a,['dataClassification','permittedPurpose','sourceSha256','reviewSha256',
    'reviewerCustodySha256','operatorPermitSha256','operatorPlanSha256',
    'observationsSha256','restoreEvidenceSha256','archiveSha256',
    'operatorCredentialsSha256','releaseAuthoritySha256','tenantIdSha256',
    'approvalTicketSha256','lawfulProcessingBasisSha256','privacyImpactAssessmentSha256',
    'offsiteCustodyLocationSha256','keyCustodianRecordSha256','deletionPlanSha256',
    'retentionDays','encryptedCopyClaim','sourceDatabase','restoredDatabase',
    'totalLegacyRows','retainedOwnerOnlyRows','proposedCustomerRows',
    'customerRegistryCount','issuedAt','expiresAt']);
  assert.ok(['SYNTHETIC_TEST_DATA_ONLY','PSEUDONYMIZED_AUTHORIZED_NONPRODUCTION_CLAIM']
    .includes(a.dataClassification),'raw production customer-data dossier refused');
  assert.equal(a.permittedPurpose,'READ_ONLY_INDEPENDENT_RECOVERY_REHEARSAL');
  const digestFields={
    sourceSha256:source,reviewSha256:review,
    reviewerCustodySha256:custody,operatorPermitSha256:operatorPermit,
    operatorPlanSha256:operatorPlan,observationsSha256:observations,
    restoreEvidenceSha256:evidence,archiveSha256:archive,
    operatorCredentialsSha256:operatorCredentials,
    releaseAuthoritySha256:authorityRoots
  };
  for(const [name,bytes] of Object.entries(digestFields))
    assert.equal(a[name],sha(bytes),'custody authorisation source artifact mismatch: '+name);
  assert.equal(a.tenantIdSha256,sha(sourceObj.tenant.id));
  assert.equal(a.approvalTicketSha256,rehearsal.reviewTicketKeySha256,
    'custody ticket and recovery-witness ticket not identical');
  for(const field of ['lawfulProcessingBasisSha256','privacyImpactAssessmentSha256',
    'offsiteCustodyLocationSha256','keyCustodianRecordSha256','deletionPlanSha256'])
    assertHash(a[field]);
  assert.ok(Number.isInteger(a.retentionDays)&&a.retentionDays>=1 &&
    a.retentionDays<=30,'short fixed data retention required');
  if(a.dataClassification==='SYNTHETIC_TEST_DATA_ONLY')
    assert.equal(a.encryptedCopyClaim,'NO_REAL_CUSTOMER_DATA');
  else
    assert.equal(a.encryptedCopyClaim,'AES256_GCM_EXTERNAL_AT_REST_CLAIM_UNVERIFIED',
      'claiming authorized data requires encrypted custody assertion');
  assert.ok(['sourceDatabase','restoredDatabase'].every(f=>
    typeof a[f]==='string'&&/^apex_stage_[a-z0-9_]{2,60}$/.test(a[f])),
    'nonproduction-only local database names required');
  assert.ok(a.sourceDatabase!==a.restoredDatabase,'recovery clone must be separate from source');
  const legacy=[
    'invoices','marketplaceDisputes','knowledgeArticles','inventoryTransactions',
    'products','suppliers','rfqs','telegramMessages','licenses','providers',
    'workflows','connectors'
  ];
  const allRows=legacy.flatMap(kind=>(sourceObj[kind]||[]).map(x=>kind+'\0'+x.id));
  assert.equal(new Set(allRows).size,allRows.length,'legacy object IDs repeated in source');
  assert.equal(a.totalLegacyRows,allRows.length);
  assert.equal(a.totalLegacyRows,reviewObj.decisions.length,
    'custodian approved fewer decisions than legacy rows');
  assert.equal(a.retainedOwnerOnlyRows,
    reviewObj.decisions.filter(x=>x.disposition==='RETAIN_OWNER_ONLY').length);
  assert.equal(a.proposedCustomerRows,
    reviewObj.decisions.filter(x=>x.disposition==='PROPOSE_CUSTOMER').length);
  assert.equal(a.retainedOwnerOnlyRows+a.proposedCustomerRows,a.totalLegacyRows);
  assert.equal(a.customerRegistryCount,sourceObj.customers.length);
  expires(a.issuedAt,a.expiresAt,Date.now());
  assert.ok(Date.parse(a.issuedAt)<=Date.parse(planObj.windowStart),
    'data controller permission was not signed prior to rehearsal start');
  assert.ok(Date.parse(a.expiresAt)>=Date.parse(planObj.windowEnd),
    'data controller permission expires before rehearsal window end');
  verifySignedClaim(doc.signatures,authorizationBytes(a),[controller,privacy]);
  return {
    mode:'PHASE_10_5J_CRYPTOGRAPHIC_RELEASE_ACCEPTANCE_DOSSIER',
    sourceSha256:sha(source),reviewSha256:sha(review),
    authorityRootSha256:sha(authorityRoots),
    signedReviewerRoles:4,credentialedOperatorRoles:2,
    independentDataCustodians:2,legacyRowsCovered:allRows.length,
    explicitlyRetainedOwnerOnlyRows:a.retainedOwnerOnlyRows,
    proposedCustomerAssignmentsNotApplied:a.proposedCustomerRows,
    customerRegistryCount:a.customerRegistryCount,
    sourceAndRehearsalSha256Match:true,operatorCredentialSignaturesValid:true,
    custodyAuthorizationSignaturesValid:true,
    signedOperatorRecoveryHandoffVerified:true,
    rehearsalMetricsInSyntheticFixtureOnly:rehearsal.measuredCloneRecoveryMs,
    realHumanIdentityProviderQueried:false,
    claimedLegalAuthorityIndependentlyConfirmed:false,
    encryptionAtRestIndependentlyVerified:false,
    externalCustodyAndRetentionEnforced:false,
    authorizedCustomerDataRehearsalActuallyPerformed:false,
    independentExternalWitnessObservedLiveRun:false,
    historicalCustomerMappingsApplied:false,
    productionCutoverReady:false,
    decision:'EXTERNAL_GOVERNANCE_INTAKE_CRYPTO_VALID_PRODUCTION_BLOCKED'
  };
}
export const dossierFiles=[
  'source','review','trust','signoffs','reviewPlan','evidence',
  'reviewRoots','identities','revocations','reviewCustody',
  'operatorTrust','operatorPermit','operatorPlan','observations','archive',
  'authorityRoots','operatorCredentials','custodyAuthorization'
];
function privateFile(name,maxSize=25_000_000){
  assert.ok(typeof name==='string'&&path.isAbsolute(name),
    'private dossier file path must be absolute');
  const from=path.resolve(name),root=path.resolve(process.cwd());
  const forbidden=p=>{const d=path.relative(root,p);return d===''||
    (!d.startsWith('..'+path.sep)&&d!=='..'&&!path.isAbsolute(d));};
  assert.ok(!forbidden(from),'files inside checkout are forbidden');
  const real=fs.realpathSync(from);
  assert.ok(!forbidden(real),'symlink resolving into checkout is forbidden');
  const stat=fs.statSync(real);
  assert.ok(stat.isFile()&&stat.size>0&&stat.size<=maxSize,'evidence file size/type invalid');
  if(process.platform!=='win32'){
    assert.equal(stat.mode&0o077,0,'sensitive evidence must have 0600 or stricter permissions');
    if(typeof process.getuid==='function')
      assert.equal(stat.uid,process.getuid(),'evidence must be owned by current operator');
  }
  return {real,bytes:fs.readFileSync(real)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),e=process.env;
  if(args.length!==dossierFiles.length*2 ||
    dossierFiles.some((v,i)=>args[2*i]!=='--'+v) ||
    e.NODE_ENV==='production'||e.DATABASE_URL||e.APEX_PG_RUNTIME_ENABLED ||
    e.APEX_PG_PILOT_ENABLED==='true'||e.APEX_REVIEW_DEPLOY_ENABLED ||
    e.APEX_RELEASE_DOSSIER_ACK!=='OFFLINE_PRIVATE_GOVERNANCE_PREPARATION_ONLY'){
    console.error('RELEASE DOSSIER REFUSED: private offline NONPRODUCTION intake only');
    process.exit(2);
  }
  try{
    const loaded=dossierFiles.map((v,i)=>privateFile(
      args[2*i+1],v==='archive'?500_000_000:25_000_000));
    assert.equal(new Set(loaded.map(x=>x.real)).size,loaded.length,
      'dossier evidence paths must all be distinct');
    const o=Object.fromEntries(dossierFiles.map((name,i)=>[name,loaded[i].bytes]));
    const report=assessReleaseDossier({
      reviewPacket:{
        source:o.source,review:o.review,trust:o.trust,signoffs:o.signoffs,
        plan:o.reviewPlan,evidence:o.evidence,roots:o.reviewRoots,
        identities:o.identities,revocations:o.revocations,custody:o.reviewCustody,
        reviewerTrustPin:e.APEX_REVIEW_TRUST_SHA256,
        reviewerRootPin:e.APEX_REVIEW_IDENTITY_ROOT_SHA256
      },
      operatorPacket:{
        operatorTrust:o.operatorTrust,operatorPermit:o.operatorPermit,
        operatorPlan:o.operatorPlan,observations:o.observations,
        archive:o.archive,operatorTrustPin:e.APEX_OPERATOR_TRUST_SHA256
      },
      authorityRoots:o.authorityRoots,authorityRootPin:e.APEX_RELEASE_AUTHORITY_ROOT_SHA256,
      operatorCredentials:o.operatorCredentials,custodyAuthorization:o.custodyAuthorization
    });
    for(const item of loaded)
      assert.equal(sha(fs.readFileSync(item.real)),sha(item.bytes),
        'dossier file modified while verifying');
    console.log(JSON.stringify(report));
    process.exitCode=3; // A valid dossier NEVER unlocks cutover.
  }catch(error){
    console.error('RELEASE DOSSIER INVALID: '+error.message);
    process.exitCode=1;
  }
}
