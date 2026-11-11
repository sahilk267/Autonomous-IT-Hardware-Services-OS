// Phase 10.5B: independent Express instances, same disposable PG16 DB, normalized service.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import pg from 'pg';

if(process.env.APEX_PG_STAGING_ACK!=='STAGING_ONLY_NO_PRODUCTION' ||
  !['localhost','127.0.0.1'].includes(process.env.PGHOST||'') ||
  !/^apex_stage_[a-z0-9_]+$/.test(process.env.PGDATABASE||'') ||
  process.env.APEX_PG_PILOT_DB!==process.env.PGDATABASE ||
  !/^[0-9a-f]{64}$/.test(process.env.APEX_PG_PILOT_CONTEXT_KEY||'')) {
  throw Error('MULTI-INSTANCE TEST REFUSED: disposable local signed PostgreSQL only');
}
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'apex-workorder-instance-'));
const baseline=JSON.parse(fs.readFileSync('data/app-store.json','utf8'));
baseline.tenant.id='tenant-fixture-a';
baseline.tenant.name='Normalized PG Work-Order Fixture';
baseline.users=[];
const password='EphemeralWorkOrderOnly!2026';
for(const [name,role] of [
  ['owner-a','BUSINESS_OWNER'],['it-a','ENTERPRISE_IT_HEAD'],
  ['field-a','FIELD_ENGINEER'],['sales-a','SALES_MANAGER'],
  ['proc-a','PROCUREMENT_LEAD']
]){
  const salt=crypto.randomBytes(16).toString('hex');
  baseline.users.push({
    id:name,tenantId:'tenant-fixture-a',username:name,name,
    email:name+'@example.invalid',role,salt,
    passwordHash:crypto.scryptSync(password,salt,64).toString('hex'),
    createdAt:new Date().toISOString()
  });
}
let passed=0;
const test=(label,fn)=>{fn();passed++;console.log('PASS '+label);};
const servers=[];
const admin=new pg.Client({
  host:process.env.PGHOST,port:Number(process.env.PGPORT||5432),
  database:process.env.PGDATABASE,user:process.env.PGUSER,password:process.env.PGPASSWORD
});
async function freePort(){
  return await new Promise((resolve,reject)=>{
    const server=net.createServer();
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>{
      const address=server.address();
      if(!address||typeof address==='string')return reject(Error('bad free port'));
      server.close(()=>resolve(address.port));
    });
  });
}
async function request(instance,url,{method='GET',cookie='',body}={}){
  const result=await fetch(instance.base+url,{
    method,headers:{...(cookie?{cookie}:{}),
      ...(body===undefined?{}:{'content-type':'application/json'})},
    body:body===undefined?undefined:JSON.stringify(body)
  });
  const raw=await result.text();
  let json;
  try {json=JSON.parse(raw);} catch {throw Error('Non-JSON response '+result.status+': '+raw.slice(0,400));}
  return {status:result.status,data:json,cookie:(result.headers.get('set-cookie')||'').split(';')[0]};
}
async function startInstance(index){
  const file=path.join(dir,'private-'+index+'.json');
  fs.writeFileSync(file,JSON.stringify(baseline),{mode:0o600});
  const port=await freePort();
  const base='http://127.0.0.1:'+port;
  const child=spawn(process.execPath,['dist/server.cjs'],{
    env:{...process.env,NODE_ENV:'staging',PORT:String(port),
      APEX_DATA_FILE:file,APEX_PG_PILOT_ENABLED:'true',
      APEX_PG_PILOT_ACK:'LOCAL_STAGING_ONLY_NO_CUTOVER',
      APEX_ALLOW_PRODUCTION_RESET:'false',GEMINI_API_KEY:'',
      TELEGRAM_BOT_TOKEN:''},stdio:['ignore','pipe','pipe']
  });
  const instance={base,child,logs:''};
  servers.push(instance);
  child.stdout.on('data',x=>{instance.logs+=x.toString();});
  child.stderr.on('data',x=>{instance.logs+=x.toString();});
  for(let i=0;i<100;i++){
    if(child.exitCode!==null)throw Error('Instance '+index+' exited: '+instance.logs);
    try {if((await request(instance,'/api/health')).status===200)return instance;}catch{}
    await new Promise(resolve=>setTimeout(resolve,120));
  }
  throw Error('Instance '+index+' did not start: '+instance.logs);
}
async function login(instance,username){
  const result=await request(instance,'/api/auth/login',{
    method:'POST',body:{username,password}
  });
  assert.equal(result.status,200,JSON.stringify(result.data));
  assert.ok(result.cookie.startsWith('apex_session='));
  return result.cookie;
}
const id=()=> 'wko-http-'+crypto.randomUUID();
try {
  await admin.connect();
  const a=await startInstance(1),b=await startInstance(2);
  const ownerA=await login(a,'owner-a');
  const ownerB=await login(b,'owner-a');
  const itB=await login(b,'it-a');
  const engineerB=await login(b,'field-a');
  const salesB=await login(b,'sales-a');
  test('Two independent loopback processes authenticate distinct sessions into same DB',()=>{
    assert.notEqual(a.base,b.base);
    assert.notEqual(ownerA,ownerB);
  });

  let r=await request(a,'/api/pg-pilot/service-work-orders',{
    method:'POST',cookie:ownerA,
    body:{customerId:'cust-b',title:'Staged switch replacement diagnosis'}
  });
  test('Owner creates normalized SQL work order, version 1, no engineer',()=>{
    assert.equal(r.status,201,JSON.stringify(r.data));
    assert.equal(r.data.data.customerId,'cust-b');
    assert.equal(r.data.data.revision,1);
    assert.equal(r.data.data.status,'SCHEDULED');
    assert.equal(r.data.data.assignedUserId,null);
  });
  const orderId=r.data.data.id;
  r=await request(b,'/api/pg-pilot/service-work-orders',{cookie:ownerB});
  test('Independent server immediately reads SQL work order created by first server',()=>{
    assert.equal(r.status,200);
    assert.ok(r.data.data.some(w=>w.id===orderId));
  });
  r=await request(b,'/api/pg-pilot/service-work-orders',{cookie:salesB});
  test('Sales cannot enumerate restricted service ledger',()=>assert.equal(r.status,403));
  r=await request(b,'/api/pg-pilot/service-work-orders',{cookie:engineerB});
  test('Unassigned work order is invisible to field role',()=>{
    assert.ok(!r.data.data.some(w=>w.id===orderId));
  });
  r=await request(a,'/api/pg-pilot/service-work-orders/'+orderId+'/assign',{
    method:'PATCH',cookie:ownerA,body:{userId:'field-a',expectedVersion:1}
  });
  test('Manager cannot assign field engineer lacking customer-B grant',()=>assert.equal(r.status,403));
  r=await request(a,'/api/pg-pilot/service-work-orders/'+orderId+'/assign',{
    method:'PATCH',cookie:ownerA,body:{userId:'sales-a',expectedVersion:1}
  });
  test('Manager cannot assign a Sales user as an engineer',()=>assert.equal(r.status,403));
  r=await request(a,'/api/pg-pilot/customers/cust-b/access',{
    method:'PATCH',cookie:ownerA,body:{userId:'field-a',grant:true}
  });
  test('Owner explicitly grants field staff customer B',()=>assert.equal(r.status,200));

  r=await request(b,'/api/pg-pilot/service-work-orders/'+orderId+'/assign',{
    method:'PATCH',cookie:itB,body:{userId:'field-a',expectedVersion:1}
  });
  test('Independent IT Head server assigns customer-granted engineer, revision 2',()=>{
    assert.equal(r.status,200,JSON.stringify(r.data));
    assert.equal(r.data.data.revision,2);
    assert.equal(r.data.data.assignedUserId,'field-a');
  });
  r=await request(b,'/api/pg-pilot/service-work-orders',{cookie:engineerB});
  test('Engineer now sees exact assigned customer-B normalized work order',()=>{
    assert.ok(r.data.data.some(w=>w.id===orderId&&w.revision===2));
  });
  const route='/api/pg-pilot/service-work-orders/'+orderId+'/status';
  const simultaneous=await Promise.all([
    request(a,route,{method:'PATCH',cookie:ownerA,
      body:{status:'EN_ROUTE',expectedVersion:2}}),
    request(b,route,{method:'PATCH',cookie:engineerB,
      body:{status:'EN_ROUTE',expectedVersion:2}})
  ]);
  test('Two independent processes racing same version: one wins, one gets HTTP 409',()=>{
    assert.deepEqual(simultaneous.map(x=>x.status).sort((x,y)=>x-y),[200,409],
      JSON.stringify(simultaneous.map(x=>({status:x.status,data:x.data}))));
    assert.equal(simultaneous.find(x=>x.status===200).data.data.revision,3);
  });
  r=await request(b,'/api/pg-pilot/service-work-orders',{cookie:ownerB});
  test('Stale write did not double-increment the shared SQL revision',()=>{
    const w=r.data.data.find(x=>x.id===orderId);
    assert.equal(w.revision,3);
    assert.equal(w.status,'EN_ROUTE');
  });
  r=await request(b,route,{method:'PATCH',cookie:engineerB,
    body:{status:'DIAGNOSING',expectedVersion:3}});
  test('Skipping CHECKED_IN is denied by sequential service state gate',()=>{
    assert.equal(r.status,409);
  });
  r=await request(b,route,{method:'PATCH',cookie:engineerB,
    body:{status:'COMPLETED',expectedVersion:3}});
  test('No API path can claim customer signoff or completed work',()=>{
    assert.equal(r.status,400);
  });
  r=await request(b,route,{method:'PATCH',cookie:engineerB,
    body:{status:'CHECKED_IN',expectedVersion:3}});
  test('Engineer logs valid internal arrival at revision 4',()=>{
    assert.equal(r.status,200,JSON.stringify(r.data));
    assert.equal(r.data.data.revision,4);
  });
  r=await request(a,route,{method:'PATCH',cookie:ownerA,
    body:{status:'DIAGNOSING',expectedVersion:4}});
  test('Owner logs final internal diagnosis stage at revision 5',()=>{
    assert.equal(r.status,200,JSON.stringify(r.data));
    assert.equal(r.data.data.revision,5);
  });
  r=await request(a,'/api/pg-pilot/service-work-orders/'+orderId+'/history',{
    cookie:ownerA
  });
  test('SQL append-only normalized event ledger records exactly revisions 1 to 5',()=>{
    assert.equal(r.status,200);
    assert.deepEqual(r.data.data.map(x=>x.revision),[1,2,3,4,5]);
    assert.deepEqual(r.data.data.map(x=>x.operation),
      ['CREATE','ASSIGN','PROGRESS','PROGRESS','PROGRESS']);
  });
  r=await request(b,'/api/pg-pilot/service-work-orders/'+orderId+'/history',{
    cookie:engineerB
  });
  test('Field engineer cannot read owner-only full work-order event history',()=>{
    assert.equal(r.status,403);
  });
  const audit=await admin.query(
    "SELECT count(*)::integer n FROM apex.pilot_audit_events "+
    "WHERE entity='pilot_service_work_orders' AND object_id=$1",[orderId]);
  test('SQL audit creates one event per successful mutation, never for losing race',()=>{
    assert.equal(audit.rows[0].n,5);
  });
  const work=await admin.query(
    'SELECT status,revision,assigned_staff_id FROM apex.pilot_service_work_orders WHERE order_id=$1',
    [orderId]);
  test('Final database row reflects only 4 committed changes, no external completion',()=>{
    assert.equal(work.rows[0].status,'DIAGNOSING');
    assert.equal(work.rows[0].revision,5);
    assert.equal(work.rows[0].assigned_staff_id,'field-a');
  });
  const keyClient=new pg.Client({
    host:process.env.APEX_PG_PILOT_HOST,port:Number(process.env.PGPORT||5432),
    user:process.env.APEX_PG_PILOT_USER,password:process.env.APEX_PG_PILOT_PASSWORD,
    database:process.env.APEX_PG_PILOT_DB
  });
  await keyClient.connect();
  try {
    await keyClient.query('BEGIN');
    await keyClient.query('SET LOCAL ROLE apex_pilot_writer');
    await assert.rejects(
      keyClient.query('UPDATE apex.pilot_service_work_orders SET revision=100 WHERE order_id=$1',[orderId]),
      e=>e.code==='42501');
    test('SQL writer cannot directly alter optimistic concurrency revision',()=>{});
    await keyClient.query('ROLLBACK');
    await keyClient.query('BEGIN');
    await keyClient.query('SET LOCAL ROLE apex_pilot_writer');
    await assert.rejects(
      keyClient.query('DELETE FROM apex.pilot_service_work_order_events WHERE order_id=$1',[orderId]),
      e=>e.code==='42501');
    test('SQL writer cannot tamper with immutable normalized transition history',()=>{});
    await keyClient.query('ROLLBACK');
    await keyClient.query('BEGIN');
    await keyClient.query('SET LOCAL ROLE apex_pilot_writer');
    const unsigned=await keyClient.query('SELECT count(*)::integer n FROM apex.pilot_service_work_orders');
    test('Unsigned raw SQL session cannot read normalized work orders',()=>{
      assert.equal(unsigned.rows[0].n,0);
    });
    await keyClient.query('ROLLBACK');
  } finally {await keyClient.end();}

  r=await request(a,'/api/pg-pilot/customers/cust-b/access',{
    method:'PATCH',cookie:ownerA,body:{userId:'field-a',grant:false}
  });
  test('Owner revokes engineer customer-B grant on first server',()=>assert.equal(r.status,200));
  r=await request(b,'/api/pg-pilot/service-work-orders',{cookie:engineerB});
  test('Grant revocation immediately hides normalized record in other server instance',()=>{
    assert.ok(!r.data.data.some(w=>w.id===orderId));
  });
  r=await request(b,route,{method:'PATCH',cookie:engineerB,
    body:{status:'DIAGNOSING',expectedVersion:5}});
  test('Revoked engineer cannot update record despite historical assignment',()=>{
    assert.equal(r.status,404);
  });
  console.log('POSTGRES MULTI-INSTANCE SUMMARY: '+passed+'/'+passed+' PASSED');
} finally {
  for(const s of servers){
    if(s.child.exitCode===null){
      s.child.kill('SIGTERM');
      await Promise.race([
        new Promise(resolve=>s.child.once('exit',resolve)),
        new Promise(resolve=>setTimeout(resolve,5000))
      ]);
      if(s.child.exitCode===null)s.child.kill('SIGKILL');
    }
  }
  await admin.end().catch(()=>{});
  fs.rmSync(dir,{force:true,recursive:true});
}
