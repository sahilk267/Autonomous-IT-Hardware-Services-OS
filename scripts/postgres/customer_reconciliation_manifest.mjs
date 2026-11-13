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
  // Verify cross-module relationship graph independently of imported payloads:
  // project→proposal, asset→RMA, creator/assignment/reporter custody,
  // and customer/project collaborator membership.
  const linked=expected.filter(x=>x.kind==='proposals'||x.kind==='rmaClaims')
    .map(x=>{
      const kind=x.kind==='proposals'?'projects':'assets';
      const targetId=x.kind==='proposals'?x.payload.projectId:x.payload.assetId;
      const parent=(x.kind==='proposals'?projects:assets).get(targetId);
      assert.ok(parent,'orphaned source '+x.kind+' relationship');
      assert.equal(parent.customerId,x.customerId,'cross-customer relationship');
      return {customerId:x.customerId,kind:x.kind,id:x.id,relatedKind:kind,relatedId:targetId};
    });
  const expectedShares=(src.projects||[]).flatMap(p=>
    (p.collaboratorUserIds||[]).map(staffId=>({
      customerId:p.customerId,projectId:p.id,staffId
    })));
  const expectedStaff=new Map(src.users.map(x=>[x.id,x]));
  assert.equal(expectedStaff.size,src.users.length,'duplicate historic staff identity');
  for(const share of expectedShares){
    assert.ok(expectedStaff.has(share.staffId),'project collaborator missing staff');
    const customer=customers.get(share.customerId);
    assert.ok((customer.staffUserIds||[]).includes(share.staffId),
      'project collaborator lacks customer membership');
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
  // Source staff identities, roles and disabled-account status must survive
  // migration exactly, without copying hashes, tokens or sessions to SQL.
  const staffPG=(await db.query(
    'SELECT tenant_id,staff_id,role,disabled_at FROM apex.staff')).rows;
  assert.equal(staffPG.length,expectedStaff.size,'missing or extra SQL staff');
  for(const row of staffPG){
    assert.equal(row.tenant_id,src.tenant.id,'foreign tenant SQL staff');
    const expectedUser=expectedStaff.get(row.staff_id);
    assert.ok(expectedUser,'SQL staff identity not present in source');
    assert.equal(row.role,expectedUser.role,'historical staff role drift');
    assert.equal(row.disabled_at?new Date(row.disabled_at).toISOString():null,
      expectedUser.disabledAt?new Date(expectedUser.disabledAt).toISOString():null,
      'historical disabled staff status drift');
  }
  const grantKeys=new Set();
  for(const grant of expectedGrants){
    assert.ok(expectedStaff.has(grant.staffId),'grant references non-existent staff');
    const key=grant.customerId+'\u0000'+grant.staffId;
    assert.ok(!grantKeys.has(key),'duplicated source customer membership');
    grantKeys.add(key);
  }
  const customersPG=(await db.query(
    'SELECT tenant_id,customer_id,display_name FROM apex.customers')).rows;
  assert.equal(customersPG.length,src.customers.length,'missing or extra customer');
  const grantsPG=(await db.query(
    'SELECT tenant_id,customer_id,staff_id FROM apex.customer_grants')).rows;
  assert.equal(hash(expectedGrants),hash(grantsPG.map(g=>({
    customerId:g.customer_id,staffId:g.staff_id
  }))),'missing, orphaned or swapped customer staff grant');
  const recordsPG=(await db.query(
    'SELECT tenant_id,customer_id,kind,source_id,payload,related_kind,related_id,'+
    'created_by_staff_id,assigned_staff_id,reported_by_staff_id FROM apex.customer_records')).rows;
  assert.equal(recordsPG.length,expected.length,'missing/extra customer record');
  const linkedPG=recordsPG.filter(x=>x.kind==='proposals'||x.kind==='rmaClaims')
    .map(x=>({
      customerId:x.customer_id,kind:x.kind,id:x.source_id,
      relatedKind:x.related_kind,relatedId:x.related_id
    }));
  assert.equal(hash(linked),hash(linkedPG),
    'proposal/project or RMA/asset relational link drift');
  for(const record of recordsPG){
    const sourceRow=expected.find(x=>x.kind===record.kind && x.id===record.source_id);
    assert.ok(sourceRow,'unexpected cross-module row');
    assert.equal(record.created_by_staff_id,sourceRow.payload.createdByUserId||null,
      'creator reference drift');
    assert.equal(record.assigned_staff_id,sourceRow.payload.assignedUserId||null,
      'engineer asset/job custody drift');
    assert.equal(record.reported_by_staff_id,sourceRow.payload.reportedByUserId||null,
      'ticket reporter reference drift');
    if(record.kind!=='proposals'&&record.kind!=='rmaClaims')
      assert.ok(!record.related_id && !record.related_kind,'unexpected source relation');
  }
  const sharesPG=(await db.query(
    'SELECT tenant_id,customer_id,project_id,staff_id FROM apex.project_shares')).rows;
  assert.equal(hash(expectedShares),hash(sharesPG.map(x=>({
    customerId:x.customer_id,projectId:x.project_id,staffId:x.staff_id
  }))),'project collaborator cross-module share drift');
  const shareKeys=new Set();
  for(const share of expectedShares){
    const key=[share.customerId,share.projectId,share.staffId].join('\u0000');
    assert.ok(!shareKeys.has(key),'duplicated historic project share');
    shareKeys.add(key);
  }

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
      linkedRelations:linked.filter(x=>x.customerId===customerId).length,
      projectCollaborators:expectedShares.filter(x=>x.customerId===customerId).length,
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
    linkedProjectAssetRelationships:linked.length,
    scopedProjectShares:expectedShares.length,
    crossModuleRelationsVerified:true,
    historicalStaffRoleAndDisabledParity:true,
    historicalStaffCount:staffPG.length,
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
