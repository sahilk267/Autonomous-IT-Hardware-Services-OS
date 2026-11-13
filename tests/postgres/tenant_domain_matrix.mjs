// Phase 10.5F: independent multi-domain/multi-tenant SQL isolation acceptance.
// Two disposable tenants, identical business IDs, six role types, forced signed RLS.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';

const e=process.env;
if(e.NODE_ENV==='production'||e.DATABASE_URL||e.APEX_PG_RUNTIME_ENABLED||
  e.APEX_PG_STAGING_ACK!=='STAGING_ONLY_NO_PRODUCTION'||
  e.APEX_PG_PILOT_ACK!=='LOCAL_STAGING_ONLY_NO_CUTOVER'||
  !['127.0.0.1','localhost'].includes(e.PGHOST||'')||
  !/^apex_stage_[a-z0-9_]{2,60}$/.test(e.PGDATABASE||'')||
  e.APEX_PG_PILOT_DB!==e.PGDATABASE || e.APEX_PG_PILOT_HOST!==e.PGHOST ||
  !/^[0-9a-f]{64}$/.test(e.APEX_PG_PILOT_CONTEXT_KEY||''))
  throw Error('TENANT DOMAIN MATRIX REFUSED: signed disposable local PostgreSQL only');
const settings={host:e.PGHOST,port:Number(e.PGPORT||5432),database:e.PGDATABASE};
const admin=new pg.Client({...settings,user:e.PGUSER,password:e.PGPASSWORD});
const actorClient=new pg.Client({...settings,
  user:e.APEX_PG_PILOT_USER,password:e.APEX_PG_PILOT_PASSWORD});
const suffix=crypto.randomBytes(6).toString('hex');
const tenants=['tenant-f-a-'+suffix,'tenant-f-b-'+suffix];
const roles={owner:'BUSINESS_OWNER',sales:'SALES_MANAGER',proc:'PROCUREMENT_LEAD',
  it:'ENTERPRISE_IT_HEAD',field:'FIELD_ENGINEER',disabled:'SALES_MANAGER'};
