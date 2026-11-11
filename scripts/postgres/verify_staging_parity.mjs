#!/usr/bin/env node
// Phase 10.2 — READ-ONLY verification of every staged source row against PG16 JSONB.
// This never writes source JSON or SQL and is restricted to local throwaway staging databases.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';

const args=process.argv.slice(2);
const configured=args[0]==='--source'&&args.length===2?args[1]:'';
const source=configured&&path.isAbsolute(configured)?fs.realpathSync(configured):'';
const relative=source?path.relative(process.cwd(),source):'';
const inCheckout=relative===''||(relative!=='..' && !relative.startsWith('..'+path.sep) && !path.isAbsolute(relative));
const env=process.env;
if(!source||inCheckout||!['127.0.0.1','localhost'].includes(env.PGHOST||'') ||
   !/^apex_stage_[a-z0-9_]{2,60}$/.test(env.PGDATABASE||'') ||
   env.APEX_PG_STAGING_ACK!=='STAGING_ONLY_NO_PRODUCTION' ||
   env.DATABASE_URL || env.APEX_PG_RUNTIME_ENABLED) {
  console.error('PARITY REFUSED: only a verified private snapshot and local apex_stage_* PostgreSQL allowed.');
  process.exit(2);
}
const raw=fs.readFileSync(source);
const sourceHash=crypto.createHash('sha256').update(raw).digest('hex');
let data;
try {data=JSON.parse(raw.toString('utf8')); }
catch { console.error('PARITY REFUSED: source is not valid JSON.');process.exit(2); }
if(!data?.tenant?.id || typeof data.tenant.id!=='string') {
  console.error('PARITY REFUSED: source tenant identity invalid.');process.exit(2);
}
const scopedKinds=['projects','assets','endpoints','tickets','jobs','amcs',
  'crmOpportunities','quotes','leads','proposals','rmaClaims'];
const ownerKinds=['invoices','marketplaceDisputes','knowledgeArticles','inventoryTransactions',
  'products','suppliers','rfqs','telegramMessages','licenses','providers','workflows','connectors'];
