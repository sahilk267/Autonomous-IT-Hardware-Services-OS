#!/usr/bin/env node
// Phase 10.1 local PostgreSQL staging-only import; does not enable runtime PostgreSQL.
// Refuses any remote/default/live database and never changes the source JSON.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import pg from 'pg';

const args=process.argv.slice(2);
const source=args[0]==='--source' ? args[1] : '';
const apply=args.length===3 && args[2]==='--apply';
if (!source || !path.isAbsolute(source) || !(args.length===2 || apply)) {
  console.error('Usage: node scripts/postgres/stage_json_to_pg.mjs --source /absolute/private/snapshot.json [--apply]');
  process.exit(2);
}
let real, raw, state;
try {
  real=fs.realpathSync(source);
  const rel=path.relative(process.cwd(),real);
  if(rel==='' || (rel!=='..' && !rel.startsWith('..'+path.sep) && !path.isAbsolute(rel)))
    throw Error('Repository starter/checkout file refused; use isolated private snapshot.');
  raw=fs.readFileSync(real);
  state=JSON.parse(raw.toString('utf8'));
} catch(error) {
  console.error('Snapshot rejected: '+error.message);
  process.exit(2);
}
const sha=crypto.createHash('sha256').update(raw).digest('hex');
const preflight=spawnSync(process.execPath,
  ['scripts/customer_migration_preflight.mjs','--source',real],{encoding:'utf8'});
if(preflight.status!==0 || JSON.parse(preflight.stdout).sourceSha256!==sha) {
  console.error('Read-only source preflight or SHA mismatch; no database touched.');
  process.exit(1);
}
const tenantId=state.tenant.id;
const scopedKinds=['projects','assets','endpoints','tickets','jobs','amcs',
  'crmOpportunities','quotes','leads','proposals','rmaClaims'];
const ownerKinds=['invoices','marketplaceDisputes','knowledgeArticles','inventoryTransactions',
  'products','suppliers','rfqs','telegramMessages','licenses','providers','workflows','connectors'];
