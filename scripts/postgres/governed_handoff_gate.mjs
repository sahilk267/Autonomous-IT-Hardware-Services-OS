#!/usr/bin/env node
// Phase 10.5I — independent, signed, strictly NONPRODUCTION operator
// evidence-handoff receipt. It neither creates approvals nor restores data.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {assessRecovery} from './recovery_measurement_gate.mjs';
import {stable} from './review_signoff_gate.mjs';

const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const canonical=v=>JSON.stringify(stable(v));
const isSha=x=>typeof x==='string'&&/^[0-9a-f]{64}$/.test(x);
const exact=(v,fields)=>{
  assert.ok(v&&typeof v==='object'&&!Array.isArray(v),'Expected a review object');
  assert.deepEqual(Object.keys(v).sort(),fields.slice().sort(),
    'Operator review evidence fields are not exact');
};
const roles=['DBA_REHEARSAL_OPERATOR','INDEPENDENT_SECURITY_WITNESS'];
export const operatorAttestationBytes=record=>Buffer.from(
  'APEX_10_5I_OPERATOR_EVIDENCE_V1\n'+canonical({
    sequence:record.sequence,prevRecordSha256:record.prevRecordSha256,
    role:record.role,keyId:record.keyId,attestation:record.attestation
  }),'utf8');