const stage=(v)=>{
  if(Array.isArray(v))return v.map(stage);
  if(v && typeof v==='object')return Object.fromEntries(
    Object.keys(v).sort().map(key=>[key,stage(v[key])])
  );
  return v;
};
const equals=(expected,actual,label)=>{
  assert.equal(JSON.stringify(stage(actual)),JSON.stringify(stage(expected)),
    'staged row mismatch: '+label);
};
const group=(rows,key)=>new Map(rows.map(row=>[key(row),row]));
const verifyCollection=(sourceRows,targetRows,makeSourceKey,makeTargetKey,check,label)=>{
  assert.equal(targetRows.length,sourceRows.length,'record count mismatch: '+label);
  const target=group(targetRows,makeTargetKey);
  assert.equal(target.size,targetRows.length,'duplicate PostgreSQL '+label+' identifiers');
  for(const row of sourceRows){
    const key=makeSourceKey(row);
    assert.ok(target.has(key),'missing staged '+label+' record');
    check(row,target.get(key));
  }
};
const client=new pg.Client({
  host:env.PGHOST,port:Number(env.PGPORT||5432),
  user:env.PGUSER,password:env.PGPASSWORD,
  database:env.PGDATABASE,connectionTimeoutMillis:3000,statement_timeout:12000
});
let began=false;
try {
  await client.connect();
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  began=true;
  const versions=(await client.query(
    "SELECT stage_only FROM apex.schema_versions WHERE version='10.1-staging'")).rows;
  assert.ok(versions.length===1 && versions[0].stage_only,'staging marker absent');
  const imports=(await client.query('SELECT tenant_id,sha256,snapshot_counts FROM apex.staging_imports')).rows;
  assert.equal(imports.length,1,'expect one staging source only');
  assert.equal(imports[0].tenant_id,data.tenant.id,'staging tenant ID mismatch');
  assert.equal(imports[0].sha256,sourceHash,'staging import SHA256 mismatch');
  const tenants=(await client.query('SELECT tenant_id,display_name FROM apex.tenants')).rows;
  assert.equal(tenants.length,1,'one source tenant expected');
  equals([data.tenant.id,data.tenant.name],[tenants[0].tenant_id,tenants[0].display_name],'tenant profile');
  const users=(await client.query('SELECT tenant_id,staff_id,role,disabled_at FROM apex.staff')).rows;
  verifyCollection(data.users||[],users,
    u=>u.id,u=>u.staff_id,(expected,actual)=>{
      equals([expected.tenantId,expected.role,expected.disabledAt?new Date(expected.disabledAt).toISOString():null],
        [actual.tenant_id,actual.role,actual.disabled_at?new Date(actual.disabled_at).toISOString():null],
        'staff (without credentials) '+expected.id);
    },'staff');
  const customers=(await client.query(
    'SELECT tenant_id,customer_id,display_name FROM apex.customers')).rows;
  verifyCollection(data.customers||[],customers,c=>c.id,c=>c.customer_id,(expected,actual)=>{
    equals([expected.tenantId,expected.name],
      [actual.tenant_id,actual.display_name],'customer '+expected.id);
  },'customers');
  const grants=(await client.query('SELECT tenant_id,customer_id,staff_id FROM apex.customer_grants')).rows;
  const expectedGrants=(data.customers||[]).flatMap(c=>(c.staffUserIds||[]).map(id=>({
    tenant_id:c.tenantId,customer_id:c.id,staff_id:id
  })));
  verifyCollection(expectedGrants,grants,
    g=>g.tenant_id+':'+g.customer_id+':'+g.staff_id,
    g=>g.tenant_id+':'+g.customer_id+':'+g.staff_id,
    (expected,actual)=>equals(expected,actual,'grant '+expected.customer_id),'customer grants');
  const customerById=group(data.customers||[],c=>c.id);
  const projectById=group(data.projects||[],r=>r.id);
  const assetById=group(data.assets||[],r=>r.id);
  const records=(await client.query(
    'SELECT tenant_id,customer_id,kind,source_id,payload,related_kind,related_id FROM apex.customer_records')).rows;
  const sourceRecords=scopedKinds.flatMap(kind=>(data[kind]||[]).map(row=>({kind,row})));
  verifyCollection(sourceRecords,records,s=>s.kind+':'+s.row.id,r=>r.kind+':'+r.source_id,
    (expected,actual)=>{
      const {kind,row}=expected;
      const parent=kind==='proposals'?projectById.get(row.projectId):
        kind==='rmaClaims'?assetById.get(row.assetId):null;
      const customerId=parent?.customerId||row.customerId;
      assert.ok(customerById.has(customerId),'invalid source customer reference '+kind);
      const relatedKind=kind==='proposals'?'projects':kind==='rmaClaims'?'assets':null;
      const relatedId=kind==='proposals'?row.projectId:kind==='rmaClaims'?row.assetId:null;
      equals([data.tenant.id,customerId,kind,row.id,relatedKind,relatedId,row],
        [actual.tenant_id,actual.customer_id,actual.kind,actual.source_id,
          actual.related_kind,actual.related_id,actual.payload],
        kind+'/'+row.id);
    },'customer business records');
  const shares=(await client.query(
    'SELECT tenant_id,customer_id,project_id,staff_id FROM apex.project_shares')).rows;
  const expectedShares=(data.projects||[]).flatMap(p=>(p.collaboratorUserIds||[]).map(id=>({
    tenant_id:data.tenant.id,customer_id:p.customerId,project_id:p.id,staff_id:id
  })));
  verifyCollection(expectedShares,shares,
    x=>x.tenant_id+':'+x.project_id+':'+x.staff_id,
    x=>x.tenant_id+':'+x.project_id+':'+x.staff_id,
    (e,a)=>equals(e,a,'project share '+e.project_id),'project shares');
  const legacy=(await client.query(
    'SELECT tenant_id,kind,source_id,payload FROM apex.owner_legacy_records')).rows;
  const ownerSource=ownerKinds.flatMap(kind=>(data[kind]||[]).map(row=>({kind,row})));
  verifyCollection(ownerSource,legacy,s=>s.kind+':'+s.row.id,r=>r.kind+':'+r.source_id,
    (e,a)=>equals([data.tenant.id,e.kind,e.row.id,e.row],
      [a.tenant_id,a.kind,a.source_id,a.payload],e.kind+'/'+e.row.id),'owner-only business records');
  const audit=(await client.query('SELECT tenant_id,event_id,event_data FROM apex.audit_events')).rows;
  verifyCollection(data.events||[],audit,e=>e.id,r=>r.event_id,
    (e,a)=>equals([data.tenant.id,e.id,e],[a.tenant_id,a.event_id,a.event_data],'audit '+e.id),
    'source audit events');
  const finalHash=crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex');
  assert.equal(finalHash,sourceHash,'source changed during read-only comparison');
  await client.query('COMMIT');
  began=false;
  console.log(JSON.stringify({
    success:true,kind:'POSTGRESQL_STAGING_SOURCE_PARITY',
    sourceSha256:sourceHash,tenantId:data.tenant.id,
    customers:customers.length,grants:grants.length,
    customerRecords:records.length,ownerOnlyRecords:legacy.length,
    projectShares:shares.length,auditEvents:audit.length,
    sourceModified:false,databaseModified:false
  },null,2));
} catch(error){
  console.error('STAGING PARITY FAILED: '+error.message);
  process.exitCode=1;
} finally {
  if(began)await client.query('ROLLBACK').catch(()=>{});
  await client.end().catch(()=>{});
}
