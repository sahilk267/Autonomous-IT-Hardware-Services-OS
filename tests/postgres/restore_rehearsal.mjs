// Phase 10.1 real PostgreSQL dump/restore acceptance, on disposable CI databases only.
// The original staging DB and restored staging DB are isolated; no production writes.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';

const settings={
  host:process.env.PGHOST,port:Number(process.env.PGPORT||5432),
  user:process.env.PGUSER,password:process.env.PGPASSWORD
};
const originalDb=process.env.PGDATABASE;
const restoredDb=process.env.PGRESTORE_DATABASE;
if(!/^apex_stage_[a-z0-9_]+$/.test(originalDb||'') ||
   !/^apex_stage_[a-z0-9_]+$/.test(restoredDb||'') ||
   originalDb===restoredDb ||
   process.env.APEX_PG_STAGING_ACK!=='STAGING_ONLY_NO_PRODUCTION' ||
   !['127.0.0.1','localhost'].includes(process.env.PGHOST||'') ||
   !/^[0-9a-f]{64}$/.test(process.env.APEX_PG_PILOT_CONTEXT_KEY||'')) {
  throw Error('Unsafe restore verification environment');
}
const a=new pg.Client({...settings,database:originalDb});
const b=new pg.Client({...settings,database:restoredDb});
let passed=0;
const check=(message,fn)=>{fn();passed++;console.log('PASS '+message);};
try {
  await a.connect();await b.connect();
  for(const [table,sort] of [
    ['tenants','tenant_id'],
    ['staff','tenant_id,staff_id'],
    ['customers','tenant_id,customer_id'],
    ['customer_grants','tenant_id,customer_id,staff_id'],
    ['customer_records','tenant_id,kind,source_id'],
    ['project_shares','tenant_id,project_id,staff_id'],
    ['owner_legacy_records','tenant_id,kind,source_id'],
    ['audit_events','tenant_id,event_id'],
    ['staging_imports','tenant_id'],
    ['pilot_audit_events','tenant_id,event_id'],
    ['pilot_procurement_drafts','tenant_id,draft_id'],
    ['pilot_finance_previews','tenant_id,preview_id']
  ]){
    const sql='SELECT row_to_json(r)::text AS row FROM (SELECT * FROM apex.'+table+' ORDER BY '+sort+') r';
    const [source,target]=await Promise.all([a.query(sql),b.query(sql)]);
    check('Restored '+table+' rows exactly match source',()=>{
      assert.deepEqual(target.rows,source.rows);
      assert.ok(source.rows.length>0,table+' must have actual fixture rows');
    });
  }
  const marker=await b.query("SELECT stage_only FROM apex.schema_versions WHERE version='10.1-staging'");
  check('Stage schema marker survived restore',()=>{
    assert.equal(marker.rowCount,1);
    assert.equal(marker.rows[0].stage_only,true);
  });
  const force=await b.query(
    "SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity FROM pg_class c "+
    "JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='apex' "+
    "AND c.relkind='r' AND c.relname IN "+
    "('tenants','staff','customers','customer_grants','customer_records','project_shares',"+
    "'owner_legacy_records','audit_events','staging_imports','pilot_audit_events','pilot_procurement_drafts','pilot_finance_previews')");
  check('Every restored business table still has FORCE RLS enabled',()=>{
    assert.equal(force.rows.length,12);
    assert.ok(force.rows.every(r=>r.relrowsecurity && r.relforcerowsecurity));
  });
  const reader=async(tenant,actor,query)=>{
    await b.query('BEGIN');
    try {
      if(tenant && actor) {
        const nonce=await b.query(
          'SELECT txid_current()::text AS txid,pg_backend_pid()::text AS backend');
        const payload=[tenant,actor,nonce.rows[0].txid,nonce.rows[0].backend].join('\n');
        const signature=crypto.createHmac('sha256',
          Buffer.from(process.env.APEX_PG_PILOT_CONTEXT_KEY,'hex')).update(payload).digest('hex');
        await b.query("SELECT set_config('apex.context_signature',$1,true)",[signature]);
      }
      await b.query('SET LOCAL ROLE apex_stage_reader');
      if(tenant)await b.query("SELECT set_config('apex.tenant_id',$1,true)",[tenant]);
      if(actor)await b.query("SELECT set_config('apex.actor_id',$1,true)",[actor]);
      const rows=(await b.query(query)).rows;
      await b.query('ROLLBACK');
      return rows;
    }catch(error){await b.query('ROLLBACK');throw error;}
  };
  const kindCount=async(t,u,k)=>Number((await reader(t,u,
    "SELECT count(*)::integer n FROM apex.customer_records WHERE kind='"+k+"'"))[0].n);
  const beforeRestoreReader=await kindCount('tenant-fixture-a','field-a','assets');
  check('Restored RLS still enforces field customer+assignment after revocation',()=>{
    assert.equal(beforeRestoreReader,1);
  });
  const salesProjects=await kindCount('tenant-fixture-a','sales-a','projects');
  check('Restored RLS preserves revoked sales grant and share cascade',()=>{
    assert.equal(salesProjects,0);
  });
  const crossTenant=await kindCount('tenant-fixture-b','owner-b','assets');
  check('Restored data preserves isolated second tenant and composite identity',()=>{
    assert.equal(crossTenant,1);
  });
  const noContext=await kindCount(null,null,'assets');
  check('Restored RLS denies all customer rows without context',()=>assert.equal(noContext,0));
  const storedContextKey=await b.query('SELECT count(*)::integer AS n FROM apex.pilot_context_secrets');
  check('Restore retains transaction attestation key for staging identity checks',()=>{
    assert.equal(storedContextKey.rows[0].n,1);
  });
  const importHash=await b.query('SELECT sha256 FROM apex.staging_imports');
  check('Restored provenance retains the original JSON SHA256',()=>{
    assert.match(importHash.rows[0].sha256,/^[0-9a-f]{64}$/);
  });
  console.log('POSTGRES RESTORE SUMMARY: '+passed+'/'+passed+' PASSED');
}finally{await a.end().catch(()=>{});await b.end().catch(()=>{});}