export const operatorRecordHash=record=>sha(Buffer.from(canonical(record)));
export function assessGovernedHandoff({trust,permit,plan,observations,evidence,archive,trustPin}){
  const measured=assessRecovery({plan,observations,evidence,archive});
  assert.ok(isSha(trustPin)&&sha(trust)===trustPin,
    'independent operator public-key registry SHA256 pin mismatch');
  const registry=JSON.parse(trust.toString('utf8')),
    packet=JSON.parse(permit.toString('utf8'));
  exact(registry,['scope','keys']);
  assert.equal(registry.scope,'OFFLINE_OPERATOR_EVIDENCE_REVIEW_KEYS');
  assert.ok(Array.isArray(registry.keys)&&registry.keys.length===2,
    'operator and independent witness keys mandatory');
  const keyIds=new Set(),principals=new Set(),fingerprints=new Set();
  const known=new Map();
  for(let i=0;i<2;i++){
    const k=registry.keys[i];
    exact(k,['role','keyId','principal','publicKeyPem']);
    assert.equal(k.role,roles[i],'operator signer role order mismatch');
    assert.ok(typeof k.keyId==='string'&&/^[a-zA-Z0-9._:-]{6,96}$/.test(k.keyId),
      'invalid operator key ID');
    assert.ok(typeof k.principal==='string'&&/^[a-zA-Z0-9._:-]{6,96}$/.test(k.principal),
      'invalid operator principal reference');
    const key=crypto.createPublicKey(k.publicKeyPem);
    assert.equal(key.asymmetricKeyType,'ed25519');
    const fp=sha(key.export({format:'der',type:'spki'}));
    assert.ok(!keyIds.has(k.keyId)&&!principals.has(k.principal)&&
      !fingerprints.has(fp),'separation of operator and witness keys/personnel violated');
    keyIds.add(k.keyId);principals.add(k.principal);fingerprints.add(fp);
    known.set(k.keyId,{key,role:k.role,principal:k.principal});
  }
  exact(packet,['scope','records']);
  assert.equal(packet.scope,'OFFLINE_NO_CUSTOMER_MIGRATION_APPROVAL');
  assert.ok(Array.isArray(packet.records)&&packet.records.length===2,
    'two independent sealed operator handoff signatures required');
  const planObj=JSON.parse(plan.toString('utf8'));
  const digests={
    planSha256:sha(plan),observationsSha256:sha(observations),
    evidenceSha256:sha(evidence),archiveSha256:sha(archive)
  };
  let prev='0'.repeat(64),ticket=null;
  const now=Date.now();
  for(let i=0;i<2;i++){
    const item=packet.records[i];
    exact(item,['sequence','prevRecordSha256','role','keyId','attestation','signatureBase64']);
    assert.equal(item.sequence,i+1,'operator signature ordering mismatch');
    assert.equal(item.prevRecordSha256,prev,'operator hash-chain predecessor mismatch');
    assert.equal(item.role,roles[i],'operator/witness signature role invalid');
    const key=known.get(item.keyId);
    assert.ok(key&&key.role===roles[i],'unsigned or substituted operator role');
    const a=item.attestation;
    exact(a,['planSha256','observationsSha256','evidenceSha256',
      'archiveSha256','operatorSession','reviewTicketSha256','decision',
      'issuedAt','expiresAt','operationTarget']);
    for(const [field,value] of Object.entries(digests))
      assert.equal(a[field],value,'operator attestation bound to wrong '+field);
    assert.equal(a.operatorSession,planObj.operatorSession,'operator session mismatch');
    assert.ok(isSha(a.reviewTicketSha256),'out-of-band run ticket SHA256 mandatory');
    if(ticket!==null)assert.equal(a.reviewTicketSha256,ticket,
      'operator and witness reviewed different ticket evidence');
    ticket=a.reviewTicketSha256;
    assert.equal(a.decision,'REVIEWED_SYNTHETIC_RECOVERY_EVIDENCE_ONLY');
    assert.equal(a.operationTarget,'DISPOSABLE_POSTGRESQL_CI_COPY_ONLY');
    const issued=Date.parse(a.issuedAt),expiry=Date.parse(a.expiresAt);
    assert.ok(Number.isFinite(issued)&&issued>=now-86400000&&issued<=now+60000 &&
      Number.isFinite(expiry)&&expiry>now&&expiry<=issued+7*86400000,
      'operator/witness review is expired, future dated or older than 24h');
    assert.ok(typeof item.signatureBase64==='string'&&
      /^[A-Za-z0-9+/]{86}==$/.test(item.signatureBase64),'invalid Ed25519 signature encoding');
    const signature=Buffer.from(item.signatureBase64,'base64');
    assert.equal(signature.length,64,'wrong Ed25519 signature size');
    assert.ok(crypto.verify(null,operatorAttestationBytes(item),key.key,signature),
      'operator or witness evidence signature does not verify');
    prev=operatorRecordHash(item);
  }
  return {
    mode:'SIGNED_SYNTHETIC_OPERATOR_EVIDENCE_HANDOFF',
    measuredRecoveryBudgetChecksPassed:measured.budgetsMet,
    independentOperatorAndWitnessSignaturesValid:true,
    distinctSignerCount:2,operatorTrustSha256:trustPin,
    handoffChainTipSha256:prev,reviewTicketKeySha256:ticket,
    measuredCloneRecoveryMs:measured.detectedToVerifiedRollbackMs,
    measuredSyntheticDowntimeMs:measured.writeFreezeWindowMs,
    realCorporateOperatorApprovalVerified:false,
    externalTicketIssuerVerified:false,independentOperationsRehearsalExecuted:false,
    realProductionRpoRtoMeasured:false,
    customerDataMigrationApplied:false,productionCutoverReady:false,
    decision:'HANDOFF_FORMAT_VERIFIED_NO_PRODUCTION_APPROVAL'
  };
}
function privateFile(filename,sizeLimit=10_000_000){
  assert.ok(typeof filename==='string'&&path.isAbsolute(filename),
    'private absolute file path required');
  const real=fs.realpathSync(filename),rel=path.relative(process.cwd(),real);
  assert.ok(rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel),
    'inputs inside git checkout are forbidden');
  const stat=fs.statSync(real);
  assert.ok(stat.isFile()&&stat.size>0&&stat.size<=sizeLimit,'input file size/type invalid');
  if(process.platform!=='win32')assert.equal(stat.mode&0o007,0,
    'world-readable input is unsafe');
  return {real,bytes:fs.readFileSync(real)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),fields=['trust','permit','plan','observations','evidence','archive'];
  const e=process.env;
  if(args.length!==12||fields.some((f,i)=>args[2*i]!=='--'+f) ||
    e.NODE_ENV==='production'||e.DATABASE_URL||e.APEX_PG_RUNTIME_ENABLED||
    e.APEX_OPERATOR_HANDOFF_ACK!=='OFFLINE_SYNTHETIC_REVIEW_ONLY'){
    console.error('GOVERNED HANDOFF REFUSED: private offline synthetic evidence only');
    process.exit(2);
  }
  try{
    const inputs=fields.map((f,i)=>privateFile(args[2*i+1],
      f==='archive'?500_000_000:10_000_000));
    assert.equal(new Set(inputs.map(x=>x.real)).size,inputs.length,
      'duplicate evidence file path');
    const map=Object.fromEntries(fields.map((f,i)=>[f,inputs[i].bytes]));
    const report=assessGovernedHandoff({...map,trustPin:e.APEX_OPERATOR_TRUST_SHA256});
    for(const input of inputs)assert.equal(sha(fs.readFileSync(input.real)),
      sha(input.bytes),'evidence file changed while assessing');
    console.log(JSON.stringify(report));
    process.exitCode=3; // Signed offline review evidence never enables production.
  }catch(err){
    console.error('GOVERNED HANDOFF FAILED: '+err.message);
    process.exitCode=1;
  }
}
