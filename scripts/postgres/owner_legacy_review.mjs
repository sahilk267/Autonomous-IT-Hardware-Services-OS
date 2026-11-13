#!/usr/bin/env node
// Phase 10.5F: private, immutable historical ownership REVIEW PREPARATION.
// Never updates SQL/source, grants customer visibility or declares real approval.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import pg from 'pg';

const e=process.env, args=process.argv.slice(2);
const legacyKinds=[
  'invoices','marketplaceDisputes','knowledgeArticles','inventoryTransactions',
  'products','suppliers','rfqs','telegramMessages','licenses','providers',
  'workflows','connectors'
];
const sha256=x=>crypto.createHash('sha256').update(x).digest('hex');
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?
  Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const digest=x=>sha256(JSON.stringify(canonical(x)));
function privateFile(file){
  if(!file || !path.isAbsolute(file))return '';
  const real=fs.realpathSync(file);
  const rel=path.relative(process.cwd(),real);
  if(rel==='' || (rel!=='..' && !rel.startsWith('..'+path.sep) && !path.isAbsolute(rel)))
    return '';
  if(!fs.statSync(real).isFile())return '';
  return real;
}
if(args.length!==4 || args[0]!=='--source'||args[2]!=='--review' ||
  e.NODE_ENV==='production' || e.DATABASE_URL || e.APEX_PG_RUNTIME_ENABLED ||
  e.APEX_PG_STAGING_ACK!=='STAGING_ONLY_NO_PRODUCTION' ||
  !['127.0.0.1','localhost'].includes(e.PGHOST||'') ||
  !/^apex_stage_[a-z0-9_]{2,60}$/.test(e.PGDATABASE||'')){
  console.error('OWNERSHIP REVIEW REFUSED: explicit private files and disposable local staging required');
  process.exit(2);
}
let source,review,sourceBytes,reviewBytes;
try{
  const s=privateFile(args[1]),r=privateFile(args[3]);
  assert.ok(s&&r&&s!==r,'private source and separate review file are required');
  sourceBytes=fs.readFileSync(s);reviewBytes=fs.readFileSync(r);
  assert.ok(sourceBytes.length<=40_000_000 && reviewBytes.length<=8_000_000,
    'review/source size limits exceeded');
  source=JSON.parse(sourceBytes.toString('utf8'));
  review=JSON.parse(reviewBytes.toString('utf8'));
}catch(err){
  console.error('OWNERSHIP REVIEW REFUSED: '+err.message);
  process.exit(2);
}
const sourceSha=sha256(sourceBytes),reviewSha=sha256(reviewBytes);
const db=new pg.Client({host:e.PGHOST,port:Number(e.PGPORT||5432),
  user:e.PGUSER,password:e.PGPASSWORD,database:e.PGDATABASE,
  connectionTimeoutMillis:3000,statement_timeout:8000});
