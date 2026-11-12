#!/usr/bin/env node
// Phase 10.5F: independent, read-only source/restore evidence. Never restores DBs.
// CI owns disposable pg_dump/pg_restore and controlled tamper/second restore.
import pg from 'pg';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const e=process.env;
const names=[
  'schema_versions','pilot_context_secrets',
  'tenants','staff','customers','customer_grants','customer_records',
  'project_shares','owner_legacy_records','audit_events','staging_imports',
  'pilot_audit_events','pilot_procurement_drafts','pilot_finance_previews',
  'pilot_request_keys','pilot_service_work_orders','pilot_service_work_order_events',
  'pilot_service_outbox'
];
const forced=names.filter(x=>!['schema_versions','pilot_context_secrets'].includes(x));
const markers=[
  '10.1-staging','10.2-pilot','10.3a-context-domain','10.3b-field-assets',
  '10.4a-commerce-drafts','10.5a-idempotent-drafts',
  '10.5b-normalized-service','10.5c-shadow-outbox'
];
if(process.argv.length!==2 || e.NODE_ENV==='production' ||
  e.APEX_PG_STAGING_ACK!=='STAGING_ONLY_NO_PRODUCTION' ||
  e.APEX_PG_REHEARSAL_ACK!=='DISPOSABLE_RESTORED_COPY_ONLY' ||
  !['localhost','127.0.0.1'].includes(e.PGHOST||'') ||
  !/^apex_stage_[a-z0-9_]{2,60}$/.test(e.PGDATABASE||'') ||
  !/^apex_stage_[a-z0-9_]{2,60}$/.test(e.PGRESTORE_DATABASE||'') ||
  e.PGDATABASE===e.PGRESTORE_DATABASE || e.DATABASE_URL ||
  e.APEX_PG_RUNTIME_ENABLED){
  console.error('REHEARSAL EVIDENCE REFUSED: explicit separate disposable staging DBs required');
  process.exit(2);
}
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?
  Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const dataHash=rows=>sha(JSON.stringify(rows.map(canonical).map(JSON.stringify).sort()));
const connectSettings={
  host:e.PGHOST,port:Number(e.PGPORT||5432),user:e.PGUSER,
  password:e.PGPASSWORD,connectionTimeoutMillis:4000,statement_timeout:12000
};
const source=new pg.Client({...connectSettings,database:e.PGDATABASE});
const restored=new pg.Client({...connectSettings,database:e.PGRESTORE_DATABASE});
const active=[];
async function start(client,database){
  await client.connect();active.push(client);
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const q=await client.query(
    "SELECT current_database() AS db,current_setting('server_version_num')::integer AS v");
  assert.equal(q.rows[0].db,database,'database connection points at wrong target');
  assert.ok(q.rows[0].v>=160000&&q.rows[0].v<170000,'PostgreSQL 16 expected');
  const ro=await client.query('SHOW transaction_read_only');
  assert.equal(ro.rows[0].transaction_read_only,'on','read only transaction required');
}
async function snapshot(client){
  const rls=(await client.query(
    "SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity "+
    "FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "+
    "WHERE n.nspname='apex' AND c.relkind='r' ORDER BY c.relname")).rows;
  assert.equal(rls.length,names.length,'unexpected staging table count');
  const byName=new Map(rls.map(x=>[x.relname,x]));
  for(const name of names){
    assert.ok(byName.has(name),'missing table '+name);
    if(forced.includes(name))
      assert.ok(byName.get(name).relrowsecurity && byName.get(name).relforcerowsecurity,
        'FORCE RLS disabled on '+name);
  }
  const policies=(await client.query(
    "SELECT tablename,policyname,permissive,roles,cmd,qual,with_check "+
    "FROM pg_policies WHERE schemaname='apex' ORDER BY tablename,policyname")).rows;
  const constraints=(await client.query(
    "SELECT rel.relname AS tablename, con.conname,con.contype,"+
    "pg_get_constraintdef(con.oid,true) AS definition "+
    "FROM pg_constraint con JOIN pg_class rel ON rel.oid=con.conrelid "+
    "JOIN pg_namespace ns ON ns.oid=rel.relnamespace "+
    "WHERE ns.nspname='apex' ORDER BY rel.relname,con.conname")).rows;
  const indexDefs=(await client.query(
    "SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='apex' "+
    "ORDER BY tablename,indexname")).rows;
  const tableHashes={};
  const counts={};
  for(const name of names){ // Safe hardcoded table identifiers, never user-provided.
    const rows=(await client.query('SELECT * FROM apex.'+name)).rows;
    tableHashes[name]=dataHash(rows);
    counts[name]=rows.length;
  }
  const rows=(await client.query(
    'SELECT version,stage_only FROM apex.schema_versions')).rows;
  assert.ok(markers.every(v=>rows.some(x=>x.version===v&&x.stage_only===true)),
    'staging migration version marker missing');
  const provenance=(await client.query(
    'SELECT tenant_id,sha256 FROM apex.staging_imports')).rows;
  assert.equal(provenance.length,1,'one authoritative source provenance is required');
  assert.match(provenance[0].sha256,/^[0-9a-f]{64}$/);
  const schemaHash=dataHash([rls,policies,constraints,indexDefs]);
  return {tableHashes,counts,schemaHash,sourceSha256:provenance[0].sha256,
    sourceTenantKeySha256:sha(provenance[0].tenant_id)};
}
try{
  await start(source,e.PGDATABASE);
  await start(restored,e.PGRESTORE_DATABASE);
  const left=await snapshot(source),right=await snapshot(restored);
  assert.equal(left.schemaHash,right.schemaHash,'restored RLS/policy/constraint/index drift');
  assert.deepEqual(right.counts,left.counts,'restored table counts differ');
  assert.deepEqual(right.tableHashes,left.tableHashes,
    'restored table content mismatch (possible corruption or incomplete recovery)');
  assert.equal(left.sourceSha256,right.sourceSha256,'historical provenance mismatch');
  const datasetSha256=dataHash(Object.entries(left.tableHashes));
  console.log(JSON.stringify({
    mode:'INDEPENDENT_DISPOSABLE_RESTORE_REHEARSAL_EVIDENCE',
    verified:true,sourceDatabaseSnapshotSha256:datasetSha256,
    originalSourceSha256:left.sourceSha256,
    importTenantKeySha256:left.sourceTenantKeySha256,
    tableCount:names.length,forcedRlsTableCount:forced.length,
    migrationMarkerCount:markers.length,schemaSha256:left.schemaHash,
    tableRecordCounts:left.counts,sqlReadOnly:true,productionCutoverReady:false,
    restoreEqual:true,rollbackAcceptance:'DISPOSABLE_REHEARSAL_ONLY',
    noCustomerMigrationApplied:true
  }));
  await source.query('ROLLBACK');
  await restored.query('ROLLBACK');
}catch(err){
  console.error('REHEARSAL EVIDENCE MISMATCH: '+err.message);
  process.exitCode=1;
}finally{
  for(const client of active){
    await client.query('ROLLBACK').catch(()=>{});
    await client.end().catch(()=>{});
  }
}
