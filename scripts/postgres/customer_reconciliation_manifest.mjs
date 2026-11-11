#!/usr/bin/env node
// Phase 10.5C: immutable source-to-target per-customer reconciliation manifest.
// READ-ONLY isolated staging; owner-only legacy records are NOT guessed into customers.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
const argv=process.argv.slice(2),e=process.env;
const arg=argv.length===2&&argv[0]==='--source'?argv[1]:'';
const source=arg&&path.isAbsolute(arg)&&fs.existsSync(arg)?fs.realpathSync(arg):'';
const rel=source?path.relative(process.cwd(),source):'';
const unsafe=!source||rel===''||
  (rel!=='..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel));
if(unsafe||!['127.0.0.1','localhost'].includes(e.PGHOST||'')||
   !/^apex_stage_[a-z0-9_]{2,60}$/.test(e.PGDATABASE||'')||
   e.APEX_PG_STAGING_ACK!=='STAGING_ONLY_NO_PRODUCTION'||
   e.NODE_ENV==='production'||e.DATABASE_URL||e.APEX_PG_RUNTIME_ENABLED){
  console.error('CUSTOMER RECONCILIATION REFUSED: local private snapshot and disposable DB required.');
  process.exit(2);
}
const raw=fs.readFileSync(source);
const sha=crypto.createHash('sha256').update(raw).digest('hex');
const src=JSON.parse(raw.toString('utf8'));
const kinds=['projects','assets','endpoints','tickets','jobs','amcs',
  'crmOpportunities','quotes','leads','proposals','rmaClaims'];
const legacy=['invoices','marketplaceDisputes','knowledgeArticles','inventoryTransactions',
  'products','suppliers','rfqs','telegramMessages','licenses','providers',
  'workflows','connectors'];
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?
  Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const canonical=rows=>JSON.stringify(rows.map(stable).sort((a,b)=>
  JSON.stringify(a).localeCompare(JSON.stringify(b))));
const hash=rows=>crypto.createHash('sha256').update(canonical(rows)).digest('hex');
const db=new pg.Client({
  host:e.PGHOST,port:Number(e.PGPORT||5432),user:e.PGUSER,
  password:e.PGPASSWORD,database:e.PGDATABASE,statement_timeout:9000,
  connectionTimeoutMillis:3000
});
let tx=false,connected=false;
try {
  assert.ok(src?.tenant?.id && Array.isArray(src.customers),'invalid source tenant/customers');
  assert.ok(Array.isArray(src.users),'historical source users absent');
  const customers=new Map(src.customers.map(c=>[c.id,c]));
  assert.equal(customers.size,src.customers.length,'duplicate source customer identities');
  const projects=new Map((src.projects||[]).map(x=>[x.id,x]));
  const assets=new Map((src.assets||[]).map(x=>[x.id,x]));
  const expected=[];
  const keys=new Set();
  for(const kind of kinds)for(const row of src[kind]||[]){
    const parent=kind==='proposals'?projects.get(row.projectId):
      kind==='rmaClaims'?assets.get(row.assetId):null;
    const customerId=row.customerId||parent?.customerId;
    assert.ok(customerId && customers.has(customerId),'unmapped '+kind+' customer');
    if(row.customerId&&parent)
      assert.equal(row.customerId,parent.customerId,'cross-customer linked record');
    const key=kind+':'+row.id;
    assert.ok(!keys.has(key),'duplicate source record');
    keys.add(key);
    expected.push({customerId,kind,id:row.id,payload:row});
  }
  const expectedGrants=src.customers.flatMap(c=>(c.staffUserIds||[]).map(staffId=>({
    customerId:c.id,staffId
  })));
  await db.connect();connected=true;
  await db.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');tx=true;
  const importRows=(await db.query(
    'SELECT tenant_id,sha256 FROM apex.staging_imports')).rows;
  assert.equal(importRows.length,1,'expected single verified import');
  assert.equal(importRows[0].tenant_id,src.tenant.id,'tenant ID changed');
  assert.equal(importRows[0].sha256,sha,'snapshot source SHA mismatch');
  const customersPG=(await db.query(
    'SELECT tenant_id,customer_id,display_name FROM apex.customers')).rows;
  assert.equal(customersPG.length,src.customers.length,'missing or extra customer');
  const grantsPG=(await db.query(
    'SELECT tenant_id,customer_id,staff_id FROM apex.customer_grants')).rows;
  assert.equal(hash(expectedGrants),hash(grantsPG.map(g=>({
    customerId:g.customer_id,staffId:g.staff_id
  }))),'missing, orphaned or swapped customer staff grant');
  const recordsPG=(await db.query(
    'SELECT tenant_id,customer_id,kind,source_id,payload FROM apex.customer_records')).rows;
  assert.equal(recordsPG.length,expected.length,'missing/extra customer record');
  const manifests=[];
  for(const [customerId,c] of customers){
    const p=customersPG.find(x=>x.customer_id===customerId);
    assert.ok(p && p.tenant_id===src.tenant.id,'customer ID missing or tenant drift');
    assert.equal(p.display_name,c.name,'customer name drift');
    const expectedRows=expected.filter(x=>x.customerId===customerId)
      .map(x=>({kind:x.kind,id:x.id,payload:x.payload}));
    const actualRows=recordsPG.filter(x=>x.customer_id===customerId).map(x=>{
      assert.equal(x.tenant_id,src.tenant.id,'cross-tenant customer record');
      return {kind:x.kind,id:x.source_id,payload:x.payload};
    });
    assert.equal(hash(expectedRows),hash(actualRows),
      'per-customer record digest mismatch: '+crypto.createHash('sha256').update(customerId).digest('hex').slice(0,12));
    const memberships=expectedGrants.filter(g=>g.customerId===customerId);
    manifests.push({
      customerKeySha256:crypto.createHash('sha256').update(customerId).digest('hex'),
      recordCount:actualRows.length,grantCount:memberships.length,
      scopedRecordSha256:hash(actualRows)
    });
  }
  const legacyPG=(await db.query(
    'SELECT tenant_id,kind,source_id,payload FROM apex.owner_legacy_records')).rows;
  const legacySource=legacy.flatMap(kind=>(src[kind]||[]).map(x=>({
    kind,id:x.id,payload:x
  })));
  assert.equal(hash(legacySource),hash(legacyPG.map(x=>({
    kind:x.kind,id:x.source_id,payload:x.payload
  }))),'unmapped owner-only collection drift');
  await db.query('ROLLBACK');tx=false;
  assert.equal(sha,crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'),
    'snapshot modified during read-only comparison');
  console.log(JSON.stringify({
    matched:true,mode:'PRIVATE_STAGING_PER_CUSTOMER_RECONCILIATION',
    sourceSha256:sha,tenantCount:1,customerCount:manifests.length,
    scopedRecordCount:expected.length,customerGrantCount:expectedGrants.length,
    customerManifests:manifests.sort((a,b)=>a.customerKeySha256.localeCompare(b.customerKeySha256)),
    unmappedOwnerOnlyRecords:legacySource.length,
    ownerOnlyMappingApproved:false,productionCutoverReady:false,
    sourceModified:false,databaseModified:false
  }));
}catch(error){
  console.error('CUSTOMER RECONCILIATION MISMATCH: '+error.message);
  process.exitCode=1;
}finally {
  if(tx)await db.query('ROLLBACK').catch(()=>{});
  if(connected)await db.end().catch(()=>{});
}
