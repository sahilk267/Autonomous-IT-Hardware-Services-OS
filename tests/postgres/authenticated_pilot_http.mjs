// Phase 10.2 — real HTTP cookies + real PostgreSQL RLS/writes/trigger-audit in local staging.
// The JSON auth store is an isolated throwaway fixture. No user/customer production DB touched.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn, spawnSync} from 'node:child_process';
import {randomBytes, scryptSync, createHmac} from 'node:crypto';
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
  const owner=cookies['owner-a'],sales=cookies['sales-a'],field=cookies['field-a'],proc=cookies['proc-a'],ithead=cookies['it-a'];
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
  // Production-style CSRF and request-provided actor/tenant hints cannot override session authority.
  const foreign=await fetch(base+'/api/pg-pilot/customers',{
    method:'POST',headers:{cookie:owner,'content-type':'application/json',
      origin:'https://unrelated.example.invalid'},
    body:JSON.stringify({name:'Forged Cross-Origin Customer'})
  });
  test('Cross-origin cookie-authenticated PostgreSQL mutation rejected before SQL',()=>{
    assert.equal(foreign.status,403);
  });
  const impersonation=await fetch(base+'/api/pg-pilot/customers',{
    headers:{cookie:sales,'x-apex-user-id':'owner-a','x-apex-tenant-id':'tenant-fixture-b'}
  });
  const impersonationBody=await impersonation.json();
  test('Untrusted user/tenant request headers cannot override authenticated SQL RLS identity',()=>{
    assert.equal(impersonation.status,200);
    assert.deepEqual(impersonationBody.data.map(c=>c.id),[customerC]);
  });
  r=await post('/api/pg-pilot/crm',{
    customerId:customerC,title:'Mass assignment rejected',value:1,
    createdByUserId:'owner-a'
  },sales);
  test('Client cannot mass-assign CRM actor metadata',()=>assert.equal(r.status,400));
  await client.query("UPDATE apex.staff SET role='BUSINESS_OWNER' WHERE tenant_id='tenant-fixture-a' AND staff_id='sales-a'");
  try {
    r=await api('/api/pg-pilot/customers',{cookie:sales});
    test('JSON-to-SQL role drift fails closed even when SQL role is elevated',()=>{
      assert.equal(r.status,403);
    });
  }finally{
    await client.query("UPDATE apex.staff SET role='SALES_MANAGER' WHERE tenant_id='tenant-fixture-a' AND staff_id='sales-a'");
  }
  await client.query("UPDATE apex.staff SET disabled_at=now() WHERE tenant_id='tenant-fixture-a' AND staff_id='sales-a'");
  try{
    r=await api('/api/pg-pilot/customers',{cookie:sales});
    test('Existing authenticated session cannot read as SQL-disabled user',()=>assert.equal(r.status,403));
  }finally{
    await client.query("UPDATE apex.staff SET disabled_at=NULL WHERE tenant_id='tenant-fixture-a' AND staff_id='sales-a'");
  }
  const restricted=new pg.Client({
    host:process.env.APEX_PG_PILOT_HOST,port:Number(process.env.PGPORT||5432),
    user:process.env.APEX_PG_PILOT_USER,password:process.env.APEX_PG_PILOT_PASSWORD,
    database:process.env.APEX_PG_PILOT_DB
  });
  await restricted.connect();
  try{
    await restricted.query('BEGIN');
    await restricted.query('SET LOCAL ROLE apex_pilot_writer');
    const anonymousSql=await restricted.query('SELECT count(*)::integer n FROM apex.customer_records');
    test('Dedicated SQL login without trusted transaction context sees zero customer data',()=>{
      assert.equal(anonymousSql.rows[0].n,0);
    });
    await assert.rejects(restricted.query(
      "INSERT INTO apex.customers(tenant_id,customer_id,display_name) VALUES ('tenant-fixture-a','forged-without-context','FORGED')"),
      err=>err.code==='42501');
    test('Dedicated SQL login cannot create customer without actor context',()=>{});
    await restricted.query('ROLLBACK');
    await restricted.query('BEGIN');
    await restricted.query('SET LOCAL ROLE apex_pilot_writer');
    await assert.rejects(restricted.query(
      "INSERT INTO apex.pilot_audit_events(tenant_id,event_id,actor_staff_id,operation,entity,object_id) "+
      "VALUES('tenant-fixture-a','forged-audit','owner-a','INSERT','customers','fake')"),
      err=>err.code==='42501');
    test('Pilot SQL writer has no direct audit ledger insertion privilege',()=>{});
    await restricted.query('ROLLBACK');
  }finally{
    await restricted.end();
  }
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

  // Phase 10.3A — domain repository operations are real SQL writes, not JSON simulations.
  r=await api('/api/pg-pilot/projects',{cookie:field});
  test('Field engineer cannot enumerate SQL projects by changing route',()=>assert.equal(r.status,403));
  r=await post('/api/pg-pilot/projects',{
    customerId:'cust-b',title:'B staged authorization project',budget:900
  },ithead);
  test('IT head creates a customer-B project in PostgreSQL',()=>{
    assert.equal(r.status,201);
    assert.equal(r.data.data.clientName,'Customer B');
    assert.equal(r.data.data.createdByUserId,'it-a');
  });
  const sqlProjectB=r.data.data.id;
  r=await api('/api/pg-pilot/projects',{cookie:owner});
  test('Owner can list staged project B through signed SQL context',()=>{
    assert.ok(r.data.data.some(p=>p.id===sqlProjectB));
  });
  r=await api('/api/pg-pilot/projects',{cookie:sales});
  test('Sales without customer-B membership cannot enumerate project B',()=>{
    assert.ok(!r.data.data.some(p=>p.id===sqlProjectB));
  });
  r=await patch('/api/pg-pilot/projects/'+sqlProjectB+'/access',{
    userId:'sales-a',grant:true
  },owner);
  test('Project collaboration cannot grant access without customer-B membership',()=>{
    assert.equal(r.status,403);
  });
  r=await patch('/api/pg-pilot/customers/cust-b/access',{
    userId:'sales-a',grant:true
  },owner);
  test('Owner can grant sales a specific second customer',()=>{
    assert.equal(r.status,200);
    assert.equal(r.data.data.changed,true);
  });
  r=await api('/api/pg-pilot/projects',{cookie:sales});
  test('Customer membership alone does not expose unshared private project',()=>{
    assert.ok(!r.data.data.some(p=>p.id===sqlProjectB));
  });
  r=await patch('/api/pg-pilot/projects/'+sqlProjectB+'/access',{
    userId:'sales-a',grant:true
  },owner);
  test('Owner shares project in same customer after staff grant',()=>{
    assert.equal(r.status,200);
    assert.equal(r.data.data.changed,true);
  });
  r=await api('/api/pg-pilot/projects',{cookie:sales});
  test('Sales project visibility requires both SQL membership and project share',()=>{
    assert.ok(r.data.data.some(p=>p.id===sqlProjectB));
  });
  r=await patch('/api/pg-pilot/projects/'+sqlProjectB+'/access',{
    userId:'sales-a',grant:false
  },owner);
  test('Project-specific share can be revoked independently of customer membership',()=>{
    assert.equal(r.status,200);
    assert.equal(r.data.data.changed,true);
  });
  r=await api('/api/pg-pilot/projects',{cookie:sales});
  test('Revoked share immediately hides private project from existing sales session',()=>{
    assert.ok(!r.data.data.some(p=>p.id===sqlProjectB));
  });
  // Allow field role to submit nothing: ticket intake restricted to owner and IT HEAD.
  r=await post('/api/pg-pilot/tickets',{
    customerId:'cust-b',title:'Forged field incident'
  },field);
  test('Field role cannot bypass SQL ticket creation permissions',()=>assert.equal(r.status,403));
  r=await post('/api/pg-pilot/tickets',{
    customerId:'cust-b',title:'Staging network incident',priority:'HIGH'
  },ithead);
  test('IT head creates customer-B ticket with server-authoritative reporter',()=>{
    assert.equal(r.status,201);
    assert.equal(r.data.data.reportedByUserId,'it-a');
    assert.equal(r.data.data.status,'OPEN');
  });
  const sqlTicketB=r.data.data.id;
  r=await api('/api/pg-pilot/tickets',{cookie:field});
  test('Field user cannot see unassigned ticket even with customer-A grant',()=>{
    assert.ok(!r.data.data.some(t=>t.id===sqlTicketB));
  });
  r=await patch('/api/pg-pilot/tickets/'+sqlTicketB+'/status',{
    status:'IN_PROGRESS'
  },ithead);
  test('IT head updates ticket status through DB column-restricted RLS',()=>{
    assert.equal(r.status,200);
    assert.equal(r.data.data.status,'IN_PROGRESS');
  });
  r=await patch('/api/pg-pilot/tickets/'+sqlTicketB+'/status',{
    status:'FAKE_CLOSED_BY_OEM'
  },ithead);
  test('Unverified ticket closure/status rejected before SQL',()=>assert.equal(r.status,400));
  r=await post('/api/pg-pilot/projects',{
    customerId:'cust-b',title:'Forged enterprise project',createdByUserId:'owner-a'
  },ithead);
  test('Project intake rejects creator mass-assignment spoof',()=>assert.equal(r.status,400));
  r=await post('/api/pg-pilot/tickets',{
    customerId:'cust-a',title:'Unauthorized customer A ticket'
  },ithead);
  test('IT head without customer-A grant is rejected only if grant revoked',()=>{
    // This fixture grants the IT head to A, so creation is correctly permitted.
    assert.equal(r.status,201);
  });
  r=await api('/api/pg-pilot/audit',{cookie:owner});
  test('Project/ticket create, share grant/revoke and ticket transition are SQL-trigger audited',()=>{
    assert.equal(r.status,200);
    const events=r.data.data;
    assert.ok(events.some(e=>e.object===sqlProjectB&&e.entity==='customer_records'));
    assert.ok(events.some(e=>e.object===sqlTicketB&&e.entity==='customer_records'&&e.operation==='INSERT'));
    assert.ok(events.some(e=>e.object===sqlTicketB&&e.entity==='customer_records'&&e.operation==='UPDATE'));
    assert.ok(events.some(e=>e.object===sqlProjectB+':sales-a'&&e.entity==='project_shares'&&e.operation==='INSERT'));
    assert.ok(events.some(e=>e.object===sqlProjectB+':sales-a'&&e.entity==='project_shares'&&e.operation==='DELETE'));
  });
  // Malicious SQL client can forge GUCs but cannot generate the attestation without
  // the private server-side key. Key is inaccessible to restricted login.
  const rawClient=new pg.Client({
    host:process.env.APEX_PG_PILOT_HOST,port:Number(process.env.PGPORT||5432),
    user:process.env.APEX_PG_PILOT_USER,password:process.env.APEX_PG_PILOT_PASSWORD,
    database:process.env.APEX_PG_PILOT_DB
  });
  await rawClient.connect();
  try {
    await rawClient.query('BEGIN');
    await rawClient.query('SET LOCAL ROLE apex_pilot_writer');
    await rawClient.query("SELECT set_config('apex.tenant_id','tenant-fixture-a',true)");
    await rawClient.query("SELECT set_config('apex.actor_id','owner-a',true)");
    let select=await rawClient.query("SELECT count(*)::integer n FROM apex.customers");
    test('Forged owner/tenant GUCs cannot bypass signed actor attestation',()=>{
      assert.equal(select.rows[0].n,0);
    });
    await rawClient.query("SELECT set_config('apex.context_signature',$1,true)",['f'.repeat(64)]);
    select=await rawClient.query("SELECT count(*)::integer n FROM apex.customers");
    test('Forged random 256-bit signature cannot impersonate owner',()=>{
      assert.equal(select.rows[0].n,0);
    });
    await assert.rejects(rawClient.query('SELECT secret FROM apex.pilot_context_secrets'),
      err=>err.code==='42501');
    test('Restricted SQL login cannot read private attestation secret',()=>{});
    // SELECT permission error leaves transaction aborted; cleanup on separate COMMIT.
    await rawClient.query('ROLLBACK');
    await rawClient.query('BEGIN');
    await rawClient.query('SET LOCAL ROLE apex_pilot_writer');
    await rawClient.query("SELECT set_config('apex.tenant_id','tenant-fixture-a',true)");
    await rawClient.query("SELECT set_config('apex.actor_id','owner-a',true)");
    await assert.rejects(rawClient.query(
      "INSERT INTO apex.customers(tenant_id,customer_id,display_name) "+
      "VALUES('tenant-fixture-a','forged-guc-owner','Fake Owner')"),
      err=>err.code==='42501');
    test('Staging SQL cannot insert using unsigned owner identity',()=>{});
    await rawClient.query('ROLLBACK');

    // The test harness can sign a synthetic fixture transaction; a stolen signature
    // must not authorize a later transaction, even on the SAME backend connection.
    await rawClient.query('BEGIN');
    const challenge=await rawClient.query(
      'SELECT txid_current()::text AS txid,pg_backend_pid()::text AS backend');
    const signedPayload=['tenant-fixture-a','owner-a',
      challenge.rows[0].txid,challenge.rows[0].backend].join('\n');
    const validSignature=createHmac('sha256',
      Buffer.from(process.env.APEX_PG_PILOT_CONTEXT_KEY,'hex'))
      .update(signedPayload).digest('hex');
    await rawClient.query('SET LOCAL ROLE apex_pilot_writer');
    await rawClient.query("SELECT set_config('apex.tenant_id','tenant-fixture-a',true)");
    await rawClient.query("SELECT set_config('apex.actor_id','owner-a',true)");
    await rawClient.query("SELECT set_config('apex.context_signature',$1,true)",[validSignature]);
    let signed=await rawClient.query('SELECT count(*)::integer n FROM apex.customers');
    test('A correctly signed transaction context authorizes only its verified actor',()=>{
      assert.ok(signed.rows[0].n>=2);
    });
    await rawClient.query("SELECT set_config('apex.actor_id','sales-a',true)");
    signed=await rawClient.query('SELECT count(*)::integer n FROM apex.customers');
    test('Changing actor ID invalidates signature within same SQL transaction',()=>{
      assert.equal(signed.rows[0].n,0);
    });
    await rawClient.query('ROLLBACK');
    await rawClient.query('BEGIN');
    await rawClient.query('SET LOCAL ROLE apex_pilot_writer');
    await rawClient.query("SELECT set_config('apex.tenant_id','tenant-fixture-a',true)");
    await rawClient.query("SELECT set_config('apex.actor_id','owner-a',true)");
    await rawClient.query("SELECT set_config('apex.context_signature',$1,true)",[validSignature]);
    signed=await rawClient.query('SELECT count(*)::integer n FROM apex.customers');
    test('Replayed signed context from previous transaction is rejected',()=>{
      assert.equal(signed.rows[0].n,0);
    });
    await rawClient.query('ROLLBACK');
  }finally{await rawClient.end();}
  const domainBefore=await count('customer_records');
  await client.query(
    "ALTER TABLE apex.pilot_audit_events ADD CONSTRAINT test_domain_audit_required "+
    "CHECK (entity <> 'customer_records') NOT VALID");
  try {
    r=await post('/api/pg-pilot/projects',{
      customerId:'cust-b',title:'Atomic project must rollback'
    },owner);
    test('Project insert fails if its audit trigger cannot commit',()=>assert.equal(r.status,503));
    const after=await count('customer_records');
    test('Failed domain audit rolls back all project record writes',()=>{
      assert.equal(after,domainBefore);
    });
  }finally{
    await client.query('ALTER TABLE apex.pilot_audit_events DROP CONSTRAINT test_domain_audit_required');
  }
  r=await patch('/api/pg-pilot/customers/cust-b/access',{userId:'sales-a',grant:false},owner);
  test('Customer-B revocation removes residual project membership',()=>{
    assert.equal(r.status,200);
    assert.equal(r.data.data.changed,true);
  });

  // Phase 10.3B: field asset/job custody is customer-scoped AND object-assigned.
  r=await api('/api/pg-pilot/assets',{cookie:proc});
  test('Procurement only sees granted customer A assets',()=>{
    assert.equal(r.status,200);
    assert.ok(r.data.data.some(a=>a.id==='asset-a'));
    assert.ok(!r.data.data.some(a=>a.id==='asset-b'));
  });
  r=await post('/api/pg-pilot/assets',{
    customerId:'cust-b',assetTag:'CI-B-ASSET-01',name:'Isolated staging router',category:'Switch'
  },ithead);
  test('IT head records B asset with server identity and unassigned custody',()=>{
    assert.equal(r.status,201);
    assert.equal(r.data.data.customerId,'cust-b');
    assert.equal(r.data.data.status,'AVAILABLE_IN_STOCK');
    assert.equal(r.data.data.assignedUserId,undefined);
  });
  const newAssetId=r.data.data.id;
  r=await post('/api/pg-pilot/assets',{
    customerId:'cust-b',assetTag:'ci-b-asset-01',name:'Tag collision casefold',category:'Switch'
  },owner);
  test('Database enforces tenant-wide case-folded unique assetTag',()=>assert.equal(r.status,409));
  r=await post('/api/pg-pilot/assets',{
    customerId:'cust-b',assetTag:'FORGED',name:'Private asset'
  },field);
  test('Field staff cannot invent a customer asset',()=>assert.equal(r.status,403));
  r=await post('/api/pg-pilot/jobs',{
    customerId:'cust-b',title:'On-site staging router diagnostic',address:'Site B'
  },ithead);
  test('IT head dispatches customer-bound staged job, not marked completed',()=>{
    assert.equal(r.status,201);
    assert.equal(r.data.data.customerName,'Customer B');
    assert.equal(r.data.data.status,'SCHEDULED');
  });
  const newJobId=r.data.data.id;
  r=await post('/api/pg-pilot/jobs',{
    customerId:'cust-b',title:'Fake client job',customerName:'Customer A'
  },ithead);
  test('Field job cannot spoof a client name',()=>assert.equal(r.status,400));
  r=await api('/api/pg-pilot/assets',{cookie:field});
  test('Field cannot enumerate unassigned B asset before customer grant',()=>{
    assert.ok(!r.data.data.some(a=>a.id===newAssetId));
  });
  r=await api('/api/pg-pilot/jobs',{cookie:field});
  test('Field cannot enumerate unassigned B job',()=>{
    assert.ok(!r.data.data.some(j=>j.id===newJobId));
  });
  r=await patch('/api/pg-pilot/assets/'+newAssetId+'/assign',{
    userId:'field-a'
  },owner);
  test('Owner cannot assign B asset to field without B customer membership',()=>{
    assert.equal(r.status,403);
  });
  r=await patch('/api/pg-pilot/jobs/'+newJobId+'/assign',{
    userId:'field-a'
  },ithead);
  test('IT head cannot dispatch B job to ungranted engineer',()=>{
    assert.equal(r.status,403);
  });
  r=await patch('/api/pg-pilot/customers/cust-b/access',{
    userId:'field-a',grant:true
  },owner);
  test('Owner grants engineer customer-B membership explicitly',()=>assert.equal(r.status,200));
  r=await patch('/api/pg-pilot/assets/'+newAssetId+'/assign',{
    userId:'field-a'
  },ithead);
  test('IT head makes real SQL asset assignment after customer grant',()=>{
    assert.equal(r.status,200);
    assert.equal(r.data.data.assignedUserId,'field-a');
  });
  r=await patch('/api/pg-pilot/jobs/'+newJobId+'/assign',{
    userId:'field-a'
  },owner);
  test('Owner assigns field job atomically with stable staff identity',()=>{
    assert.equal(r.status,200);
    assert.equal(r.data.data.assignedUserId,'field-a');
    assert.equal(r.data.data.technicianName,'field-a');
  });
  r=await api('/api/pg-pilot/assets',{cookie:field});
  test('Assigned engineer sees B asset and A asset with per-customer grants',()=>{
    assert.ok(r.data.data.some(a=>a.id===newAssetId));
    assert.ok(r.data.data.some(a=>a.id==='asset-a'));
  });
  r=await api('/api/pg-pilot/jobs',{cookie:field});
  test('Assigned engineer sees B field job only after assignment',()=>{
    assert.ok(r.data.data.some(j=>j.id===newJobId));
  });
  r=await patch('/api/pg-pilot/assets/'+newAssetId+'/status',{
    status:'UNDER_REPAIR'
  },field);
  test('Assigned engineer can change only internal asset status',()=>{
    assert.equal(r.status,200);
    assert.equal(r.data.data.status,'UNDER_REPAIR');
  });
  r=await patch('/api/pg-pilot/jobs/'+newJobId+'/status',{
    status:'EN_ROUTE'
  },field);
  test('Assigned engineer records an internal job progress state',()=>{
    assert.equal(r.status,200);
    assert.equal(r.data.data.status,'EN_ROUTE');
  });
  r=await patch('/api/pg-pilot/jobs/'+newJobId+'/status',{
    status:'COMPLETED'
  },field);
  test('Field cannot claim completed customer work without verification',()=>assert.equal(r.status,400));
  r=await api('/api/pg-pilot/audit',{cookie:owner});
  test('Asset and job creation, assignment and progress are SQL trigger-audited',()=>{
    assert.ok(r.data.data.some(e=>e.object===newAssetId&&e.operation==='INSERT'));
    assert.ok(r.data.data.some(e=>e.object===newAssetId&&e.operation==='UPDATE'));
    assert.ok(r.data.data.some(e=>e.object===newJobId&&e.operation==='INSERT'));
    assert.ok(r.data.data.some(e=>e.object===newJobId&&e.operation==='UPDATE'));
  });
  r=await patch('/api/pg-pilot/customers/cust-b/access',{
    userId:'field-a',grant:false
  },owner);
  test('Owner revokes B field grant in database',()=>assert.equal(r.status,200));
  r=await api('/api/pg-pilot/assets',{cookie:field});
  test('Revocation instantly hides previously assigned customer-B asset',()=>{
    assert.ok(!r.data.data.some(a=>a.id===newAssetId));
  });
  r=await api('/api/pg-pilot/jobs',{cookie:field});
  test('Revocation instantly hides previously assigned customer-B job',()=>{
    assert.ok(!r.data.data.some(j=>j.id===newJobId));
  });
  r=await patch('/api/pg-pilot/jobs/'+newJobId+'/status',{status:'CHECKED_IN'},field);
  test('Revoked field member cannot update job despite historical assignment',()=>{
    assert.equal(r.status,404);
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