let connected=false,inTransaction=false;
try{
  assert.ok(source?.tenant?.id && Array.isArray(source.customers),'invalid source tenant/customers');
  assert.ok(review && !Array.isArray(review) && review.sourceSha256===sourceSha &&
    review.tenantId===source.tenant.id && Array.isArray(review.decisions),
    'review is not bound to this exact immutable source snapshot/tenant');
  const customerIds=new Set(source.customers.map(x=>x.id));
  assert.equal(customerIds.size,source.customers.length,'duplicate customers');
  const sourceRows=legacyKinds.flatMap(kind=>
    (source[kind]||[]).map(row=>({kind,id:row.id,payload:row})));
  const sourceKeys=new Map();
  for(const row of sourceRows){
    assert.ok(typeof row.id==='string'&&row.id.length,'legacy row missing id');
    const key=row.kind+'\u0000'+row.id;
    assert.ok(!sourceKeys.has(key),'duplicate legacy row');
    sourceKeys.set(key,row);
  }
  const reviews=new Set();
  const totals={retain:0,proposed:0};
  const reviewManifest=[];
  for(const item of review.decisions){
    assert.ok(item && typeof item==='object'&&!Array.isArray(item),'malformed review decision');
    assert.deepEqual(Object.keys(item).sort(),
      ['customerId','disposition','evidenceSha256','id','kind','reviewerRefs'].sort(),
      'unexpected ownership review fields');
    const key=item.kind+'\u0000'+item.id;
    assert.ok(sourceKeys.has(key),'review refers to unknown legacy record');
    assert.ok(!reviews.has(key),'duplicate review decision');
    reviews.add(key);
    assert.ok(['RETAIN_OWNER_ONLY','PROPOSE_CUSTOMER'].includes(item.disposition),
      'unrecognized ownership disposition');
    assert.ok(Array.isArray(item.reviewerRefs) && item.reviewerRefs.length===2 &&
      item.reviewerRefs.every(x=>typeof x==='string' && /^[A-Za-z0-9._:-]{6,96}$/.test(x)) &&
      item.reviewerRefs[0]!==item.reviewerRefs[1],
      'distinct data-custodian and security-review evidence references are required');
    // References are UNVERIFIED claims; this tool cannot verify signatures or identities.
    assert.ok(typeof item.evidenceSha256==='string' &&
      /^[0-9a-f]{64}$/.test(item.evidenceSha256),'external evidence fingerprint required');
    if(item.disposition==='RETAIN_OWNER_ONLY'){
      assert.equal(item.customerId,null,'retained legacy row cannot have a customer');
      totals.retain++;
    }else{
      assert.ok(typeof item.customerId==='string' && customerIds.has(item.customerId),
        'proposal must reference a registered customer');
      totals.proposed++;
    }
    reviewManifest.push({rowKeySha256:sha256(key),kind:item.kind,
      disposition:item.disposition,sourcePayloadSha256:digest(sourceKeys.get(key).payload),
      proposedCustomerKeySha256:item.customerId?sha256(item.customerId):null});
  }
  assert.equal(reviews.size,sourceKeys.size,
    'every historical owner-only row requires an explicit decision, including retained rows');

  await db.connect();connected=true;
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');inTransaction=true;
  const readOnly=await db.query('SHOW transaction_read_only');
  assert.equal(readOnly.rows[0].transaction_read_only,'on');
  const imports=(await db.query(
    'SELECT tenant_id,sha256 FROM apex.staging_imports')).rows;
  assert.equal(imports.length,1,'exactly one staging source provenance required');
  assert.equal(imports[0].tenant_id,source.tenant.id,'SQL tenant differs from snapshot');
  assert.equal(imports[0].sha256,sourceSha,'SQL import provenance differs from snapshot');
  const staged=(await db.query(
    'SELECT tenant_id,kind,source_id,payload FROM apex.owner_legacy_records')).rows;
  assert.equal(staged.length,sourceRows.length,'staged owner-only ledger count mismatch');
  for(const row of staged){
    assert.equal(row.tenant_id,source.tenant.id,'foreign tenant owner-only record');
    const src=sourceKeys.get(row.kind+'\u0000'+row.source_id);
    assert.ok(src,'unmatched SQL legacy record');
    assert.equal(digest(row.payload),digest(src.payload),'legacy SQL/source payload drift');
  }
  await db.query('ROLLBACK');inTransaction=false;
  assert.equal(sha256(fs.readFileSync(args[1])),sourceSha,'source mutated during review');
  assert.equal(sha256(fs.readFileSync(args[3])),reviewSha,'review file mutated');
  reviewManifest.sort((a,b)=>a.rowKeySha256.localeCompare(b.rowKeySha256));
  console.log(JSON.stringify({
    mode:'PRIVATE_HISTORICAL_OWNERSHIP_REVIEW_PROPOSAL',
    sourceSha256:sourceSha,reviewSha256:reviewSha,tenantKeySha256:sha256(source.tenant.id),
    completeCoverage:true,recordCount:sourceRows.length,
    retainOwnerOnlyCount:totals.retain,proposedCustomerCount:totals.proposed,
    reviewManifest,provenanceVerified:true,sqlReadOnly:true,sourceModified:false,
    externalReviewerIdentityVerified:false,externalSignatureVerified:false,
    customerMappingApplied:false,productionCutoverReady:false,decision:'REVIEW_ONLY_BLOCKED'
  }));
}catch(error){
  console.error('OWNERSHIP REVIEW FAILED: '+error.message);
  process.exitCode=1;
}finally{
  if(inTransaction)await db.query('ROLLBACK').catch(()=>{});
  if(connected)await db.end().catch(()=>{});
}
