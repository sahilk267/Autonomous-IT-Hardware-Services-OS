#!/usr/bin/env node
// Phase 10.5C — compare REAL cookie-authenticated JSON GET route results to
// isolated read-only PostgreSQL RLS projection before SQL pilot mutation.
// No production account, no source or SQL writes, no comparison payload logged.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import {spawn} from 'node:child_process';
import pg from 'pg';
const args=process.argv.slice(2),e=process.env;
const candidate=args.length===2&&args[0]==='--source'?args[1]:'';
const source=candidate&&path.isAbsolute(candidate)&&fs.existsSync(candidate)?fs.realpathSync(candidate):'';
const relative=source?path.relative(process.cwd(),source):'';
const inCheckout=!source||relative===''||
  (relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative));
if(inCheckout||!['localhost','127.0.0.1'].includes(e.PGHOST||'')||
   !/^apex_stage_[a-z0-9_]{2,60}$/.test(e.PGDATABASE||'')||
   e.APEX_PG_STAGING_ACK!=='STAGING_ONLY_NO_PRODUCTION'||
   e.NODE_ENV==='production'||e.DATABASE_URL||e.APEX_PG_RUNTIME_ENABLED||
   !fs.existsSync('dist/server.cjs')){
  console.error('SHADOW REFUSED: outside-checkout fixture, compiled local staging app and PG16 required.');
  process.exit(2);
}
const raw=fs.readFileSync(source),sourceSha256=crypto.createHash('sha256').update(raw).digest('hex');
const snapshot=JSON.parse(raw.toString('utf8'));
const password=e.APEX_SHADOW_TEST_PASSWORD;
if(!snapshot?.tenant?.id||!Array.isArray(snapshot.users)||
   !password||password.length<14||
   !snapshot.users.every(u=>u.disabledAt||(u.salt&&u.passwordHash))){
  console.error('SHADOW REFUSED: staging fixture needs isolated hashed accounts.');
  process.exit(2);
}
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'apex-phase10c-shadow-'));
const jsonCopy=path.join(dir,'private-json-http.json');
fs.writeFileSync(jsonCopy,raw,{mode:0o600});
const db=new pg.Client({host:e.PGHOST,port:Number(e.PGPORT||5432),
  user:e.PGUSER,password:e.PGPASSWORD,database:e.PGDATABASE,
  statement_timeout:8000,connectionTimeoutMillis:3000});
const matrix=[
  ['owner-a','customers'],['owner-a','assets'],['owner-a','tickets'],
  ['owner-a','projects'],['owner-a','crmOpportunities'],
  ['field-a','customers'],['field-a','assets'],['field-a','tickets'],
  ['sales-a','customers'],['sales-a','projects'],['sales-a','crmOpportunities'],
  ['proc-a','customers'],['proc-a','projects'],['proc-a','assets'],
  ['it-a','customers'],['it-a','projects'],['it-a','assets'],['it-a','tickets']
];
const route=kind=>kind==='crmOpportunities'?'/api/crm':'/api/'+kind;
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?
  Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const hash=rows=>crypto.createHash('sha256').update(JSON.stringify(
  rows.map(canonical).sort((a,b)=>a.id.localeCompare(b.id)))).digest('hex');
