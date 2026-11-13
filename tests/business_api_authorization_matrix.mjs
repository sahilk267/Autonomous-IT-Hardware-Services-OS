// Phase 10.5G: every registered business route must authenticate, and every
// role-gated route is probed with a disallowed REAL authenticated role.
// Does NOT prove business object-level authorization for every route.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import crypto from 'node:crypto';
import {discoverRoutes,publicApi,pathForSmoke} from './business_route_inventory.mjs';

const main=discoverRoutes('server.ts');
const pilot=discoverRoutes('server/postgres_pilot.ts');
const known=new Set();
for(const [file,records] of [['server.ts',main],['postgres pilot',pilot]]){
  for(const r of records){
    const id=file+' '+r.method+' '+r.path;
    assert.ok(!known.has(id),'duplicate route declaration '+id);
    known.add(id);
    if(!publicApi.has(r.method+' '+r.path)){
      assert.ok(r.auth,'UNAUTHENTICATED BUSINESS API '+id+' line '+r.line);
    }else{
      assert.equal(file,'server.ts','pilot has accidentally public route');
    }
    if(r.roles){
      assert.ok(r.roles.length>0&&r.roles.every(x=>x!=='<nonliteral>'),
        'dynamic or empty requireRole '+id);
    }
  }
}
assert.ok(main.length>=90 && pilot.length>=30,'route inventory unexpectedly small');
assert.ok(main.filter(x=>!publicApi.has(x.method+' '+x.path)).length>=85);
const types=['BUSINESS_OWNER','SALES_MANAGER','PROCUREMENT_LEAD',
  'ENTERPRISE_IT_HEAD','FIELD_ENGINEER'];
const ids={BUSINESS_OWNER:'owner',SALES_MANAGER:'sales',
  PROCUREMENT_LEAD:'proc',ENTERPRISE_IT_HEAD:'it',FIELD_ENGINEER:'field'};
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'apex-api-inventory-'));
const file=path.join(temp,'private-fixture.json');
const baseline=JSON.parse(fs.readFileSync('data/app-store.json','utf8'));
baseline.users=[];
const password='EphemeralAuthInventoryOnly!2026';
for(const role of types){
  const salt=crypto.randomBytes(16).toString('hex');
  baseline.users.push({
    id:'inventory-'+ids[role],name:ids[role],username:ids[role],
    email:ids[role]+'@example.invalid',role,
    tenantId:baseline.tenant.id,createdAt:'2026-11-12T00:00:00Z',
    salt,passwordHash:crypto.scryptSync(password,salt,64).toString('hex')
  });
}
fs.writeFileSync(file,JSON.stringify(baseline),{mode:0o600});
async function freePort(){
  return new Promise((resolve,reject)=>{
    const server=net.createServer();
    server.on('error',reject);
    server.listen(0,'127.0.0.1',()=>{
      const address=server.address();
      if(!address||typeof address==='string')return reject(Error('port'));
      server.close(()=>resolve(address.port));
    });
  });
}
let child;
try{
  const port=await freePort();
  child=spawn(process.execPath,['dist/server.cjs'],{
    env:{...process.env,NODE_ENV:'production',PORT:String(port),
      APEX_DATA_FILE:file,APEX_ALLOW_PRODUCTION_RESET:'false',
      APEX_PG_PILOT_ENABLED:'false',APEX_PG_CRM_READ_THROUGH:'false',
      APEX_PG_REPOSITORY_SHADOW_READS:'false',
      TELEGRAM_BOT_TOKEN:'',GEMINI_API_KEY:''},
    stdio:['ignore','pipe','pipe']
  });
  let logs='';
  child.stdout.on('data',b=>{logs+=b.toString();});
  child.stderr.on('data',b=>{logs+=b.toString();});
  const request=async(route,{cookie='',body}={})=>{
    const res=await fetch('http://127.0.0.1:'+port+route.path,{
      method:route.method,headers:{
        ...(cookie?{cookie}:{}),
        'content-type':'application/json'
      },body:route.method==='GET'?undefined:JSON.stringify(body||{})});
    const raw=await res.text();
    let data;
    try{data=JSON.parse(raw);}catch{data={unexpectedHTML:raw.slice(0,100)};}
    return {status:res.status,data,cookie:(res.headers.get('set-cookie')||'').split(';')[0]};
  };
  const health={method:'GET',path:'/api/health'};
  for(let i=0;i<100;i++){
    if(child.exitCode!==null)throw Error('server crashed '+logs);
    try{if((await request(health)).status===200)break;}catch{}
    if(i===99)throw Error('fixture server unavailable '+logs);
    await new Promise(resolve=>setTimeout(resolve,90));
  }
  const cookies={};
  for(const role of types){
    const r=await request({method:'POST',path:'/api/auth/login'},
      {body:{username:ids[role],password}});
    assert.equal(r.status,200,'failed test login '+role+': '+JSON.stringify(r.data));
    cookies[role]=r.cookie;
  }
  let authChecks=0,roleChecks=0,authenticatedGet=0;
  for(const r of main){
    if(publicApi.has(r.method+' '+r.path))continue;
    const route={method:r.method,path:pathForSmoke(r.path)};
    const guest=await request(route);
    assert.equal(guest.status,401,
      'missing anonymous denial '+r.method+' '+r.path+' got '+guest.status);
    assert.ok(!('data' in guest.data),'guest business data disclosed '+r.path);
    authChecks++;
    if(r.roles){
      const unauthorized=types.find(role=>!r.roles.includes(role));
      if(unauthorized){
        const denied=await request(route,{cookie:cookies[unauthorized]});
        assert.equal(denied.status,403,
          'wrong-role denial '+unauthorized+' '+r.method+' '+r.path+
          ' got '+denied.status+' '+JSON.stringify(denied.data));
        assert.ok(!('data' in denied.data),'denied business rows disclosed '+r.path);
        roleChecks++;
      }
    }else if(r.method==='GET'){
      const allowed=await request(route,{cookie:cookies.BUSINESS_OWNER});
      assert.ok(allowed.status!==401&&allowed.status!==403,
        'authenticated normal GET rejected '+r.path);
      authenticatedGet++;
    }
  }
  const expectedRole=main.filter(r=>r.roles &&
    types.some(role=>!r.roles.includes(role))).length;
  assert.equal(roleChecks,expectedRole,'not every role-restricted route was probed');
  assert.equal(authChecks,main.length-publicApi.size,
    'business route inventory has unprobed anonymous cases');
  console.log(JSON.stringify({
    mode:'PHASE_10_5G_ALL_ROUTE_AUTHORIZATION_MATRIX',
    mainApiDeclarations:main.length,pilotApiDeclarations:pilot.length,
    protectedHttpRoutesTested:authChecks,wrongRoleHttpDenials:roleChecks,
    authenticatedUngatedGetChecks:authenticatedGet,
    pilotAuthorizationDeclarationsVerified:pilot.length,
    objectLevelTenantAuthorizationAcrossAllRoutesProven:false,
    defaultSqlBusinessRoutesEnabled:false,productionCutoverReady:false
  }));
}catch(error){
  console.error('ROUTE INVENTORY FAILED: '+error.message);
  process.exitCode=1;
}finally{
  if(child){
    child.kill('SIGTERM');
    await new Promise(resolve=>{
      if(child.exitCode!==null)return resolve();
      child.once('exit',resolve);
      setTimeout(resolve,3000).unref();
    });
  }
  fs.rmSync(temp,{recursive:true,force:true});
}
