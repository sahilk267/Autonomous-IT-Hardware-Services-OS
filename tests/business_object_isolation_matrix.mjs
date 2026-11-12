// Phase 10.5H: cross-customer object-bound HTTP authorization on actual JSON APIs.
// Distinct A/B fixtures + real sessions; no external calls, payments or production DB.
// Single-tenant JSON tests; independent SQL two-tenant checks live elsewhere.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {discoverRoutes} from './business_route_inventory.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'apex-objects-'));
const dataFile=path.join(dir,'private-state.json');
const starter=JSON.parse(fs.readFileSync('data/app-store.json','utf8'));
const tenant=starter.tenant.id;
const names={A:'Client A',B:'Client B'};
const customer=letter=>'cust-h-'+letter;
const id=(kind,letter)=>'h-'+kind+'-'+letter;
const roleNames={owner:'BUSINESS_OWNER',sales:'SALES_MANAGER',
  it:'ENTERPRISE_IT_HEAD',field:'FIELD_ENGINEER',proc:'PROCUREMENT_LEAD'};
const password='SyntheticCustomerBoundaryOnly!2026';
starter.users=Object.entries(roleNames).map(([key,role])=>{
  const salt=crypto.randomBytes(16).toString('hex');
  return {id:'h-'+key,username:key,name:key,email:key+'@example.invalid',
    tenantId:tenant,role,salt,
    passwordHash:crypto.scryptSync(password,salt,64).toString('hex'),
    createdAt:'2026-11-12T00:00:00Z'};
});
starter.customers=['A','B'].map(letter=>({
  id:customer(letter),tenantId:tenant,name:names[letter],
  createdAt:'2026-11-12T00:00:00Z',
  staffUserIds:letter==='A'?['h-sales','h-it','h-field','h-proc']:[]
}));
const put=(kind,make)=>{
  starter[kind]=['A','B'].map(l=>make(l));
};
const base=(kind,l)=>({id:id(kind,l),customerId:customer(l)});
put('projects',l=>({...base('projects',l),title:'Project '+l,
  projectCode:'PRJ-H-'+l,clientName:names[l],budget:100,
  status:'PROPOSALS_OPEN',createdByUserId:l==='A'?'h-it':'h-owner',
  collaboratorUserIds:l==='A'?['h-sales','h-proc']:[],
  milestones:[{id:id('milestone',l),title:'Milestone '+l,
    amount:10,dueDate:'2027-01-05',status:'PENDING_FUNDING'}]}));
put('assets',l=>({...base('assets',l),
  assetTag:'H-TAG-'+l,name:'Private Asset '+l,
  status:'AVAILABLE_IN_STOCK',
  ...(l==='A'?{assignedUserId:'h-field'}:{})}));
put('endpoints',l=>({...base('endpoints',l),deviceName:'Endpoint '+l,
  ...(l==='A'?{assignedUserId:'h-field'}:{})}));
put('tickets',l=>({...base('tickets',l),title:'Ticket '+l,
  status:'OPEN',...(l==='A'?{assignedUserId:'h-field'}:{})}));
put('jobs',l=>({...base('jobs',l),title:'Job '+l,status:'SCHEDULED',
  ...(l==='A'?{assignedUserId:'h-field'}:{})}));
put('amcs',l=>({...base('amcs',l),contractNumber:'AMC-H-'+l,
  clientName:names[l]}));
put('crmOpportunities',l=>({...base('crmOpportunities',l),
  title:'Deal '+l,clientName:names[l],stage:'LEAD',value:100}));
put('quotes',l=>({...base('quotes',l),customerName:names[l],
  status:'DRAFT',quoteNumber:'Q-H-'+l,subtotal:100}));
put('leads',l=>({...base('leads',l),companyName:names[l],
  status:'NEW',contactPerson:'Synthetic '+l}));
put('proposals',l=>({id:id('proposals',l),projectId:id('projects',l),
  status:'SUBMITTED',providerName:'Synthetic '+l,commercialBid:50,
  timelineDays:10,submittedByUserId:l==='A'?'h-it':'h-owner'}));
