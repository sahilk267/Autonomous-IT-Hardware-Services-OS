// Phase 10.5J synthetic acceptance. Four ephemeral institutional signers,
// two independently credentialed operators, full 10.5H reviewer/custody chain,
// and the 10.5I signed recovery packet bound to ONE immutable source.
// This NEVER creates actual HR credentials, customer data or release authority.
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {makePhaseJReviewFixture} from './fixtures/phase_j_review_fixture.mjs';
import {makePhaseJOperatorFixture} from './fixtures/phase_j_operator_fixture.mjs';
import {attestationBytes,recordHash,stable} from '../scripts/postgres/review_signoff_gate.mjs';
import {custodyBytes,artifacts} from '../scripts/postgres/identity_custody_gate.mjs';
import {assessReleaseDossier,dossierFiles,authorityRoles,credentialBytes,
  releaseRevocationBytes,authorizationBytes}
  from '../scripts/postgres/release_dossier_gate.mjs';

const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),
  json=x=>Buffer.from(JSON.stringify(x)),clone=x=>JSON.parse(JSON.stringify(x)),
  canonical=x=>JSON.stringify(stable(x));
const reviewer=makePhaseJReviewFixture();
const operator=makePhaseJOperatorFixture(reviewer);
const r=reviewer.baseline;
const trust=operator.trustBytes;
const reviewed={
  ...r.bundle,roots:r.roots,identities:r.identities,revocations:r.revocations,
  custody:r.custody,reviewerTrustPin:r.bundle.trustSha256,reviewerRootPin:r.rootPin
};
delete reviewed.trustSha256;
const operated={
  operatorTrust:operator.trustBytes,operatorPermit:operator.permitBytes,
  operatorPlan:operator.planBytes,observations:operator.observedBytes,
  archive:operator.archive,operatorTrustPin:hash(operator.trustBytes)
};
const keys=authorityRoles.map((role,i)=>{
  const pair=crypto.generateKeyPairSync('ed25519');
  return {role,keyId:'phase-j-authority-'+i,principal:'external-fixture-authority-'+i,
    publicKeyPem:pair.publicKey.export({format:'pem',type:'spki'}),privateKey:pair.privateKey};
});
const roots={scope:'OFFLINE_EXTERNALLY_GOVERNED_RELEASE_AUTHORITIES',
  keys:keys.map(x=>({role:x.role,keyId:x.keyId,principal:x.principal,publicKeyPem:x.publicKeyPem}))};
const rootsBytes=json(roots);
function sign(payload,indices,domain){
  return indices.map(i=>({keyId:keys[i].keyId,
    signatureBase64:crypto.sign(null,domain(payload),keys[i].privateKey).toString('base64')}));
}
const issuerSig=x=>sign(x,[0,1],credentialBytes);
const custodySig=x=>sign(x,[2,3],authorizationBytes);
const now=Date.now(),early=new Date(now-120000).toISOString(),
  observed=new Date(now-3600000).toISOString(),
  expiry=new Date(now+3600000).toISOString();
