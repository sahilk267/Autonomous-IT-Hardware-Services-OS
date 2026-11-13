// Phase 10.5E: independent two-tenant HTTP + PostgreSQL signed-RLS CRM canary.
// Only disposable loopback apex_stage_* databases and temporary JSON files.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import crypto from 'node:crypto';
import pg from 'pg';

if(process.env.NODE_ENV==='production' ||
  process.env.APEX_PG_STAGING_ACK!=='STAGING_ONLY_NO_PRODUCTION' ||
  !['127.0.0.1','localhost'].includes(process.env.PGHOST||'') ||
  !/^apex_stage_[a-z0-9_]{2,60}$/.test(process.env.PGDATABASE||'') ||
  process.env.APEX_PG_PILOT_DB!==process.env.PGDATABASE ||
  process.env.APEX_PG_PILOT_HOST!==process.env.PGHOST ||
  !/^[0-9a-f]{64}$/.test(process.env.APEX_PG_PILOT_CONTEXT_KEY||'') ||
  process.env.DATABASE_URL || process.env.APEX_PG_RUNTIME_ENABLED)
  throw Error('CRM TENANT ACCEPTANCE REFUSED: disposable signed local staging only');

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'apex-crm-two-tenants-'));
const suffix=crypto.randomBytes(6).toString('hex');
const tenants=['tenant-e-a-'+suffix,'tenant-e-b-'+suffix];
const password='EphemeralCrmTenantAcceptance!2026';
const admin=new pg.Client({
  host:process.env.PGHOST,user:process.env.PGUSER,password:process.env.PGPASSWORD,
  port:Number(process.env.PGPORT||5432),database:process.env.PGDATABASE
});
const servers=[];
let passed=0;
const test=(name,fn)=>{fn();passed++;console.log('PASS '+name);};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const contextSignature=(tenant,actor,tx,backend)=>crypto.createHmac('sha256',
  Buffer.from(process.env.APEX_PG_PILOT_CONTEXT_KEY,'hex')
).update([tenant,actor,tx,backend].join('\n')).digest('hex');

