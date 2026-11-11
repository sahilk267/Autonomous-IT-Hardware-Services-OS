// Real PostgreSQL 16 acceptance using disposable JSON snapshot + throwaway CI database.
// No production data, actual secrets, external integrations or web services.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import pg from 'pg';

const folder=fs.mkdtempSync(path.join(os.tmpdir(),'apex-phase10-pg-'));
const source=path.join(folder,'isolated-snapshot.json');
const baseline=JSON.parse(fs.readFileSync('data/app-store.json','utf8'));
const tenant='tenant-fixture-a';
let passed=0;
const test=(name,fn)=>{fn();passed++;console.log('PASS '+name);};
const asyncTest=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
const hashFile=()=>crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex');
function cli(args,extraEnv={}) {
  return spawnSync(process.execPath,['scripts/postgres/stage_json_to_pg.mjs','--source',source,...args],
    {encoding:'utf8',env:{...process.env,...extraEnv}});
}
const user=(id,role,disabled=false)=>({
  id,tenantId:tenant,name:id,username:id,email:id+'@example.invalid',
  role,createdAt:'2026-11-11',...(disabled?{disabledAt:'2026-11-11T00:00:00Z'}:{})
});
const project=(id,cust,creator,shares=[])=>({
  id,customerId:cust,title:id,clientName:cust==='cust-a'?'Customer A':'Customer B',
  createdByUserId:creator,collaboratorUserIds:shares,category:'Hardware Overhaul',
  budget:100,status:'PROPOSALS_OPEN',milestones:[],proposalsCount:1
});
const record=(id,cust,other={})=>({id,customerId:cust,...other});
baseline.tenant={...baseline.tenant,id:tenant,name:'Isolated Tenant A'};
baseline.users=[
  user('owner-a','BUSINESS_OWNER'),
  user('sales-a','SALES_MANAGER'),
  user('proc-a','PROCUREMENT_LEAD'),
  user('it-a','ENTERPRISE_IT_HEAD'),
  user('field-a','FIELD_ENGINEER'),
  user('disabled-a','SALES_MANAGER',true)
];
baseline.customers=[
  {id:'cust-a',tenantId:tenant,name:'Customer A',staffUserIds:['sales-a','proc-a','it-a','field-a']},
  {id:'cust-b',tenantId:tenant,name:'Customer B',staffUserIds:['it-a']}
];
baseline.projects=[
  project('project-a','cust-a','it-a',['sales-a','proc-a']),
  project('project-b','cust-b','it-a',[])
];
baseline.assets=[
  record('asset-a','cust-a',{assignedUserId:'field-a',name:'A confidential'}),
  record('asset-b','cust-b',{assignedUserId:'field-a',name:'B confidential'})
];
baseline.proposals=[
  {id:'proposal-a',projectId:'project-a',providerName:'Private A'},
  {id:'proposal-b',projectId:'project-b',providerName:'Private B'}
];
baseline.rmaClaims=[
  record('rma-a','cust-a',{assetId:'asset-a'}),
  record('rma-b','cust-b',{assetId:'asset-b'})
];
baseline.endpoints=[record('endpoint-a','cust-a',{assignedUserId:'field-a'})];
baseline.jobs=[record('job-a','cust-a',{assignedUserId:'field-a'})];
baseline.tickets=[record('ticket-a','cust-a',{assignedUserId:'field-a'})];
baseline.crmOpportunities=[record('crm-a','cust-a'),record('crm-b','cust-b')];
baseline.amcs=[record('amc-a','cust-a'),record('amc-b','cust-b')];
baseline.quotes=[record('quote-a','cust-a'),record('quote-b','cust-b')];
baseline.leads=[record('lead-a','cust-a'),record('lead-b','cust-b')];
baseline.invoices=[{id:'invoice-private',customerName:'Customer A',totalAmount:555}];
baseline.events=[{id:'audit-a',summary:'Isolated fixture event'}];
fs.writeFileSync(source,JSON.stringify(baseline),{mode:0o600});
const expectedSha=hashFile();
let db;
try {
  let response=cli([]);
  test('Dry-run preflight succeeds without database access',()=>{
    assert.equal(response.status,0,response.stderr);
    assert.equal(JSON.parse(response.stdout).mode,'dry-run');
  });
  response=cli(['--apply'],{APEX_PG_STAGING_ACK:'',PGDATABASE:'postgres'});
  test('Unsafe/default DB staging target rejected before any connection',()=>{
    assert.equal(response.status,2);
    assert.match(response.stderr,/guard refused/);
  });
  response=cli(['--apply']);
  test('Explicit local staging import commits one transaction',()=>{
    assert.equal(response.status,0,response.stderr);
    const result=JSON.parse(response.stdout);
    assert.equal(result.stagingCommitted,true);
    assert.equal(result.sourceSha256,expectedSha);
  });
  test('Source JSON bytes never changed',()=>assert.equal(hashFile(),expectedSha));
  db=new pg.Client({
    host:process.env.PGHOST,port:Number(process.env.PGPORT||5432),
    user:process.env.PGUSER,password:process.env.PGPASSWORD,database:process.env.PGDATABASE
  });
  await db.connect();
  await asyncTest('Staged data counts match all scoped and owner-only records',async()=>{
    const rows=await db.query('SELECT kind,count(*)::integer n FROM apex.customer_records GROUP BY kind');
    for(const kind of ['projects','proposals','assets','rmaClaims','crmOpportunities','amcs','quotes','leads'])
      assert.equal(rows.rows.find(r=>r.kind===kind)?.n,baseline[kind].length);
    const legacy=await db.query("SELECT count(*)::integer AS n FROM apex.owner_legacy_records WHERE kind='invoices'");
    assert.equal(legacy.rows[0].n,1);
    const audit=await db.query('SELECT count(*)::integer AS n FROM apex.audit_events');
    assert.equal(audit.rows[0].n,1);
    const importRow=await db.query('SELECT sha256 FROM apex.staging_imports');
    assert.equal(importRow.rows[0].sha256,expectedSha);
    const sensitiveColumns=await db.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema='apex' AND table_name='staff'");
    assert.ok(!sensitiveColumns.rows.some(r=>/password|hash|salt|token/i.test(r.column_name)));
  });
  response=cli(['--apply']);
  test('Importer refuses nonempty destination instead of replaying or overwriting',()=>{
    assert.equal(response.status,1);
    assert.match(response.stderr,/nonempty staging DB/);
  });
  async function as(roleTenant,actor,query,params=[]) {
    await db.query('BEGIN');
    try {
      await db.query('SET LOCAL ROLE apex_stage_reader');
      if(roleTenant)await db.query("SELECT set_config('apex.tenant_id',$1,true)",[roleTenant]);
      if(actor)await db.query("SELECT set_config('apex.actor_id',$1,true)",[actor]);
      const r=await db.query(query,params);
      await db.query('ROLLBACK');
      return r.rows;
    } catch(err) {
      await db.query('ROLLBACK');
      throw err;
    }
  }
  const count=async(t,u,kind)=>Number((await as(t,u,
    'SELECT count(*)::integer AS n FROM apex.customer_records WHERE kind=$1',[kind]))[0].n);
  await asyncTest('Fail-closed RLS without authenticated request context',async()=>{
    assert.equal(await count(null,null,'projects'),0);
    assert.equal(await count(tenant,'ghost','projects'),0);
    assert.equal(await count('another-tenant','sales-a','projects'),0);
    assert.equal(await count(tenant,'disabled-a','projects'),0);
  });
  await asyncTest('Owner sees both local customers, never a different tenant',async()=>{
    assert.equal(await count(tenant,'owner-a','projects'),2);
    assert.equal(await count(tenant,'owner-a','assets'),2);
    const customers=await as(tenant,'owner-a','SELECT customer_id FROM apex.customers');
    assert.equal(customers.length,2);
  });
  await asyncTest('Sales sees only shared project A, A quote and A lead/CRM',async()=>{
    assert.equal(await count(tenant,'sales-a','projects'),1);
    assert.equal(await count(tenant,'sales-a','proposals'),1);
    assert.equal(await count(tenant,'sales-a','quotes'),1);
    assert.equal(await count(tenant,'sales-a','leads'),1);
    assert.equal(await count(tenant,'sales-a','crmOpportunities'),1);
    assert.equal(await count(tenant,'sales-a','assets'),0);
  });
  await asyncTest('Procurement sees only customer granted project and quote',async()=>{
    assert.equal(await count(tenant,'proc-a','projects'),1);
    assert.equal(await count(tenant,'proc-a','quotes'),1);
    assert.equal(await count(tenant,'proc-a','assets'),1);
    assert.equal(await count(tenant,'proc-a','crmOpportunities'),0);
  });
  await asyncTest('IT head sees service records for both granted customers',async()=>{
    assert.equal(await count(tenant,'it-a','projects'),2);
    assert.equal(await count(tenant,'it-a','assets'),2);
    assert.equal(await count(tenant,'it-a','rmaClaims'),2);
    assert.equal(await count(tenant,'it-a','amcs'),2);
    assert.equal(await count(tenant,'it-a','quotes'),0);
  });
  await asyncTest('Field requires customer grant AND exact asset/job assignment',async()=>{
    assert.equal(await count(tenant,'field-a','assets'),1);
    assert.equal(await count(tenant,'field-a','rmaClaims'),1);
    assert.equal(await count(tenant,'field-a','jobs'),1);
    assert.equal(await count(tenant,'field-a','projects'),0);
    const ids=await as(tenant,'field-a',
      "SELECT source_id FROM apex.customer_records WHERE kind='assets'");
    assert.deepEqual(ids.map(r=>r.source_id),['asset-a']);
  });
  await asyncTest('Owner-only legacy business and audit rows never leak to staff',async()=>{
    const select='SELECT count(*)::integer n FROM apex.owner_legacy_records';
    assert.ok(Number((await as(tenant,'owner-a',select))[0].n)>0);
    assert.equal(Number((await as(tenant,'sales-a',select))[0].n),0);
    assert.equal(Number((await as(tenant,'sales-a','SELECT count(*)::integer n FROM apex.audit_events'))[0].n),0);
  });
  await asyncTest('Stage reader role cannot update records or audit rows',async()=>{
    await assert.rejects(as(tenant,'owner-a',
      "UPDATE apex.customer_records SET payload='{}'::jsonb WHERE source_id='project-a'"),
      err=>err.code==='42501');
    await assert.rejects(as(tenant,'owner-a',
      'DELETE FROM apex.audit_events'),err=>err.code==='42501');
  });
  await asyncTest('Composite customer FK blocks a proposal pointing to another customer project',async()=>{
    await assert.rejects(db.query('INSERT INTO apex.customer_records '+
      '(tenant_id,customer_id,kind,source_id,payload,related_kind,related_id) '+
      "VALUES ($1,$2,'proposals','bad-link','{}'::jsonb,'projects',$3)",
      [tenant,'cust-b','project-a']),err=>err.code==='23503');
  });
  await asyncTest('No cross-tenant visibility even with identical customer/source IDs',async()=>{
    await db.query("INSERT INTO apex.tenants(tenant_id,display_name) VALUES ('tenant-fixture-b','Other tenant')");
    await db.query("INSERT INTO apex.staff(tenant_id,staff_id,role) VALUES ('tenant-fixture-b','owner-b','BUSINESS_OWNER')");
    await db.query("INSERT INTO apex.customers(tenant_id,customer_id,display_name) VALUES ('tenant-fixture-b','cust-a','Other tenant A')");
    await db.query("INSERT INTO apex.customer_records(tenant_id,customer_id,kind,source_id,payload) "+
      "VALUES ('tenant-fixture-b','cust-a','assets','asset-a','{}'::jsonb)");
    assert.equal(await count('tenant-fixture-b','owner-b','assets'),1);
    assert.equal(await count(tenant,'owner-a','assets'),2);
    assert.equal(await count('tenant-fixture-b','owner-a','assets'),0);
  });
  await asyncTest('DB revocation instantly denies customer records and cascades project shares',async()=>{
    await db.query("DELETE FROM apex.customer_grants WHERE tenant_id=$1 AND customer_id='cust-a' AND staff_id='sales-a'",[tenant]);
    assert.equal(await count(tenant,'sales-a','projects'),0);
    assert.equal(await count(tenant,'sales-a','quotes'),0);
    const shares=await db.query("SELECT count(*)::integer n FROM apex.project_shares WHERE staff_id='sales-a'");
    assert.equal(shares.rows[0].n,0);
    assert.equal(await count(tenant,'it-a','projects'),2);
  });
  // Source preflight rejects an unsafe record without writing any rows.
  baseline.quotes[0].customerId=undefined;
  fs.writeFileSync(source,JSON.stringify(baseline),{mode:0o600});
  const rejectedHash=hashFile();
  response=cli(['--apply']);
  test('Unmapped customer record aborts before staging connection',()=>{
    assert.equal(response.status,1);
    assert.match(response.stderr,/preflight/);
    assert.equal(hashFile(),rejectedHash);
  });
  // The importer must also stop customer identity spoofing before attempting any DB write.
  baseline.quotes[0].customerId='cust-a';
  baseline.quotes[0].customerName='Customer B';
  fs.writeFileSync(source,JSON.stringify(baseline),{mode:0o600});
  response=cli(['--apply']);
  test('Contradictory quote customer name is rejected without touching PostgreSQL',()=>{
    assert.equal(response.status,1);
    assert.match(response.stderr,/customer-name conflict/);
  });
  baseline.quotes[0].customerName=undefined;
  baseline.jobs[0].tenantId='another-tenant';
  fs.writeFileSync(source,JSON.stringify(baseline),{mode:0o600});
  response=cli(['--apply']);
  test('Embedded spoofed record tenant ID is rejected without a DB connection',()=>{
    assert.equal(response.status,1);
    assert.match(response.stderr,/forged tenantId/);
  });
  baseline.jobs[0].tenantId=undefined;
  baseline.connectors[0].apiKey='FORBIDDEN_FIXTURE_SECRET_DO_NOT_STAGE';
  fs.writeFileSync(source,JSON.stringify(baseline),{mode:0o600});
  response=cli(['--apply']);
  test('Credential-shaped connector data never enters the staging database',()=>{
    assert.equal(response.status,1);
    assert.match(response.stderr,/credential-shaped field/);
  });
  delete baseline.connectors[0].apiKey;

  // Construct a second isolated staging database to force a LATE SQL integrity failure.
  // A duplicate granted staff identity passes the read-only structural preflight but
  // violates the SQL composite grant PK after tenant and staff inserts have occurred.
  const control=new pg.Client({
    host:process.env.PGHOST,port:Number(process.env.PGPORT||5432),
    user:process.env.PGUSER,password:process.env.PGPASSWORD,database:'postgres'
  });
  await control.connect();
  try{await control.query('CREATE DATABASE apex_stage_abort');}
  finally{await control.end();}
  const abortDb=new pg.Client({
    host:process.env.PGHOST,port:Number(process.env.PGPORT||5432),
    user:process.env.PGUSER,password:process.env.PGPASSWORD,database:'apex_stage_abort'
  });
  await abortDb.connect();
  try {
    await abortDb.query(fs.readFileSync('migrations/postgres/001_staging_rls.sql','utf8'));
    baseline.customers[0].staffUserIds.push('field-a');
    fs.writeFileSync(source,JSON.stringify(baseline),{mode:0o600});
    const beforeAbortedImport=hashFile();
    response=cli(['--apply'],{PGDATABASE:'apex_stage_abort'});
    test('SQL grant constraint forces transaction-wide rollback after partial inserts',()=>{
      assert.equal(response.status,1);
      assert.match(response.stderr,/rolled back/);
      assert.equal(hashFile(),beforeAbortedImport);
    });
    const after=await abortDb.query('SELECT count(*)::integer n FROM apex.tenants');
    const afterRows=await abortDb.query('SELECT count(*)::integer n FROM apex.customer_records');
    const afterImport=await abortDb.query('SELECT count(*)::integer n FROM apex.staging_imports');
    test('Aborted import leaves ZERO tenant, customer data or provenance rows',()=>{
      assert.equal(after.rows[0].n,0);
      assert.equal(afterRows.rows[0].n,0);
      assert.equal(afterImport.rows[0].n,0);
    });
  }finally{await abortDb.end();}
  console.log('POSTGRES STAGING SUMMARY: '+passed+'/'+passed+' PASSED');
} finally {
  if(db)await db.end().catch(()=>{});
  fs.rmSync(folder,{recursive:true,force:true});
}