const kinds=['crmOpportunities','projects','assets','tickets','jobs','quotes'];
const custs=['shared','private'];
const actor=(tenant,role)=>role+'-'+tenant;
const signed=(tenant,id,tx,backend)=>crypto.createHmac('sha256',
  Buffer.from(e.APEX_PG_PILOT_CONTEXT_KEY,'hex')
).update([tenant,id,tx,backend].join('\n')).digest('hex');
let passed=0,created=[],connected=false;
const test=(name,fn)=>{fn();passed++;console.log('PASS '+name);};
async function contextual(client,tenant,id,fn,{readOnly=true,invalidSignature=false}={}){
  await client.query(readOnly?'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY':'BEGIN');
  try{
    const nonce=(await client.query(
      'SELECT txid_current()::text AS txid,pg_backend_pid()::text AS backend')).rows[0];
    if(client===actorClient)await client.query('SET LOCAL ROLE apex_pilot_writer');
    await client.query("SELECT set_config('apex.tenant_id',$1,true)",[tenant]);
    await client.query("SELECT set_config('apex.actor_id',$1,true)",[id]);
    await client.query("SELECT set_config('apex.context_signature',$1,true)",
      [invalidSignature?'0'.repeat(64):signed(tenant,id,nonce.txid,nonce.backend)]);
    const result=await fn(client);
    await client.query('ROLLBACK'); // Even successful authenticated probes never write.
    return result;
  }catch(err){await client.query('ROLLBACK').catch(()=>{});throw err;}
}
async function ownerWrite(tenant,fn){
  await admin.query('BEGIN');
  try{
    const nonce=(await admin.query(
      'SELECT txid_current()::text AS txid,pg_backend_pid()::text AS backend')).rows[0];
    await admin.query("SELECT set_config('apex.tenant_id',$1,true)",[tenant]);
    await admin.query("SELECT set_config('apex.actor_id',$1,true)",[actor(tenant,'owner')]);
    await admin.query("SELECT set_config('apex.context_signature',$1,true)",
      [signed(tenant,actor(tenant,'owner'),nonce.txid,nonce.backend)]);
    await fn();
    await admin.query('COMMIT');
  }catch(err){await admin.query('ROLLBACK').catch(()=>{});throw err;}
}
async function setup(tenant,label){
  await admin.query('INSERT INTO apex.tenants(tenant_id,display_name) VALUES($1,$2)',
    [tenant,'Phase 10.5F fixture '+label]);
  created.push(tenant);
  for(const [id,role] of Object.entries(roles)){
    await admin.query('INSERT INTO apex.staff(tenant_id,staff_id,role,disabled_at) VALUES($1,$2,$3,$4)',
      [tenant,actor(tenant,id),role,id==='disabled'?'2026-11-12T00:00:00Z':null]);
  }
  await ownerWrite(tenant,async()=>{
    for(const c of custs){
      const customerId='matrix-'+c;
      await admin.query(
        'INSERT INTO apex.customers(tenant_id,customer_id,display_name) VALUES($1,$2,$3)',
        [tenant,customerId,'Matrix '+label+' '+c]);
      for(const role of c==='shared'?['sales','proc','it','field']:['it']){
        await admin.query(
          'INSERT INTO apex.customer_grants(tenant_id,customer_id,staff_id) VALUES($1,$2,$3)',
          [tenant,customerId,actor(tenant,role)]);
      }
      for(const kind of kinds){
        const id='matrix-'+kind+'-'+c;
        const assigned=['assets','tickets','jobs'].includes(kind)&&c==='shared'
          ?actor(tenant,'field'):null;
        const payload={id,customerId,title:label+' '+kind+' '+c,
          ...(assigned?{assignedUserId:assigned}:{}),
          ...(kind==='assets'?{status:'AVAILABLE_IN_STOCK'}:{}),
          ...(kind==='jobs'?{status:'SCHEDULED'}:{}),
          ...(kind==='quotes'?{status:'DRAFT',taxStatus:'PENDING_CLASSIFICATION',
            createdByUserId:actor(tenant,'owner'),subtotal:42}:{}),
          ...(kind==='tickets'?{status:'OPEN'}:{})};
        await admin.query(
          'INSERT INTO apex.customer_records(tenant_id,customer_id,kind,source_id,payload,'+
          'created_by_staff_id,assigned_staff_id) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7)',
          [tenant,customerId,kind,id,JSON.stringify(payload),
            actor(tenant,'owner'),assigned]);
      }
    }
    await admin.query(
      'INSERT INTO apex.project_shares(tenant_id,customer_id,project_id,staff_id) VALUES($1,$2,$3,$4)',
      [tenant,'matrix-shared','matrix-projects-shared',actor(tenant,'sales')]);
  });
}
async function visible(tenant,role,kind,opts={}){
  return contextual(actorClient,opts.tenantContext||tenant,
    actor(tenant,role),async client=>{
      const sql=await client.query(
        'SELECT tenant_id,customer_id,source_id,payload FROM apex.customer_records '+
        'WHERE kind=$1 ORDER BY source_id',[kind]);
      return sql.rows;
    },{invalidSignature:opts.invalidSignature});
}
try{
  await admin.connect();await actorClient.connect();connected=true;
  for(let i=0;i<tenants.length;i++)await setup(tenants[i],String.fromCharCode(65+i));
  const [a,b]=tenants;
  for(const tenant of tenants){
    for(const kind of kinds){
      const rows=await visible(tenant,'owner',kind);
      test('Owner signed RLS isolates '+kind+' in '+tenant.slice(0,10),()=>{
        assert.equal(rows.length,2);
        assert.ok(rows.every(r=>r.tenant_id===tenant &&
          r.payload.title.startsWith(tenant===a?'A ':'B ')));
      });
    }
    const expectations={
      sales:{crmOpportunities:1,projects:1,assets:0,tickets:0,jobs:0,quotes:1},
      proc:{crmOpportunities:0,projects:0,assets:1,tickets:0,jobs:0,quotes:1},
      it:{crmOpportunities:0,projects:0,assets:2,tickets:2,jobs:2,quotes:0},
      field:{crmOpportunities:0,projects:0,assets:1,tickets:1,jobs:1,quotes:0},
      disabled:{crmOpportunities:0,projects:0,assets:0,tickets:0,jobs:0,quotes:0}
    };
    for(const [role,types] of Object.entries(expectations)){
      for(const [kind,count] of Object.entries(types)){
        const rows=await visible(tenant,role,kind);
        test(role+' '+kind+' is RLS-authorized in '+(tenant===a?'A':'B'),()=>{
          assert.equal(rows.length,count,JSON.stringify(rows.map(x=>x.source_id)));
          assert.ok(rows.every(r=>r.tenant_id===tenant));
        });
      }
    }
  }
  const signedSwap=await visible(a,'owner','crmOpportunities',{tenantContext:b});
  test('Cross-tenant ID substitution with a different signed tenant is rejected',()=>{
    assert.equal(signedSwap.length,0);
  });
  const invalid=await visible(a,'owner','assets',{invalidSignature:true});
  test('Unsigned/invalid HMAC context cannot enumerate tenant-owned assets',()=>{
    assert.equal(invalid.length,0);
  });
  await assert.rejects(contextual(actorClient,a,actor(a,'owner'),client=>
    client.query(
      'INSERT INTO apex.customer_records(tenant_id,customer_id,kind,source_id,payload,created_by_staff_id) '+
      'VALUES($1,$2,$3,$4,$5::jsonb,$6)',
      [b,'matrix-shared','crmOpportunities','forged-cross-tenant',
        JSON.stringify({id:'forged-cross-tenant',customerId:'matrix-shared'}),
        actor(a,'owner')]
    ),{readOnly:false}),err=>err.code==='42501'||err.code==='23503');
  test('Authenticated tenant A writer cannot create a record inside tenant B',()=>{});
  await assert.rejects(contextual(actorClient,a,actor(a,'owner'),client=>
    client.query(
      "UPDATE apex.customer_records SET customer_id='matrix-private' "+
      "WHERE tenant_id=$1 AND kind='crmOpportunities' AND source_id='matrix-crmOpportunities-shared'",
      [a]
    ),{readOnly:false}),err=>err.code==='42501');
  test('Authenticated writer lacks SQL privilege to move customer ownership',()=>{});

  await ownerWrite(a,async()=>{
    await admin.query(
      "DELETE FROM apex.customer_grants WHERE tenant_id=$1 AND customer_id='matrix-shared' AND staff_id=$2",
      [a,actor(a,'field')]);
  });
  for(const kind of ['assets','jobs','tickets']){
    const x=await visible(a,'field',kind),y=await visible(b,'field',kind);
    test('Revoked field role cannot read '+kind+' of A; B remains unaffected',()=>{
      assert.equal(x.length,0);assert.equal(y.length,1);
    });
  }
  console.log('PHASE 10.5F TENANT DOMAIN MATRIX '+passed+'/'+passed+' PASS');
}finally{
  // Staging tests may deliberately fail; cleanup cannot touch the imported tenant.
  for(const tenant of created){
    try{
      await ownerWrite(tenant,async()=>{
        await admin.query('DELETE FROM apex.project_shares WHERE tenant_id=$1',[tenant]);
        await admin.query('DELETE FROM apex.customer_records WHERE tenant_id=$1',[tenant]);
        await admin.query('DELETE FROM apex.customer_grants WHERE tenant_id=$1',[tenant]);
        await admin.query('DELETE FROM apex.pilot_audit_events WHERE tenant_id=$1',[tenant]);
        await admin.query('DELETE FROM apex.customers WHERE tenant_id=$1',[tenant]);
        await admin.query('DELETE FROM apex.staff WHERE tenant_id=$1',[tenant]);
        await admin.query('DELETE FROM apex.tenants WHERE tenant_id=$1',[tenant]);
      });
    }catch(err){console.error('Disposable matrix cleanup failed: '+err.message);}
  }
  if(connected){await actorClient.end().catch(()=>{});await admin.end().catch(()=>{});}
}
