// Phase 10.2 — real HTTP cookies + real PostgreSQL RLS/writes/trigger-audit in local staging.
// The JSON auth store is an isolated throwaway fixture. No user/customer production DB touched.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn, spawnSync} from 'node:child_process';
import {randomBytes, scryptSync} from 'node:crypto';
import pg from 'pg';

if(process.env.APEX_PG_STAGING_ACK!=='STAGING_ONLY_NO_PRODUCTION' ||
  !/^apex_stage_/.test(process.env.APEX_PG_PILOT_DB||'')) {
  throw Error('Pilot HTTP suite only runs on a disposable staging database.');
}
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'apex-pilot-http-'));
const dataFile=path.join(dir,'json-auth-only.json');
const pass='EphemeralPostgresPilotOnly!2026';
const baseline=JSON.parse(fs.readFileSync('data/app-store.json','utf8'));
baseline.tenant.id='tenant-fixture-a';
baseline.tenant.name='HTTP Pilot Fixture Tenant';
baseline.users=[];
const roles=[
  ['owner-a','BUSINESS_OWNER'],
  ['sales-a','SALES_MANAGER'],
  ['proc-a','PROCUREMENT_LEAD'],
  ['it-a','ENTERPRISE_IT_HEAD'],
  ['field-a','FIELD_ENGINEER']
];
for(const [username,role] of roles){
  const salt=randomBytes(16).toString('hex');
  baseline.users.push({
    id:username,tenantId:'tenant-fixture-a',username,name:username,
    email:username+'@example.invalid',role,createdAt:new Date().toISOString(),
    salt,passwordHash:scryptSync(pass,salt,64).toString('hex')
  });
}
fs.writeFileSync(dataFile,JSON.stringify(baseline),{mode:0o600});
const freePort=()=>new Promise((resolve,reject)=>{
  const server=net.createServer();
  server.once('error',reject);
  server.listen(0,'127.0.0.1',()=>{
    const address=server.address();
    if(typeof address==='string'||!address)return reject(Error('No test port'));
    server.close(()=>resolve(address.port));
  });
});
const port=await freePort();
const base='http://127.0.0.1:'+port;
let child;
let logs='';
const cookies={};
let passed=0;
const test=(name,check)=>{check();passed++;console.log('PASS '+name);};
const client=new pg.Client({
  host:process.env.PGHOST,user:process.env.PGUSER,
  password:process.env.PGPASSWORD,port:Number(process.env.PGPORT||5432),
  database:process.env.PGDATABASE
});
async function api(url,{method='GET',cookie='',body}={}){
  const response=await fetch(base+url,{
    method,headers:{...(cookie?{cookie}:{}),
      ...(body===undefined?{}:{'content-type':'application/json'})},
    body:body===undefined?undefined:JSON.stringify(body)
  });
  const raw=await response.text();
  let data;
  try{data=JSON.parse(raw);}catch{data={_unparsed:raw.slice(0,100)};}
  return {status:response.status,data,headers:response.headers};
}
const post=(url,body,cookie)=>api(url,{method:'POST',cookie,body});
const patch=(url,body,cookie)=>api(url,{method:'PATCH',cookie,body});
const count=async(table)=>Number((await client.query('SELECT count(*)::integer n FROM apex.'+table)).rows[0].n);
try {
  // Invalid configuration fails at startup, not at the first mutation.
  const invalid=spawnSync(process.execPath,['dist/server.cjs'],{
    env:{...process.env, NODE_ENV:'production',PORT:String(port),
      APEX_DATA_FILE:dataFile,APEX_PG_PILOT_ENABLED:'true',
      APEX_PG_PILOT_ACK:'LOCAL_STAGING_ONLY_NO_CUTOVER'},
    encoding:'utf8',timeout:6000
  });
  test('Pilot refuses to initialize in a production environment',()=>{
    assert.notEqual(invalid.status,0);
    assert.match(invalid.stderr,/STAGING PILOT SAFETY/);
  });
  child=spawn(process.execPath,['dist/server.cjs'],{
    env:{...process.env,NODE_ENV:'staging',PORT:String(port),
      APEX_DATA_FILE:dataFile,APEX_PG_PILOT_ENABLED:'true',
      APEX_PG_PILOT_ACK:'LOCAL_STAGING_ONLY_NO_CUTOVER',
      APEX_ALLOW_PRODUCTION_RESET:'false',GEMINI_API_KEY:'',
      TELEGRAM_BOT_TOKEN:''},
    stdio:['ignore','pipe','pipe']
  });
  child.stdout.on('data',buf=>{logs+=buf.toString();});
  child.stderr.on('data',buf=>{logs+=buf.toString();});
  let ready=false;
  for(let n=0;n<100;n++){
    if(child.exitCode!==null)throw Error('Staging server exited: '+logs);
    try{if((await api('/api/health')).status===200){ready=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,110));
  }
  if(!ready)throw Error('Staging HTTP server not ready: '+logs);
  let r=await api('/api/pg-pilot/customers');
  test('Anonymous SQL pilot access denied by existing cookie middleware',()=>assert.equal(r.status,401));
  for(const [username] of roles){
    r=await post('/api/auth/login',{username,password:pass});
    test('Staging login accepted for '+username,()=>assert.equal(r.status,200));
    cookies[username]=(r.headers.get('set-cookie')||'').split(';')[0];
    assert.ok(cookies[username].startsWith('apex_session='));
  }
  const owner=cookies['owner-a'],sales=cookies['sales-a'],field=cookies['field-a'],proc=cookies['proc-a'];
  r=await api('/api/pg-pilot/status',{cookie:sales});
  test('Pilot is declared staging-only while JSON runtime stays authoritative',()=>{
    assert.equal(r.status,200);
    assert.equal(r.data.data.applicationStorage,'json');
    assert.equal(r.data.productionCutover,false);
  });
  r=await api('/api/pg-pilot/customers',{cookie:owner});
  test('PostgreSQL owner sees imported customer A and B',()=>{
    assert.equal(r.status,200);
    assert.deepEqual(r.data.data.map(c=>c.id).sort(),['cust-a','cust-b']);
  });
  r=await api('/api/pg-pilot/customers',{cookie:sales});
  test('Revoked sales user cannot enumerate SQL customer B or A',()=>{
    assert.equal(r.status,200);
    assert.equal(r.data.data.length,0);
  });
  r=await api('/api/pg-pilot/customers',{cookie:field});
  test('Field engineer sees only customer explicitly granted in PG',()=>{
    assert.deepEqual(r.data.data.map(c=>c.id),['cust-a']);
  });
  r=await post('/api/pg-pilot/customers',{name:'Illicit Customer'},sales);
  test('Sales cannot register PostgreSQL customer',()=>assert.equal(r.status,403));
  r=await api('/api/pg-pilot/crm',{cookie:proc});
  test('Procurement cannot read sales SQL CRM collection',()=>assert.equal(r.status,403));
  r=await api('/api/pg-pilot/audit',{cookie:sales});
  test('Nonowner cannot read trigger audit ledger',()=>assert.equal(r.status,403));
  r=await post('/api/pg-pilot/customers',{name:'Pilot Customer C'},owner);
  test('Owner creates customer in PostgreSQL, independent of JSON business state',()=>{
    assert.equal(r.status,201);
    assert.match(r.data.data.id,/^cust-/);
  });
  const customerC=r.data.data.id;
  r=await post('/api/pg-pilot/customers',{name:'pilot customer c'},owner);
  test('Database unique tenant/customer name rejects case-folded duplicate',()=>assert.equal(r.status,409));
  r=await post('/api/pg-pilot/crm',{customerId:customerC,title:'Before Grant',value:500},sales);
  test('Sales cannot insert CRM before customer membership grant',()=>assert.equal(r.status,404));
  r=await patch('/api/pg-pilot/customers/'+customerC+'/access',
    {userId:'sales-a',grant:true},proc);
  test('Procurement cannot mutate customer grants',()=>assert.equal(r.status,403));
  r=await patch('/api/pg-pilot/customers/'+customerC+'/access',
    {userId:'sales-a',grant:true},owner);
  test('Owner grants SQL customer membership',()=>{
    assert.equal(r.status,200);
    assert.equal(r.data.data.changed,true);
  });
  r=await api('/api/pg-pilot/customers',{cookie:sales});
  test('Granted sales user now sees customer C only',()=>{
    assert.deepEqual(r.data.data.map(c=>c.id),[customerC]);
  });
  r=await post('/api/pg-pilot/crm',{
    customerId:customerC,clientName:'Forged Customer B',title:'Spoof Deal',value:50
  },sales);
  test('CRM rejects client-name impersonation against registered customer ID',()=>assert.equal(r.status,400));
  r=await post('/api/pg-pilot/crm',{customerId:customerC,title:'SQL Verified Opportunity',value:1234},sales);
  test('Granted sales user creates real PostgreSQL CRM object',()=>{
    assert.equal(r.status,201);
    assert.equal(r.data.data.clientName,'Pilot Customer C');
    assert.equal(r.data.data.stage,'LEAD');
    assert.equal(r.data.data.createdByUserId,'sales-a');
  });
  const crmId=r.data.data.id;
  r=await patch('/api/pg-pilot/crm/'+crmId,{stage:'NEGOTIATION'},sales);
  test('Sales advances owned SQL opportunity with writable RLS',()=>{
    assert.equal(r.status,200);
    assert.equal(r.data.data.stage,'NEGOTIATION');
  });
  r=await patch('/api/pg-pilot/crm/'+crmId,{stage:'ADMIN_APPROVED'},sales);
  test('CRM transition allowlist rejects client-created privileged status',()=>assert.equal(r.status,400));
  r=await api('/api/pg-pilot/crm',{cookie:owner});
  test('Owner sees real SQL CRM state including committed transition',()=>{
    assert.equal(r.status,200);
    assert.ok(r.data.data.some(item=>item.id===crmId&&item.stage==='NEGOTIATION'));
  });
  r=await api('/api/state',{cookie:owner});
  test('Existing JSON /api/state does not silently switch to SQL pilot records',()=>{
    assert.equal(r.status,200);
    assert.equal(r.data.data.crmOpportunities.some(item=>item.id===crmId),false);
  });
  r=await api('/api/pg-pilot/audit',{cookie:owner});
  test('Customer creation, grant, CRM insert/update are committed to SQL audit triggers',()=>{
    assert.equal(r.status,200);
    const events=r.data.data.filter(e=>e.customerId===customerC);
    assert.ok(events.some(e=>e.entity==='customers'&&e.operation==='INSERT'));
    assert.ok(events.some(e=>e.entity==='customer_grants'&&e.operation==='INSERT'));
    assert.ok(events.some(e=>e.entity==='customer_records'&&e.operation==='INSERT'));
    assert.ok(events.some(e=>e.entity==='customer_records'&&e.operation==='UPDATE'));
    assert.ok(events.every(e=>e.actor==='owner-a'||e.actor==='sales-a'));
  });
  await client.connect();
  const before=await count('customers');
  // Deliberately fail the audit trigger. The row insert must roll back atomically.
  await client.query("ALTER TABLE apex.pilot_audit_events ADD CONSTRAINT test_reject_new_customer_audit CHECK (entity <> 'customers') NOT VALID");
  try{
    r=await post('/api/pg-pilot/customers',{name:'Audit Rollback Must Not Exist'},owner);
    test('Failing SQL audit trigger returns an error, not a fake created customer',()=>{
      assert.equal(r.status,503);
      assert.equal(r.data.success,false);
    });
    const after=await count('customers');
    test('Failed audit trigger rolls back customer creation in same transaction',()=>{
      assert.equal(after,before);
    });
  }finally{
    await client.query('ALTER TABLE apex.pilot_audit_events DROP CONSTRAINT test_reject_new_customer_audit');
  }
  r=await patch('/api/pg-pilot/customers/'+customerC+'/access',{userId:'sales-a',grant:false},owner);
  test('Owner revokes SQL customer membership in a transaction',()=>{
    assert.equal(r.status,200);
    assert.equal(r.data.data.changed,true);
  });
  r=await api('/api/pg-pilot/crm',{cookie:sales});
  test('Revoked sales session cannot read former customer CRM from SQL',()=>{
    assert.ok(!r.data.data.some(item=>item.id===crmId));
  });
  r=await patch('/api/pg-pilot/crm/'+crmId,{stage:'WON'},sales);
  test('Revoked staff cannot update SQL CRM record',()=>assert.equal(r.status,404));
  r=await api('/api/pg-pilot/audit',{cookie:owner});
  test('Revocation is persisted in same-transaction SQL audit',()=>{
    const events=r.data.data.filter(e=>e.customerId===customerC);
    assert.ok(events.some(e=>e.entity==='customer_grants'&&e.operation==='DELETE'));
    assert.ok(!events.some(e=>e.object===crmId&&e.operation==='DELETE'));
  });
  console.log('PG AUTHENTICATED HTTP PILOT SUMMARY: '+passed+'/'+passed+' PASSED');
} finally {
  if(child){
    child.kill('SIGTERM');
    await new Promise(resolve=>child.once('exit',resolve)).catch(()=>{});
  }
  await client.end().catch(()=>{});
  fs.rmSync(dir,{recursive:true,force:true});
}