const freePort=()=>new Promise((resolve,reject)=>{
  const s=net.createServer();s.once('error',reject);
  s.listen(0,'127.0.0.1',()=>{
    const a=s.address();if(!a||typeof a==='string')return reject(Error('port'));
    s.close(()=>resolve(a.port));
  });
});
const port=await freePort(),base='http://127.0.0.1:'+port;
let child,tx=false,connected=false;
async function http(url,{method='GET',cookie='',body}={}){
  const res=await fetch(base+url,{method,headers:{
    ...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{})
  },body:body?JSON.stringify(body):undefined});
  return {status:res.status,data:await res.json(),
    cookie:(res.headers.get('set-cookie')||'').split(';')[0]};
}
try {
  await db.connect();connected=true;
  await db.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');tx=true;
  const imports=(await db.query(
    'SELECT tenant_id,sha256 FROM apex.staging_imports')).rows;
  assert.equal(imports.length,1,'one staging import');
  assert.equal(imports[0].tenant_id,snapshot.tenant.id,'tenant provenance mismatch');
  assert.equal(imports[0].sha256,sourceSha256,'source SHA256 mismatch');
  // Verify full source membership crosswalk independent of restricted per-actor views.
  const pgGrants=(await db.query('SELECT customer_id,staff_id FROM apex.customer_grants')).rows;
  const expected=snapshot.customers.flatMap(c=>(c.staffUserIds||[]).map(id=>c.id+':'+id)).sort();
  assert.deepEqual(pgGrants.map(g=>g.customer_id+':'+g.staff_id).sort(),expected,
    'historic customer membership mismatch');
  await db.query('ROLLBACK');tx=false;
  child=spawn(process.execPath,['dist/server.cjs'],{
    env:{...e,NODE_ENV:'staging',PORT:String(port),APEX_DATA_FILE:jsonCopy,
      APEX_PG_PILOT_ENABLED:'false',APEX_ALLOW_PRODUCTION_RESET:'false',
      DATABASE_URL:'',GEMINI_API_KEY:'',TELEGRAM_BOT_TOKEN:''},
    stdio:'ignore'
  });
  let ready=false;
  for(let n=0;n<95;n++){
    if(child.exitCode!==null)throw Error('isolated JSON HTTP process exited');
    try {if((await http('/api/health')).status===200){ready=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,120));
  }
  assert.equal(ready,true,'isolated JSON HTTP not available');
  const cookies=new Map();
  for(const actor of new Set(matrix.map(([user])=>user))){
    const r=await http('/api/auth/login',{method:'POST',
      body:{username:actor,password}});
    assert.equal(r.status,200,'test user sign-in: '+actor);
    assert.ok(r.cookie.startsWith('apex_session='));
    cookies.set(actor,r.cookie);
  }
  let checked=0,rowsCompared=0;
  for(const [actor,kind] of matrix){
    const response=await http(route(kind),{cookie:cookies.get(actor)});
    assert.equal(response.status,200,'authenticated JSON GET '+actor+'/'+kind);
    assert.ok(Array.isArray(response.data.data),'JSON collection contract');
    await db.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');tx=true;
    await db.query('SET LOCAL ROLE apex_stage_reader');
    await db.query("SELECT set_config('apex.tenant_id',$1,true)",[snapshot.tenant.id]);
    await db.query("SELECT set_config('apex.actor_id',$1,true)",[actor]);
    let actual;
    if(kind==='customers'){
      actual=(await db.query(
        'SELECT customer_id AS id, display_name AS name FROM apex.customers')).rows;
    }else{
      actual=(await db.query(
        'SELECT payload FROM apex.customer_records WHERE kind=$1',[kind]))
        .rows.map(r=>r.payload);
    }
    await db.query('ROLLBACK');tx=false;
    const jsonRows=kind==='customers'?response.data.data.map(c=>({id:c.id,name:c.name})):
      response.data.data;
    assert.equal(jsonRows.length,actual.length,
      'JSON/PG route count mismatch '+actor+'/'+kind);
    assert.equal(hash(jsonRows),hash(actual),
      'JSON/PG route row mismatch '+actor+'/'+kind);
    checked++;rowsCompared+=actual.length;
  }
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'),
    sourceSha256,'immutable source changed');
  console.log(JSON.stringify({
    matched:true,mode:'READ_ONLY_JSON_HTTP_VS_PG_RLS',
    routeRoleComparisons:checked,rowsCompared,sourceSha256,
    sourceModified:false,sqlBusinessWrites:false,externalDispatch:false
  }));
}catch(err){
  console.error('SHADOW MISMATCH: '+err.message);
  process.exitCode=1;
}finally{
  if(tx)await db.query('ROLLBACK').catch(()=>{});
  if(connected)await db.end().catch(()=>{});
  if(child&&child.exitCode===null){
    child.kill('SIGTERM');
    await Promise.race([new Promise(resolve=>child.once('exit',resolve)),
      new Promise(resolve=>setTimeout(resolve,3500))]);
    if(child.exitCode===null)child.kill('SIGKILL');
  }
  fs.rmSync(dir,{force:true,recursive:true});
}