put('rmaClaims',l=>({...base('rmaClaims',l),assetId:id('assets',l),
  assetTag:'H-TAG-'+l,stage:'FAULT_LOGGED',faultSymptom:'Test '+l}));
starter.events=[];
fs.writeFileSync(dataFile,JSON.stringify(starter),{mode:0o600});
function freePort(){
  return new Promise((resolve,reject)=>{
    const s=net.createServer();
    s.once('error',reject);
    s.listen(0,'127.0.0.1',()=>{
      const address=s.address();
      const port=address && typeof address!=='string'?address.port:null;
      s.close(()=>port?resolve(port):reject(Error('No fixture port')));
    });
  });
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let child;
let passed=0;
const test=(label,fn)=>{fn();passed++;console.log('PASS '+label);};
try{
  const port=await freePort(),baseURL='http://127.0.0.1:'+port;
  child=spawn(process.execPath,['dist/server.cjs'],{
    env:{...process.env,PORT:String(port),NODE_ENV:'production',
      APEX_DATA_FILE:dataFile,APEX_ALLOW_PRODUCTION_RESET:'false',
      APEX_PG_PILOT_ENABLED:'false',APEX_PG_CRM_READ_THROUGH:'false',
      TELEGRAM_BOT_TOKEN:'',GEMINI_API_KEY:''},
    stdio:['ignore','pipe','pipe']
  });
  let logs='';
  child.stderr.on('data',s=>logs+=s.toString());
  child.stdout.on('data',s=>logs+=s.toString());
  const cookies={};
  async function call(method,route,{role,body,headers={}}={}){
    const r=await fetch(baseURL+route,{method,headers:{
      ...(role?{cookie:cookies[role]}:{}),
      ...(body!==undefined?{'content-type':'application/json'}:{}),
      ...headers
    },body:body===undefined?undefined:JSON.stringify(body)});
    const raw=await r.text();
    let json={};
    try{json=JSON.parse(raw);}catch{}
    return {status:r.status,data:json,cookie:(r.headers.get('set-cookie')||'').split(';')[0]};
  }
  for(let i=0;i<100;i++){
    if(child.exitCode!==null)throw Error('server crashed '+logs);
    try{if((await call('GET','/api/health')).status===200)break;}catch{}
    if(i===99)throw Error('server startup failed '+logs);
    await sleep(90);
  }
  for(const role of Object.keys(roleNames)){
    const r=await call('POST','/api/auth/login',{body:{username:role,password}});
    assert.equal(r.status,200,'fixture login '+role+': '+JSON.stringify(r.data));
    cookies[role]=r.cookie;
  }
  const kinds=['projects','assets','endpoints','tickets','jobs','amcs',
    'crmOpportunities','quotes','leads','proposals','rmaClaims'];
  const actorFor={projects:'sales',assets:'field',endpoints:'field',
    tickets:'field',jobs:'field',amcs:'it',crmOpportunities:'sales',
    quotes:'sales',leads:'sales',proposals:'sales',rmaClaims:'field'};
  const routeFor={crmOpportunities:'/api/crm',rmaClaims:'/api/rma',
    leads:'/api/state'};
  const sourceOwner=await call('GET','/api/state',{role:'owner'});
  assert.equal(sourceOwner.status,200);
  for(const kind of kinds){
    const role=actorFor[kind];
    const route=routeFor[kind]||'/api/'+kind;
    const r=await call('GET',route,{role,
      headers:{'x-apex-tenant-id':'untrusted-tenant-B',
        'x-apex-customer-id':customer('B')}});
    test(kind+' cross-customer list/state excludes B even with forged headers',()=>{
      assert.equal(r.status,200,JSON.stringify(r.data));
      const list=route==='/api/state'?r.data.data[kind]:r.data.data;
      assert.ok(Array.isArray(list),'list missing '+kind);
      assert.equal(list.length,1,JSON.stringify(list));
      assert.equal(list[0].id,id(kind,'A'));
      assert.ok(JSON.stringify(list).includes('A'));
      assert.ok(!JSON.stringify(list).includes('"'+id(kind,'B')+'"'));
    });
  }
  const negativeCreates=[
    ['projects','sales',{customerId:customer('B'),title:'Injected Project',
      clientName:names.B,budget:100}],
    ['tickets','field',{customerId:customer('B'),title:'Injected Ticket'}],
    ['jobs','it',{customerId:customer('B'),title:'Injected Job'}],
    ['assets','it',{customerId:customer('B'),assetTag:'H-INJECTED',name:'Injected Asset'}],
    ['endpoints','it',{customerId:customer('B'),deviceName:'Injected Endpoint'}],
    ['amcs','it',{customerId:customer('B'),clientName:names.B}],
    ['crm','sales',{customerId:customer('B'),clientName:names.B,
      title:'Injected CRM',value:10}],
    ['quotes','sales',{customerId:customer('B'),customerName:names.B,
      items:[{qty:1,sellingPrice:100,purchaseCost:50}]}],
    ['proposals','sales',{projectId:id('projects','B'),
      providerName:'Injected Bid',commercialBid:20,timelineDays:5}],
    ['rma','field',{assetTag:'H-TAG-B',faultSymptom:'Injected fault'}]
  ];
  const objectTargets=[
    ['PATCH','/api/tickets/:id','tickets','field',{status:'IN_PROGRESS'}],
    ['PATCH','/api/tickets/:id/assign','tickets','it',{assignedUserId:null}],
    ['PATCH','/api/endpoints/:id/assign','endpoints','it',{assignedUserId:null}],
    ['PATCH','/api/jobs/:id','jobs','field',{status:'EN_ROUTE'}],
    ['PATCH','/api/jobs/:id/assign','jobs','it',{assignedUserId:null}],
    ['POST','/api/jobs/:id/consume-part','jobs','field',{productId:'test',quantity:1}],
    ['PATCH','/api/assets/:id','assets','it',{status:'IN_USE'}],
    ['PATCH','/api/assets/:id/assign','assets','it',{assignedUserId:null}],
    ['PATCH','/api/projects/:id','projects','it',{title:'Injected Project B'}],
    ['PATCH','/api/proposals/:id/accept','proposals','it',{}],
    ['PATCH','/api/rma/:id','rmaClaims','it',{stage:'OEM_APPROVED',oemCaseNumber:'synthetic'}],
    ['PATCH','/api/crm/:id','crmOpportunities','sales',{stage:'QUALIFIED'}]
  ];
  const allowedPaths=new Set(objectTargets.map(x=>x[0]+' '+x[1]));
  const excluded={
    'PATCH /api/admin/staff/:id/disable':'OWNER_ONLY_STAFF_ADMIN',
    'PATCH /api/customers/:id/access':'OWNER_ONLY_ACCESS_CONTROL',
    'PATCH /api/products/:id':'UNSCOPED_LEGACY_CATALOG',
    'DELETE /api/products/:id':'UNSCOPED_LEGACY_CATALOG',
    'POST /api/rfqs/:id/quotes':'UNSCOPED_LEGACY_RFQ',
    'POST /api/rfqs/:id/dispatch-po':'UNSCOPED_LEGACY_RFQ',
    'PATCH /api/quotes/:id/approve':'OWNER_ONLY_FINANCE_APPROVAL',
    'PATCH /api/quotes/:id/reject':'OWNER_ONLY_FINANCE_APPROVAL',
    'PATCH /api/invoices/:invoiceNo/settle':'OWNER_ONLY_FINANCE_LEGACY',
    'PATCH /api/licenses/:id/reclaim':'OWNER_ONLY_LICENSE_LEGACY',
    'PATCH /api/projects/:id/access':'OWNER_ONLY_PROJECT_ACCESS',
    'POST /api/projects/:id/milestones':'OWNER_ONLY_FINANCIAL_MILESTONE',
    'PATCH /api/projects/:id/milestones/:milestoneId':'OWNER_ONLY_FINANCIAL_MILESTONE',
    'PATCH /api/knowledge/:id':'UNSCOPED_GLOBAL_KNOWLEDGE',
    'POST /api/knowledge/:id/solve':'UNSCOPED_GLOBAL_KNOWLEDGE',
    'PATCH /api/disputes/:id':'OWNER_ONLY_LEGACY_DISPUTE',
    'PATCH /api/workflows/:id/toggle':'OWNER_ONLY_WORKFLOW',
    'POST /api/workflows/:id/execute':'OWNER_ONLY_WORKFLOW'
  };
  const declared=discoverRoutes('server.ts').filter(x=>/\/:/.test(x.path))
    .map(x=>x.method+' '+x.path);
  for(const route of declared)
    assert.ok(allowedPaths.has(route)||Object.hasOwn(excluded,route),
      'Unclassified object API route '+route);
  assert.equal(allowedPaths.size,objectTargets.length);
  assert.equal(allowedPaths.size+Object.keys(excluded).length,declared.length,
    'Object route inventory/exclusions missing or duplicated');
  const before=await call('GET','/api/state',{role:'owner'});
  assert.equal(before.status,200);
  for(const [name,role,body] of negativeCreates){
    const r=await call('POST','/api/'+name,{role,body});
    test('Unauthorized customer B object CREATE denied: '+name,()=>{
      assert.equal(r.status,404,JSON.stringify(r));
      assert.ok(!('data' in r.data),'denied create leaked record');
    });
  }
  for(const [method,template,kind,role,body] of objectTargets){
    const url=template.replace(':id',id(kind,'B'));
    const r=await call(method,url,{role,body});
    test('Unauthorized customer B existing object mutation denied: '+template,()=>{
      assert.equal(r.status,404,JSON.stringify(r));
      assert.ok(!('data' in r.data),'denied edit leaked record');
    });
  }
  const after=await call('GET','/api/state',{role:'owner'});
  assert.equal(after.status,200);
  for(const kind of kinds){
    test('Denied object attempts cannot mutate persisted '+kind,()=>{
      assert.deepEqual(after.data.data[kind],before.data.data[kind]);
    });
  }
  const ownerAssign=await call('PATCH','/api/assets/'+id('assets','B')+'/assign',
    {role:'owner',body:{assignedUserId:'h-field'}});
  test('Even owner cannot assign tenant A field identity to private customer B',()=>{
    assert.equal(ownerAssign.status,403);
  });
  const grant=await call('PATCH','/api/customers/'+customer('A')+'/access',
    {role:'owner',body:{userId:'h-sales',grant:false}});
  test('Owner revokes Sales customer A grant without altering B',()=>{
    assert.equal(grant.status,200);
    assert.ok(!grant.data.data.staffUserIds.includes('h-sales'));
  });
  for(const kind of ['crmOpportunities','quotes','leads','projects','proposals']){
    const route=routeFor[kind]||'/api/'+kind;
    const r=await call('GET',route,{role:'sales'});
    const list=route==='/api/state'?r.data.data[kind]:r.data.data;
    test('Revoked Sales immediately loses '+kind+' under same active session',()=>{
      assert.equal(r.status,200);
      assert.equal(list.length,0);
    });
  }
  console.log(JSON.stringify({
    mode:'PHASE_10_5H_JSON_OBJECT_AUTHORIZATION_MATRIX',
    scopedCollections:kinds.length,
    inaccessibleCreateRoutes:negativeCreates.length,
    deniedExistingObjectWriteRoutes:objectTargets.length,
    sourceObjectRouteDeclarations:declared.length,
    testedObjectRoutes:objectTargets.length,explicitOwnerOnlyOrUnscopedExclusions:
      Object.keys(excluded).length,
    customerGrantRevocationRechecked:true,
    forgedTenantHeadersRejectedByActorDerivedView:true,
    noDeniedCustomerBusinessWrite:true,fullMultiTenantRuntimeProven:false,
    productionCutoverReady:false,checksPassed:passed
  }));
}catch(error){
  console.error('OBJECT AUTHORIZATION MATRIX FAILED: '+error.stack);
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
  fs.rmSync(dir,{recursive:true,force:true});
}