const revocation={
  asOf:observed,revokedKeySha256:[]
};
revocation.signatures=sign({
  asOf:revocation.asOf,revokedKeySha256:revocation.revokedKeySha256
},[0,1],releaseRevocationBytes);
const revocationSha=hash(Buffer.from(canonical(revocation)));
const operatorTrustObj=JSON.parse(trust);
const credentials={scope:'OFFLINE_OPERATOR_CREDENTIAL_INTAKE',
  revocations:revocation,
  certificates:operatorTrustObj.keys.map((x,i)=>{
    const claim={
      role:x.role,keyId:x.keyId,principal:x.principal,
      publicKeySha256:hash(crypto.createPublicKey(x.publicKeyPem)
        .export({format:'der',type:'spki'})),
      corporateSubjectSha256:hash('synthetic-personnel-subject-'+i),
      idpAccountSha256:hash('synthetic-identity-provider-account-'+i),
      mfaAssertionSha256:hash('synthetic-hardware-mfa-proof-'+i),
      identityState:'ACTIVE_HARDWARE_MFA_CLAIM',
      lastVerifiedAt:early,expiresAt:expiry,
      operatorPlanSha256:hash(operator.planBytes),
      revocationsSha256:revocationSha,authorityRootsSha256:hash(rootsBytes)
    };
    return {claim,signatures:issuerSig(claim)};
  })
};
const credentialsBytes=json(credentials);
const ticket=operator.ticket;
const source=reviewer.source,review=reviewer.review;
const authorization={
  scope:'OFFLINE_NONPRODUCTION_DATA_PERMISSION',
  claim:{
    dataClassification:'SYNTHETIC_TEST_DATA_ONLY',
    permittedPurpose:'READ_ONLY_INDEPENDENT_RECOVERY_REHEARSAL',
    sourceSha256:hash(reviewed.source),reviewSha256:hash(reviewed.review),
    reviewerCustodySha256:hash(reviewed.custody),
    operatorPermitSha256:hash(operator.permitBytes),
    operatorPlanSha256:hash(operator.planBytes),
    observationsSha256:hash(operator.observedBytes),
    restoreEvidenceSha256:hash(reviewed.evidence),archiveSha256:hash(operator.archive),
    operatorCredentialsSha256:hash(credentialsBytes),releaseAuthoritySha256:hash(rootsBytes),
    tenantIdSha256:hash(source.tenant.id),
    approvalTicketSha256:ticket,
    lawfulProcessingBasisSha256:hash('synthetic-legal-basis-only'),
    privacyImpactAssessmentSha256:hash('synthetic-privacy-review-only'),
    offsiteCustodyLocationSha256:hash('synthetic-private-offsite-location'),
    keyCustodianRecordSha256:hash('synthetic-vault-key-custodian'),
    deletionPlanSha256:hash('synthetic-evidence-retention-procedure'),
    retentionDays:7,encryptedCopyClaim:'NO_REAL_CUSTOMER_DATA',
    sourceDatabase:'apex_stage_release_ci',restoredDatabase:'apex_stage_restored_ci',
    totalLegacyRows:review.decisions.length,
    retainedOwnerOnlyRows:review.decisions.filter(x=>x.disposition==='RETAIN_OWNER_ONLY').length,
    proposedCustomerRows:review.decisions.filter(x=>x.disposition==='PROPOSE_CUSTOMER').length,
    customerRegistryCount:source.customers.length,
    issuedAt:early,expiresAt:expiry
  }
};
authorization.signatures=custodySig(authorization.claim);
const baseline={
  reviewPacket:reviewed,operatorPacket:operated,authorityRoots:rootsBytes,
  authorityRootPin:hash(rootsBytes),
  operatorCredentials:credentialsBytes,custodyAuthorization:json(authorization)
};
let pass=0;
function test(label,fn){fn();pass++;console.log('PASS '+label);}
function failure(label,modified){test(label,()=>assert.throws(()=>assessReleaseDossier(modified)));}
function changeAuthorization(mutator){
  const a=clone(JSON.parse(baseline.custodyAuthorization));
  mutator(a.claim);
  a.signatures=custodySig(a.claim); // real test authorisers resign malformed terms
  return {...baseline,custodyAuthorization:json(a)};
}
function changeCredentials(mutator){
  const c=clone(JSON.parse(baseline.operatorCredentials));
  mutator(c);
  c.certificates.forEach(x=>x.signatures=issuerSig(x.claim));
  const updated={...baseline,operatorCredentials:json(c)};
  const auth=clone(JSON.parse(updated.custodyAuthorization));
  auth.claim.operatorCredentialsSha256=hash(updated.operatorCredentials);
  auth.signatures=custodySig(auth.claim);
  updated.custodyAuthorization=json(auth);
  return updated;
}
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'apex-phasej-dossier-'));
try{
  const outcome=assessReleaseDossier(baseline);
  test('All previous reviewer, ownership, identity and witnessed recovery chains re-verified',()=>{
    assert.equal(outcome.signedReviewerRoles,4);
    assert.equal(outcome.credentialedOperatorRoles,2);
    assert.equal(outcome.independentDataCustodians,2);
    assert.equal(outcome.legacyRowsCovered,1);
    assert.equal(outcome.explicitlyRetainedOwnerOnlyRows,1);
    assert.equal(outcome.proposedCustomerAssignmentsNotApplied,0);
    assert.equal(outcome.sourceAndRehearsalSha256Match,true);
    assert.equal(outcome.signedOperatorRecoveryHandoffVerified,true);
    assert.equal(outcome.productionCutoverReady,false);
    assert.equal(outcome.realHumanIdentityProviderQueried,false);
    assert.equal(outcome.claimedLegalAuthorityIndependentlyConfirmed,false);
    assert.equal(outcome.authorizedCustomerDataRehearsalActuallyPerformed,false);
  });
  failure('Unpinned external root public-key registry is rejected',(()=>{
    const key=clone(roots);
    key.keys[0].principal='fake-personnel-issuer';
    return {...baseline,authorityRoots:json(key)};
  })());
  failure('Separation of duties rejects existing operator acting as new HR authority',(()=>{
    const x=clone(roots);
    x.keys[0].publicKeyPem=operator.signers[0].publicKeyPem;
    return {...baseline,authorityRoots:json(x),
      authorityRootPin:hash(json(x))};
  })());
  failure('Missing second signed organizational operator credential',(()=>{
    const c=clone(credentials);c.certificates.pop();
    return {...baseline,operatorCredentials:json(c)};
  })());
  failure('Duplicated real HR subject of operator and security witness is refused',
    changeCredentials(c=>{
      c.certificates[1].claim.corporateSubjectSha256=
        c.certificates[0].claim.corporateSubjectSha256;
    }));
  failure('Duplicated IdP account even under different HR subjects is refused',
    changeCredentials(c=>{c.certificates[1].claim.idpAccountSha256=
      c.certificates[0].claim.idpAccountSha256;}));
  failure('Account with revoked operator key is refused even with correct issuer signatures',
    changeCredentials(c=>{
      const revoked=c.certificates[1].claim.publicKeySha256;
      c.revocations.revokedKeySha256=[revoked];
      c.revocations.signatures=sign({
        asOf:c.revocations.asOf,revokedKeySha256:c.revocations.revokedKeySha256
      },[0,1],releaseRevocationBytes);
      const newSha=hash(Buffer.from(canonical(c.revocations)));
      c.certificates.forEach(x=>x.claim.revocationsSha256=newSha);
    }));
  failure('Inactive or unsupported MFA cannot pass independently signed credential',
    changeCredentials(c=>c.certificates[0].claim.identityState='PASSWORD_ONLY'));
  failure('Identity credential asserted after rehearsal start is rejected',
    changeCredentials(c=>c.certificates[0].claim.lastVerifiedAt=
      new Date(Date.now()-10000).toISOString()));
  failure('Invalid independent HR issuer signature cannot certify an operator',
    (()=>{
      const c=clone(credentials);
      c.certificates[0].signatures[0].signatureBase64='A'.repeat(86)+'==';
      return {...baseline,operatorCredentials:json(c)};
    })());
  failure('Unsigned revocation status edit cannot certify an operator',
    (()=>{
      const c=clone(credentials);c.revocations.revokedKeySha256.push(hash('fake-revoked-key'));
      return {...baseline,operatorCredentials:json(c)};
    })());
  failure('Permission cannot silently cover fewer historical owner-only rows',
    changeAuthorization(a=>{a.totalLegacyRows=0;}));
  failure('Custodian cannot reassign legacy rows without a matching signed review',
    changeAuthorization(a=>{a.retainedOwnerOnlyRows=0;a.proposedCustomerRows=1;}));
  failure('Data permission cannot refer to different source or restore evidence',
    changeAuthorization(a=>{a.sourceSha256='f'.repeat(64);}));
  failure('Different signed approval ticket cannot be substituted for the recovery witness ticket',
    changeAuthorization(a=>{a.approvalTicketSha256=hash('different-ticket');}));
  failure('Cross-tenant approval is rejected even if a controller signs it',
    changeAuthorization(a=>{a.tenantIdSha256=hash('not-the-reviewed-tenant');}));
  failure('Expired data permission rejected with genuine data-controller signatures',
    changeAuthorization(a=>{a.expiresAt='2021-01-01T00:00:00Z';}));
  failure('Approval prepared only after rehearsal began cannot retroactively authorize a run',
    changeAuthorization(a=>{a.issuedAt=new Date(Date.now()-1000).toISOString();}));
  failure('Data controller cannot use a production database name',
    changeAuthorization(a=>{a.sourceDatabase='apex_prod_customer_data';}));
  failure('Recovery clone cannot equal immutable source database',
    changeAuthorization(a=>{a.restoredDatabase=a.sourceDatabase;}));
  failure('Unencrypted real customer-data claim is refused',
    changeAuthorization(a=>{
      a.dataClassification='PSEUDONYMIZED_AUTHORIZED_NONPRODUCTION_CLAIM';
      a.encryptedCopyClaim='NO_REAL_CUSTOMER_DATA';
    }));
  failure('Unlimited retention cannot be approved even by two signing custodians',
    changeAuthorization(a=>{a.retentionDays=9999;}));
  failure('Missing independent privacy-impact assessment digest fails',
    changeAuthorization(a=>{a.privacyImpactAssessmentSha256=null;}));
  failure('A modified operator witnessed recovery plan is not the reviewed release',
    {...baseline,operatorPacket:{...baseline.operatorPacket,
      operatorPlan:json({...JSON.parse(operator.planBytes),rpoMinutes:1})}});
  failure('A changed restored archive cannot match previous witnessed evidence',
    {...baseline,operatorPacket:{...baseline.operatorPacket,
      archive:crypto.randomBytes(operator.archive.length)}});
  failure('Original review source swapped while operator/restore evidence unchanged',
    {...baseline,reviewPacket:{...baseline.reviewPacket,
      source:json({...source,tenant:{id:'other-tenant'}})}});
  // Even cryptographically signed "authorized data" labels are ONLY claims;
  // the library cannot query the corporate IdP or read actual evidence from DPA.
  const claimedReal=changeAuthorization(a=>{
    a.dataClassification='PSEUDONYMIZED_AUTHORIZED_NONPRODUCTION_CLAIM';
    a.encryptedCopyClaim='AES256_GCM_EXTERNAL_AT_REST_CLAIM_UNVERIFIED';
  });
  const claimedResult=assessReleaseDossier(claimedReal);
  test('Properly signed external custody claim still cannot become verified real approval',()=>{
    assert.equal(claimedResult.custodyAuthorizationSignaturesValid,true);
    assert.equal(claimedResult.claimedLegalAuthorityIndependentlyConfirmed,false);
    assert.equal(claimedResult.encryptionAtRestIndependentlyVerified,false);
    assert.equal(claimedResult.productionCutoverReady,false);
  });
  // Build a second complete valid chain with an explicit proposed-customer row.
  // No database or source ownership mutation is executed.
  const newReview=clone(review);
  newReview.decisions[0].disposition='PROPOSE_CUSTOMER';
  newReview.decisions[0].customerId=source.customers[0].id;
  const proposedReviewBytes=json(newReview);
  const newReviewPlan=JSON.parse(reviewed.plan);
  newReviewPlan.reviewSha256=hash(proposedReviewBytes);
  const proposedPlanBytes=json(newReviewPlan);
  let prev='0'.repeat(64);
  const newSignoffs={records:reviewer.participants.map((p,i)=>{
    const claim={
      sourceSha256:hash(reviewed.source),reviewSha256:hash(proposedReviewBytes),
      planSha256:hash(proposedPlanBytes),restoreEvidenceSha256:hash(reviewed.evidence),
      decision:'REVIEWED_FOR_DISPOSABLE_REHEARSAL_ONLY',
      scope:'OFFLINE_NO_PRODUCTION_CUTOVER',
      expiresAt:new Date(Date.now()+14*86400000).toISOString()
    };
    const rr={sequence:i+1,prevSha256:prev,role:p.role,keyId:p.keyId,
      attestation:claim,signatureBase64:''};
    rr.signatureBase64=crypto.sign(null,attestationBytes(rr),p.privateKey)
      .toString('base64');
    prev=recordHash(rr);
    return rr;
  })};
  const proposedSignoffsBytes=json(newSignoffs);
  const currentFiles={source:reviewed.source,review:proposedReviewBytes,
    trust:reviewed.trust,signoffs:proposedSignoffsBytes,plan:proposedPlanBytes,
    evidence:reviewed.evidence,identities:reviewed.identities,
    revocations:reviewed.revocations};
  const witnessSignatures=bytes=>reviewer.authorities.map(x=>({
    issuerKeyId:x.keyId,signatureBase64:crypto.sign(null,bytes,x.privateKey).toString('base64')
  }));
  const custodyChange={scope:'OFFLINE_PRIVATE_EVIDENCE_CUSTODY',entries:[]};
  prev='0'.repeat(64);
  for(let i=0;i<artifacts.length;i++){
    const kind=artifacts[i],claim={
      sequence:i+1,artifact:kind,artifactSha256:hash(currentFiles[kind]),
      observedAt:new Date(Date.now()-3600000).toISOString(),
      prevReceiptSha256:prev,classification:'PRIVATE_RESTRICTED_REVIEW_ONLY'
    };
    const entry={claim,signatures:witnessSignatures(custodyBytes(claim))};
    custodyChange.entries.push(entry);
    prev=recordHash(entry);
  }
  const amendedReview={...reviewed,review:proposedReviewBytes,
    plan:proposedPlanBytes,signoffs:proposedSignoffsBytes,
    custody:json(custodyChange)};
  const proposedAuth=clone(authorization);
  proposedAuth.claim.reviewSha256=hash(proposedReviewBytes);
  proposedAuth.claim.reviewerCustodySha256=hash(amendedReview.custody);
  proposedAuth.claim.retainedOwnerOnlyRows=0;
  proposedAuth.claim.proposedCustomerRows=1;
  proposedAuth.signatures=custodySig(proposedAuth.claim);
  const proposedResult=assessReleaseDossier({
    ...baseline,reviewPacket:amendedReview,custodyAuthorization:json(proposedAuth)
  });
  test('Complete separately signed PROPOSE_CUSTOMER decisions do not cause ownership migration',()=>{
    assert.equal(proposedResult.legacyRowsCovered,1);
    assert.equal(proposedResult.proposedCustomerAssignmentsNotApplied,1);
    assert.equal(proposedResult.explicitlyRetainedOwnerOnlyRows,0);
    assert.equal(proposedResult.historicalCustomerMappingsApplied,false);
    assert.equal(proposedResult.productionCutoverReady,false);
  });
  const provided={
    source:reviewed.source,review:reviewed.review,trust:reviewed.trust,
    signoffs:reviewed.signoffs,reviewPlan:reviewed.plan,evidence:reviewed.evidence,
    reviewRoots:reviewed.roots,identities:reviewed.identities,
    revocations:reviewed.revocations,reviewCustody:reviewed.custody,
    operatorTrust:operated.operatorTrust,operatorPermit:operated.operatorPermit,
    operatorPlan:operated.operatorPlan,observations:operated.observations,
    archive:operated.archive,authorityRoots:baseline.authorityRoots,
    operatorCredentials:baseline.operatorCredentials,
    custodyAuthorization:baseline.custodyAuthorization
  };
  const args=[];
  for(const key of dossierFiles){
    const f=path.join(temp,key+(key==='archive'?'.dump':'.json'));
    fs.writeFileSync(f,provided[key],{mode:0o600});
    args.push('--'+key,f);
  }
  function execute(e={},extra=[]){
    const env={...process.env,NODE_ENV:'staging',DATABASE_URL:'',
      APEX_PG_RUNTIME_ENABLED:'',APEX_PG_PILOT_ENABLED:'false',
      APEX_RELEASE_DOSSIER_ACK:'OFFLINE_PRIVATE_GOVERNANCE_PREPARATION_ONLY',
      APEX_REVIEW_TRUST_SHA256:reviewed.reviewerTrustPin,
      APEX_REVIEW_IDENTITY_ROOT_SHA256:reviewed.reviewerRootPin,
      APEX_OPERATOR_TRUST_SHA256:operated.operatorTrustPin,
      APEX_RELEASE_AUTHORITY_ROOT_SHA256:baseline.authorityRootPin,...e};
    return spawnSync(process.execPath,
      ['scripts/postgres/release_dossier_gate.mjs',...args,...extra],{
        env,encoding:'utf8'});
  }
  let result=execute();
  test('Exact private-file CLI produces valid offline evidence but EXIT 3 BLOCKED',()=>{
    assert.equal(result.status,3,result.stderr);
    assert.equal(JSON.parse(result.stdout).productionCutoverReady,false);
  });
  result=execute({NODE_ENV:'production'});
  test('Production invocation refused before file processing',()=>{
    assert.equal(result.status,2);
  });
  result=execute({APEX_RELEASE_AUTHORITY_ROOT_SHA256:'f'.repeat(64)});
  test('Unpinned externally substituted oversight root is denied',()=>{
    assert.equal(result.status,1);
  });
  result=execute({APEX_PG_PILOT_ENABLED:'true'});
  test('Live SQL pilot runtime cannot run dossier verifier',()=>{
    assert.equal(result.status,2);
  });
  result=execute({},['--apply-customer-owner']);
  test('Dossier has no execution, migration or release-approval commands',()=>{
    assert.equal(result.status,2);
  });
  console.log('PHASE 10.5J GOVERNED RELEASE DOSSIER '+pass+'/'+pass+' PASS');
}finally{
  fs.rmSync(temp,{recursive:true,force:true});
}