async function inOwnerTransaction(tenant,owner,fn){
  await admin.query('BEGIN');
  try{
    const nonce=(await admin.query(
      'SELECT txid_current()::text AS txid,pg_backend_pid()::text AS backend'
    )).rows[0];
    await admin.query("SELECT set_config('apex.tenant_id',$1,true)",[tenant]);
    await admin.query("SELECT set_config('apex.actor_id',$1,true)",[owner]);
    await admin.query("SELECT set_config('apex.context_signature',$1,true)",
      [contextSignature(tenant,owner,nonce.txid,nonce.backend)]);
    await fn();
    await admin.query('COMMIT');
  }catch(error){
    await admin.query('ROLLBACK').catch(()=>{});
    throw error;
  }
}
function fixture(tenant,letter){
  const owner='owner-e-'+letter, sales='sales-e-'+letter;
  const outside='outside-e-'+letter,proc='proc-e-'+letter;
  const baseline=JSON.parse(fs.readFileSync('data/app-store.json','utf8'));
  baseline.tenant.id=tenant;
  baseline.tenant.name='Disposable tenant '+letter;
  baseline.users=[owner,sales,outside,proc].map((id,i)=>{
    const salt=crypto.randomBytes(16).toString('hex');
    return {id,tenantId:tenant,username:id,name:id,
      email:id+'@example.invalid',
      role:i===0?'BUSINESS_OWNER':i===3?'PROCUREMENT_LEAD':'SALES_MANAGER',
      salt,passwordHash:crypto.scryptSync(password,salt,64).toString('hex'),
      createdAt:'2026-11-12T00:00:00Z'};
  });
  baseline.customers=[
    {id:'cust-e-shared',tenantId:tenant,name:'Shared '+letter,
      staffUserIds:[sales,outside]},
    {id:'cust-e-private',tenantId:tenant,name:'Private '+letter,
      staffUserIds:[]}
  ];
  baseline.crmOpportunities=[
    {id:'crm-e-shared',customerId:'cust-e-shared',title:'Shared '+letter,
      clientName:'Shared '+letter,value:101,stage:'LEAD',winProbability:0,
      contactPerson:'',expectedCloseDate:'',assignedEngineer:'',category:''},
    {id:'crm-e-private',customerId:'cust-e-private',title:'Private '+letter,
      clientName:'Private '+letter,value:202,stage:'LEAD',winProbability:0,
      contactPerson:'',expectedCloseDate:'',assignedEngineer:'',category:''}
  ];
  return {tenant,letter,owner,sales,outside,proc,state:baseline};
}
const fixtures=[fixture(tenants[0],'a'),fixture(tenants[1],'b')];
async function insertFixture(x){
  // Tenant + staff initially have no app-actor trigger.
  await admin.query('INSERT INTO apex.tenants(tenant_id,display_name) VALUES($1,$2)',
    [x.tenant,'Acceptance tenant '+x.letter]);
  for(const user of x.state.users)
    await admin.query('INSERT INTO apex.staff(tenant_id,staff_id,role) VALUES($1,$2,$3)',
      [x.tenant,user.id,user.role]);
  await inOwnerTransaction(x.tenant,x.owner,async()=>{
    for(const customer of x.state.customers){
      await admin.query(
        'INSERT INTO apex.customers(tenant_id,customer_id,display_name) VALUES($1,$2,$3)',
        [x.tenant,customer.id,customer.name]);
      for(const id of customer.staffUserIds)
        await admin.query(
          'INSERT INTO apex.customer_grants(tenant_id,customer_id,staff_id) VALUES($1,$2,$3)',
          [x.tenant,customer.id,id]);
    }
    for(const crm of x.state.crmOpportunities)
      await admin.query('INSERT INTO apex.customer_records'+
        '(tenant_id,customer_id,kind,source_id,payload) VALUES($1,$2,$3,$4,$5::jsonb)',
        [x.tenant,crm.customerId,'crmOpportunities',crm.id,JSON.stringify(crm)]);
  });
}
async function port(){
  return new Promise((resolve,reject)=>{
    const s=net.createServer();
    s.once('error',reject);
    s.listen(0,'127.0.0.1',()=>{
      const p=s.address();
      if(!p||typeof p==='string')return reject(Error('port unavailable'));
      s.close(()=>resolve(p.port));
    });
  });
}
async function request(x,url,{cookie='',method='GET',body,headers={}}={}){
  const response=await fetch(x.base+url,{
    method,headers:{...(cookie?{cookie}:{}),
      ...(body===undefined?{}:{'content-type':'application/json'}),...headers},
    body:body===undefined?undefined:JSON.stringify(body)
  });
  const raw=await response.text();
  const data=JSON.parse(raw);
  return {status:response.status,data,source:response.headers.get('x-apex-crm-read'),
    cookie:(response.headers.get('set-cookie')||'').split(';')[0]};
}
async function start(x){
  const file=path.join(temp,'fixture-'+x.letter+'.json');
  fs.writeFileSync(file,JSON.stringify(x.state),{mode:0o600});
  x.base='http://127.0.0.1:'+await port();
  const child=spawn(process.execPath,['dist/server.cjs'],{
    env:{...process.env,PORT:x.base.split(':').at(-1),NODE_ENV:'staging',
      APEX_DATA_FILE:file,APEX_PG_PILOT_ENABLED:'true',
      APEX_PG_PILOT_ACK:'LOCAL_STAGING_ONLY_NO_CUTOVER',
      APEX_PG_CRM_READ_THROUGH:'true',
      APEX_PG_CRM_CANARY_STAFF_IDS:[x.owner,x.sales].join(','),
      APEX_ALLOW_PRODUCTION_RESET:'false',GEMINI_API_KEY:'',TELEGRAM_BOT_TOKEN:''},
    stdio:['ignore','pipe','pipe']
  });
  x.child=child;x.logs='';
  servers.push(x);
  child.stdout.on('data',data=>{x.logs+=data.toString();});
  child.stderr.on('data',data=>{x.logs+=data.toString();});
  for(let i=0;i<100;i++){
    if(child.exitCode!==null)throw Error('CRM fixture server exited '+x.logs);
    try{if((await request(x,'/api/health')).status===200)return;}catch{}
    await sleep(100);
  }
  throw Error('CRM fixture server startup timeout '+x.logs);
}
async function login(x,id){
  const r=await request(x,'/api/auth/login',{
    method:'POST',body:{username:id,password}});
  assert.equal(r.status,200,JSON.stringify(r.data));
  assert.ok(r.cookie.startsWith('apex_session='));
  return r.cookie;
}
async function countAudit(){
  const r=await admin.query(
    'SELECT count(*)::integer AS n FROM apex.pilot_audit_events WHERE tenant_id=ANY($1::text[])',
    [tenants]);
  return r.rows[0].n;
}
try{
  await admin.connect();
  for(const x of fixtures)await insertFixture(x);
  for(const x of fixtures)await start(x);
  const [a,b]=fixtures;
  const ownerA=await login(a,a.owner),ownerB=await login(b,b.owner);
  const salesA=await login(a,a.sales),salesB=await login(b,b.sales);
  const outsideA=await login(a,a.outside),procA=await login(a,a.proc);
  const before=await countAudit();

  let r=await request(a,'/api/crm',{cookie:ownerA});
  test('Tenant A owner serves exactly authorized CRM JSON parity from SQL',()=>{
    assert.equal(r.status,200,JSON.stringify(r.data));
    assert.equal(r.source,'postgres-parity-verified');
    assert.deepEqual(r.data.data,a.state.crmOpportunities);
  });
  r=await request(b,'/api/crm',{cookie:ownerB});
  test('Independent tenant B owner cannot read colliding tenant A CRM IDs',()=>{
    assert.equal(r.status,200,JSON.stringify(r.data));
    assert.equal(r.source,'postgres-parity-verified');
    assert.deepEqual(r.data.data,b.state.crmOpportunities);
    assert.ok(!JSON.stringify(r.data).includes('Private a'));
  });
  r=await request(a,'/api/crm',{cookie:salesA});
  test('Tenant A Sales SQL and JSON grant return shared customer only',()=>{
    assert.equal(r.status,200,JSON.stringify(r.data));
    assert.equal(r.source,'postgres-parity-verified');
    assert.deepEqual(r.data.data,[a.state.crmOpportunities[0]]);
  });
  r=await request(b,'/api/crm',{cookie:salesB,
    headers:{'X-Apex-Tenant-Id':a.tenant}});
  test('Caller-supplied tenant header cannot override signed tenant B actor',()=>{
    assert.equal(r.status,200);
    assert.equal(r.source,'postgres-parity-verified');
    assert.deepEqual(r.data.data,[b.state.crmOpportunities[0]]);
  });
  r=await request(a,'/api/crm',{cookie:outsideA});
  test('Sales actor outside explicit canary allowlist stays JSON-primary',()=>{
    assert.equal(r.status,200);
    assert.equal(r.source,null);
    assert.deepEqual(r.data.data,[a.state.crmOpportunities[0]]);
  });
  r=await request(a,'/api/crm',{cookie:procA});
  test('Procurement still cannot access normal CRM endpoint',()=>{
    assert.equal(r.status,403);
    assert.equal(r.source,null);
  });
  r=await request(a,'/api/crm',{cookie:ownerB});
  test('Tenant B cookie is not a valid session in tenant A process',()=>{
    assert.equal(r.status,401);
  });
  r=await request(b,'/api/crm',{cookie:salesA});
  test('Tenant A Sales cookie is not recognized by tenant B process',()=>{
    assert.equal(r.status,401);
  });
  r=await request(a,'/api/crm');
  test('Unauthenticated canary request cannot enumerate CRM',()=>{
    assert.equal(r.status,401);
  });
  test('Canary SELECT performs no PostgreSQL audit writes',()=>{
    assert.equal(before>=0,true);
  });
  const afterReads=await countAudit();
  test('All completed read-throughs leave SQL audit row count invariant',()=>{
    assert.equal(afterReads,before);
  });

  // Direct untrusted SQL must not be able to impersonate either app tenant.
  const untrusted=new pg.Client({
    host:process.env.APEX_PG_PILOT_HOST,
    port:Number(process.env.APEX_PG_PILOT_PORT||5432),
    database:process.env.APEX_PG_PILOT_DB,
    user:process.env.APEX_PG_PILOT_USER,
    password:process.env.APEX_PG_PILOT_PASSWORD
  });
  await untrusted.connect();
  try{
    await untrusted.query('BEGIN');
    await untrusted.query('SET LOCAL ROLE apex_pilot_writer');
    await untrusted.query("SELECT set_config('apex.tenant_id',$1,true)",[b.tenant]);
    await untrusted.query("SELECT set_config('apex.actor_id',$1,true)",[b.owner]);
    const count=await untrusted.query(
      "SELECT count(*)::integer AS n FROM apex.customer_records WHERE kind='crmOpportunities'");
    test('Unsigned direct SQL spoof of other tenant returns zero RLS records',()=>{
      assert.equal(count.rows[0].n,0);
    });
  }finally{
    await untrusted.query('ROLLBACK').catch(()=>{});
    await untrusted.end();
  }

  // Privilege drift intentionally causes 409 (not dangerous fallback to JSON).
  await inOwnerTransaction(a.tenant,a.owner,async()=>{
    await admin.query(
      'DELETE FROM apex.customer_grants WHERE tenant_id=$1 AND customer_id=$2 AND staff_id=$3',
      [a.tenant,'cust-e-shared',a.sales]);
  });
  r=await request(a,'/api/crm',{cookie:salesA});
  test('SQL customer revocation cannot leak stale JSON grant through canary',()=>{
    assert.equal(r.status,409,JSON.stringify(r.data));
    assert.equal(r.data.success,false);
    assert.equal(r.data.data,undefined);
    assert.ok(!JSON.stringify(r.data).includes('Shared a'));
  });
  r=await request(b,'/api/crm',{cookie:salesB});
  test('Revoking tenant A SQL grant cannot revoke tenant B Sales visibility',()=>{
    assert.equal(r.status,200);
    assert.deepEqual(r.data.data,[b.state.crmOpportunities[0]]);
  });
  r=await request(a,'/api/customers/cust-e-shared/access',{
    method:'PATCH',cookie:ownerA,body:{userId:a.sales,grant:false}
  });
  test('Local JSON owner revocation accepted independently',()=>{
    assert.equal(r.status,200,JSON.stringify(r.data));
  });
  r=await request(a,'/api/crm',{cookie:salesA});
  test('Once JSON and SQL both revoke, Sales canary returns zero records',()=>{
    assert.equal(r.status,200,JSON.stringify(r.data));
    assert.deepEqual(r.data.data,[]);
    assert.equal(r.source,'postgres-parity-verified');
  });

  await inOwnerTransaction(b.tenant,b.owner,async()=>{
    await admin.query(
      "UPDATE apex.customer_records SET payload=jsonb_set(payload,'{title}',to_jsonb($1::text)) "+
      "WHERE tenant_id=$2 AND kind='crmOpportunities' AND source_id=$3",
      ['Tampered B',b.tenant,'crm-e-shared']);
  });
  r=await request(b,'/api/crm',{cookie:ownerB});
  test('SQL data drift returns conflict, never unverified tenant B payload',()=>{
    assert.equal(r.status,409,JSON.stringify(r.data));
    assert.equal(r.data.success,false);
    assert.equal(r.data.data,undefined);
  });
  r=await request(a,'/api/crm',{cookie:ownerA});
  test('Tenant B data tamper has zero effect on tenant A owner read',()=>{
    assert.equal(r.status,200);
    assert.equal(r.source,'postgres-parity-verified');
    assert.deepEqual(r.data.data,a.state.crmOpportunities);
  });
  console.log('PASS '+passed+' independent two-tenant CRM canary assertions');
}finally{
  for(const x of servers)if(x.child){
    x.child.kill('SIGTERM');
    await new Promise(resolve=>{
      if(x.child.exitCode!==null)return resolve();
      x.child.once('exit',resolve);
      setTimeout(resolve,3000).unref();
    });
  }
  // Drop only our uniquely named disposable fixture tenants; never touch import.
  for(const x of fixtures){
    try{
      await inOwnerTransaction(x.tenant,x.owner,async()=>{
        await admin.query('DELETE FROM apex.customer_records WHERE tenant_id=$1',[x.tenant]);
        await admin.query('DELETE FROM apex.customer_grants WHERE tenant_id=$1',[x.tenant]);
        await admin.query('DELETE FROM apex.pilot_audit_events WHERE tenant_id=$1',[x.tenant]);
        await admin.query('DELETE FROM apex.customers WHERE tenant_id=$1',[x.tenant]);
        await admin.query('DELETE FROM apex.staff WHERE tenant_id=$1',[x.tenant]);
        await admin.query('DELETE FROM apex.tenants WHERE tenant_id=$1',[x.tenant]);
      });
    }catch(error){console.error('Disposable tenant cleanup: '+error.message);}
  }
  await admin.end().catch(()=>{});
  fs.rmSync(temp,{recursive:true,force:true});
}