const rowsByKind=Object.fromEntries(scopedKinds.map(k=>[k,Array.isArray(state[k])?state[k]:[]]));
const validUsers=new Map((state.users||[]).map(u=>[u.id,u]));
const customers=new Map((state.customers||[]).map(c=>[c.id,c]));
const seen=new Set();
const ensure=(ok,why)=>{if(!ok)throw Error('Import refused: '+why);};
const staffId=(v,kind,id,field)=>{
  if(v==null || v==='')return null;
  ensure(typeof v==='string' && validUsers.has(v) && validUsers.get(v).tenantId===tenantId,
    kind+'/'+id+' has unverified '+field);
  return v;
};
function validate() {
  ensure(typeof tenantId==='string' && tenantId && typeof state.tenant.name==='string',
    'missing tenant identity');
  for(const user of state.users||[]) {
    ensure(user && typeof user.id==='string' && user.tenantId===tenantId &&
      typeof user.role==='string' && !seen.has('u:'+user.id),'duplicate or invalid user');
    seen.add('u:'+user.id);
  }
  for(const c of state.customers||[]) {
    ensure(c && typeof c.id==='string' && c.tenantId===tenantId &&
      typeof c.name==='string' && !seen.has('c:'+c.id),'duplicate or invalid customer');
    seen.add('c:'+c.id);
  }
  for(const kind of scopedKinds)for(const row of rowsByKind[kind]) {
    ensure(row && typeof row.id==='string' && row.id && !seen.has(kind+':'+row.id),
      'duplicate/missing '+kind+' record ID');
    seen.add(kind+':'+row.id);
    const parent=kind==='proposals'?rowsByKind.projects.find(p=>p.id===row.projectId):
      kind==='rmaClaims'?rowsByKind.assets.find(a=>a.id===row.assetId):null;
    const cust=parent?.customerId || row.customerId;
    ensure(typeof cust==='string' && customers.has(cust),kind+'/'+row.id+' missing registered customer');
    if(row.customerId)ensure(row.customerId===cust,'cross-customer link '+kind+'/'+row.id);
    if(row.tenantId)ensure(row.tenantId===tenantId,'forged tenantId in '+kind+'/'+row.id);
    const expectedName=customers.get(cust).name;
    if(['projects','crmOpportunities','amcs'].includes(kind) && row.clientName)
      ensure(row.clientName===expectedName,'customer-name conflict in '+kind+'/'+row.id);
    if(['jobs','quotes','leads'].includes(kind)) {
      const displayName=kind==='leads'?row.companyName:row.customerName;
      if(displayName)ensure(displayName===expectedName,'customer-name conflict in '+kind+'/'+row.id);
    }
    if(kind==='proposals'||kind==='rmaClaims')ensure(!!parent,'orphan '+kind+'/'+row.id);
    staffId(row.createdByUserId,kind,row.id,'createdByUserId');
    staffId(row.assignedUserId,kind,row.id,'assignedUserId');
    staffId(row.reportedByUserId,kind,row.id,'reportedByUserId');
    if(kind==='projects')for(const collaborator of row.collaboratorUserIds||[]){
      staffId(collaborator,kind,row.id,'collaborator');
      ensure((customers.get(cust).staffUserIds||[]).includes(collaborator),
        'project collaborator missing customer grant '+row.id);
    }
  }
  for(const kind of ownerKinds)for(const row of state[kind]||[]){
    ensure(row && typeof row.id==='string' && row.id && !seen.has(kind+':'+row.id),
      'duplicate/missing owner-only '+kind+' ID');
    seen.add(kind+':'+row.id);
  }
  for(const row of state.events||[]){
    ensure(row && typeof row.id==='string' && row.id && !seen.has('event:'+row.id),
      'duplicate/missing event ID');
    seen.add('event:'+row.id);
  }
}
try{validate();}catch(err){console.error(err.message+'; no DB was accessed.');process.exit(1);}
const report={
  sourceSha256:sha,tenantId,customers:customers.size,staff:(state.users||[]).length,
  customerRows:Object.fromEntries(scopedKinds.map(k=>[k,rowsByKind[k].length])),
  ownerOnlyRows:Object.fromEntries(ownerKinds.map(k=>[k,(state[k]||[]).length])),
  auditEvents:(state.events||[]).length
};
if(!apply){
  console.log(JSON.stringify({...report,mode:'dry-run',databaseChanged:false},null,2));
  process.exit(0);
}
if(process.env.APEX_PG_STAGING_ACK!=='STAGING_ONLY_NO_PRODUCTION' ||
   !/^apex_stage_[a-z0-9_]{2,60}$/.test(process.env.PGDATABASE||'') ||
   !['127.0.0.1','localhost'].includes(process.env.PGHOST||'') ||
   process.env.DATABASE_URL || process.env.APEX_PG_RUNTIME_ENABLED) {
  console.error('Local staging guard refused: PGHOST localhost, PGDATABASE apex_stage_*, explicit ACK, no DATABASE_URL.');
  process.exit(2);
}
const client=new pg.Client({
  host:process.env.PGHOST,port:Number(process.env.PGPORT||5432),
  database:process.env.PGDATABASE,user:process.env.PGUSER,
  password:process.env.PGPASSWORD,connectionTimeoutMillis:3000
});
let transaction=false;
try {
  await client.connect();
  const db=await client.query('SELECT current_database() AS db');
  ensure(db.rows[0].db===process.env.PGDATABASE,'database mismatch');
  const marker=await client.query("SELECT stage_only FROM apex.schema_versions WHERE version='10.1-staging'");
  ensure(marker.rowCount===1 && marker.rows[0].stage_only,'staging schema marker absent');
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  transaction=true;
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['apex-phase10-stage']);
  const existing=await client.query('SELECT count(*)::integer AS n FROM apex.tenants');
  ensure(existing.rows[0].n===0,'nonempty staging DB; no merge/overwrite allowed');
  await client.query('INSERT INTO apex.tenants(tenant_id,display_name) VALUES ($1,$2)',
    [tenantId,state.tenant.name]);
  for(const u of state.users||[]){
    await client.query('INSERT INTO apex.staff(tenant_id,staff_id,role,disabled_at) VALUES ($1,$2,$3,$4)',
      [tenantId,u.id,u.role,u.disabledAt||null]);
  }
  for(const c of state.customers||[]){
    await client.query('INSERT INTO apex.customers(tenant_id,customer_id,display_name) VALUES ($1,$2,$3)',
      [tenantId,c.id,c.name]);
    for(const id of c.staffUserIds||[]){
      await client.query('INSERT INTO apex.customer_grants(tenant_id,customer_id,staff_id) VALUES ($1,$2,$3)',
        [tenantId,c.id,id]);
    }
  }
  const order=['projects','assets',...scopedKinds.filter(k=>!['projects','assets'].includes(k))];
  for(const kind of order)for(const row of rowsByKind[kind]){
    const parent=kind==='proposals'?rowsByKind.projects.find(p=>p.id===row.projectId):
      kind==='rmaClaims'?rowsByKind.assets.find(a=>a.id===row.assetId):null;
    const customerId=parent?.customerId||row.customerId;
    const relatedKind=kind==='proposals'?'projects':kind==='rmaClaims'?'assets':null;
    const relatedId=kind==='proposals'?row.projectId:kind==='rmaClaims'?row.assetId:null;
    await client.query('INSERT INTO apex.customer_records '+
      '(tenant_id,customer_id,kind,source_id,payload,created_by_staff_id,assigned_staff_id,'+
      'reported_by_staff_id,related_kind,related_id) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10)',
      [tenantId,customerId,kind,row.id,JSON.stringify(row),
       staffId(row.createdByUserId,kind,row.id,'creator'),
       staffId(row.assignedUserId,kind,row.id,'assignee'),
       staffId(row.reportedByUserId,kind,row.id,'reporter'),relatedKind,relatedId]);
  }
  for(const p of rowsByKind.projects)for(const id of p.collaboratorUserIds||[]){
    await client.query('INSERT INTO apex.project_shares(tenant_id,customer_id,project_id,staff_id) VALUES ($1,$2,$3,$4)',
      [tenantId,p.customerId,p.id,id]);
  }
  for(const kind of ownerKinds)for(const row of state[kind]||[]){
    await client.query('INSERT INTO apex.owner_legacy_records(tenant_id,kind,source_id,payload) VALUES ($1,$2,$3,$4::jsonb)',
      [tenantId,kind,row.id,JSON.stringify(row)]);
  }
  for(const ev of state.events||[]){
    await client.query('INSERT INTO apex.audit_events(tenant_id,event_id,event_data) VALUES ($1,$2,$3::jsonb)',
      [tenantId,ev.id,JSON.stringify(ev)]);
  }
  await client.query('INSERT INTO apex.staging_imports(tenant_id,sha256,snapshot_counts) VALUES ($1,$2,$3::jsonb)',
    [tenantId,sha,JSON.stringify(report)]);
  const actual=await client.query('SELECT count(*)::integer AS n FROM apex.customer_records');
  ensure(actual.rows[0].n===scopedKinds.reduce((n,k)=>n+rowsByKind[k].length,0),
    'count reconciliation mismatch');
  ensure(crypto.createHash('sha256').update(fs.readFileSync(real)).digest('hex')===sha,
    'source changed during transaction');
  await client.query('COMMIT');transaction=false;
  console.log(JSON.stringify({...report,stagingCommitted:true,
    warning:'No Express DB cutover; this is staging only.'},null,2));
} catch(err) {
  if(transaction)try{await client.query('ROLLBACK');}catch{}
  console.error('Staging import rejected and rolled back: '+err.message);
  process.exitCode=1;
} finally {await client.end().catch(()=>{});}
