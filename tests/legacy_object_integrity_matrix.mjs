// Phase 10.5I: ALL 18 previously excluded legacy/owner-only object paths
// must prove unauthorized-role denial, unknown-object nonmutation, and
// catalog identity/PO quote hardening. Single-tenant JSON fixture only.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {discoverRoutes} from './business_route_inventory.mjs';

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'apex-legacy-object-'));
const stateFile=path.join(tmp,'isolated.json');
const baseline=JSON.parse(fs.readFileSync('data/app-store.json','utf8'));
const roles={owner:'BUSINESS_OWNER',sales:'SALES_MANAGER',
  procurement:'PROCUREMENT_LEAD',it:'ENTERPRISE_IT_HEAD',field:'FIELD_ENGINEER'};
const pass='SyntheticOwnerLegacyScope!2026';
baseline.users=Object.entries(roles).map(([name,role])=>{
  const salt=crypto.randomBytes(16).toString('hex');
  return {id:'i-'+name,name,username:name,email:name+'@example.invalid',
    tenantId:baseline.tenant.id,role,salt,
    passwordHash:crypto.scryptSync(pass,salt,64).toString('hex'),
    createdAt:'2026-11-13T00:00:00Z'};
});
baseline.customers=[
  {id:'i-client-a',name:'Client A',tenantId:baseline.tenant.id,
    createdAt:'2026-11-13T00:00:00Z',staffUserIds:['i-sales','i-procurement','i-it','i-field']},
  {id:'i-client-b',name:'Client B',tenantId:baseline.tenant.id,
    createdAt:'2026-11-13T00:00:00Z',staffUserIds:[]}
];
for(const key of ['products','rfqs','suppliers','quotes','invoices','licenses',
  'knowledgeArticles','marketplaceDisputes','workflows','projects'])baseline[key]=[];
fs.writeFileSync(stateFile,JSON.stringify(baseline),{mode:0o600});
function port(){
  return new Promise((resolve,reject)=>{
    const server=net.createServer();
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>{
      const a=server.address();
      if(!a||typeof a==='string')return reject(Error('invalid ephemeral port'));
      server.close(()=>resolve(a.port));
    });
  });
}
let child;
let checks=0;
const test=(message,cb)=>{cb();checks++;console.log('PASS '+message);};
const paths=[
 ['PATCH','/api/admin/staff/:id/disable','owner','sales',{},404],
 ['PATCH','/api/customers/:id/access','owner','sales',{userId:'i-sales',grant:true},404],
 ['PATCH','/api/products/:id','procurement','sales',{name:'Not Found'},404],
 ['DELETE','/api/products/:id','procurement','sales',{},404],
 ['POST','/api/rfqs/:id/quotes','procurement','sales',
  {supplierId:'supplier-only',supplierName:'Synthetic',unitCost:10,leadTimeDays:1,inStock:true},404],
 ['POST','/api/rfqs/:id/dispatch-po','procurement','sales',{supplierId:'supplier-only'},404],
 ['PATCH','/api/quotes/:id/approve','owner','sales',{},404],
 ['PATCH','/api/quotes/:id/reject','owner','sales',{reason:'Internal-only rejection'},404],
 ['PATCH','/api/invoices/:invoiceNo/settle','owner','sales',
  {paymentReference:'not-a-real-payment',method:'OFFLINE_TEST'},404],
 ['PATCH','/api/licenses/:id/reclaim','owner','sales',{},404],
 ['PATCH','/api/projects/:id/access','owner','sales',{userId:'i-sales',grant:true},404],
 ['POST','/api/projects/:id/milestones','owner','sales',
  {title:'Private milestone',amount:5,dueDate:'2027-01-05'},404],
 ['PATCH','/api/projects/:id/milestones/:milestoneId','owner','sales',
  {status:'IN_PROGRESS'},404],
 ['PATCH','/api/knowledge/:id','it','procurement',{summary:'No object'},404],
 ['POST','/api/knowledge/:id/solve','field','procurement',{},404],
 ['PATCH','/api/disputes/:id','owner','sales',{resolutionDecision:'REWORK_RECOMMENDED'},404],
 ['PATCH','/api/workflows/:id/toggle','owner','sales',{},501],
 ['POST','/api/workflows/:id/execute','owner','sales',{},501]
];
const key=(m,p)=>m+' '+p;
const ids=new Set(paths.map(x=>key(x[0],x[1])));
const covered=new Set([
 'PATCH /api/tickets/:id','PATCH /api/tickets/:id/assign',
 'PATCH /api/endpoints/:id/assign',
 'PATCH /api/jobs/:id','PATCH /api/jobs/:id/assign',
 'POST /api/jobs/:id/consume-part','PATCH /api/assets/:id',
 'PATCH /api/assets/:id/assign','PATCH /api/projects/:id',
 'PATCH /api/proposals/:id/accept','PATCH /api/rma/:id',
 'PATCH /api/crm/:id'
]);
const inventory=discoverRoutes('server.ts').filter(x=>x.path.includes('/:'));
assert.equal(paths.length,18);
assert.equal(ids.size,18);
assert.equal(inventory.length,30,'Any additional dynamic object route needs explicit test coverage');
for(const route of inventory)
  assert.ok(ids.has(key(route.method,route.path))||covered.has(key(route.method,route.path)),
    'Uncovered dynamic object API: '+route.method+' '+route.path);
let cookie={};
try{
  const p=await port(),origin='http://127.0.0.1:'+p;
  child=spawn(process.execPath,['dist/server.cjs'],{
    env:{...process.env,NODE_ENV:'production',PORT:String(p),
      APEX_DATA_FILE:stateFile,APEX_ALLOW_PRODUCTION_RESET:'false',
      APEX_PG_PILOT_ENABLED:'false',APEX_PG_CRM_READ_THROUGH:'false',
      TELEGRAM_BOT_TOKEN:'',GEMINI_API_KEY:''},
    stdio:['ignore','pipe','pipe']
  });
  let output='';
  child.stdout.on('data',s=>output+=s.toString());
  child.stderr.on('data',s=>output+=s.toString());
  async function http(method,endpoint,{role,body}={}){
    const response=await fetch(origin+endpoint,{
      method,headers:{
        ...(role?{cookie:cookie[role]}:{}),
        ...(body===undefined?{}:{'content-type':'application/json'})
      },body:body===undefined?undefined:JSON.stringify(body)});
    const raw=await response.text();
    let data={};
    try{data=JSON.parse(raw);}catch{data={other:raw.slice(0,100)};}
    return {status:response.status,data};
  }
  for(let i=0;i<100;i++){
    if(child.exitCode!==null)throw Error('Server failed '+output);
    try{if((await http('GET','/api/health')).status===200)break;}catch{}
    if(i===99)throw Error('Server unavailable '+output);
    await new Promise(r=>setTimeout(r,80));
  }
  for(const role of Object.keys(roles)){
    const res=await fetch(origin+'/api/auth/login',{method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({username:role,password:pass})});
    assert.equal(res.status,200,'fixture login '+role);
    cookie[role]=(res.headers.get('set-cookie')||'').split(';')[0];
  }
  const snapshot=()=>http('GET','/api/state',{role:'owner'});
  const before=await snapshot();assert.equal(before.status,200);
  for(const [method,template,authorized,wrongRole,body,expected] of paths){
    const route=template.replace(':invoiceNo','i-missing-invoice')
      .replace(':milestoneId','i-missing-milestone')
      .replace(':id','i-nonexistent');
    const denied=await http(method,route,{role:wrongRole,body});
    test('Incorrect authenticated role blocked '+method+' '+template,()=>{
      assert.equal(denied.status,403,JSON.stringify(denied.data));
      assert.ok(!('data' in denied.data));
    });
    const absent=await http(method,route,{role:authorized,body});
    test('Missing legacy object or disabled adapter fails closed '+method+' '+template,()=>{
      assert.equal(absent.status,expected,JSON.stringify(absent.data));
      assert.ok(!('data' in absent.data));
    });
  }
  const after=await snapshot();assert.equal(after.status,200);
  for(const name of ['products','rfqs','suppliers','quotes','invoices','licenses',
    'knowledgeArticles','marketplaceDisputes','workflows','projects','events']){
    test('Legacy unknown-object probes left '+name+' unchanged',()=>{
      assert.deepEqual(after.data.data[name],before.data.data[name]);
    });
  }

  let r=await http('POST','/api/products',{role:'procurement',body:{
    id:'i-injected-product',sku:'I-FORGE',name:'Forgery',category:'Storage'
  }});
  test('Catalog create cannot inject caller-controlled source ID',()=>{
    assert.equal(r.status,400);
  });
  r=await http('POST','/api/products',{role:'procurement',body:{
    sku:'I-SSD-1',name:'Ephemeral SSD',category:'Storage',
    purchaseCost:10,sellingPrice:25,stockAvailable:5,stockReserved:0
  }});
  test('Legitimate procurement product registration uses server identity',()=>{
    assert.equal(r.status,201,JSON.stringify(r.data));
    assert.ok(r.data.data.id.startsWith('prod-'));
  });
  const productId=r.data.data.id;
  for(const changes of [
    {id:'i-injected'}, {tenantId:'forged-tenant'}, {customerId:'i-client-b'},
    {status:'SETTLED'}, {stockReserved:99},{purchaseCost:-1},
    {specs:{nested:'exploit'}}
  ]){
    const res=await http('PATCH','/api/products/'+productId,
      {role:'procurement',body:changes});
    test('Typed catalog PATCH blocks identity, provenance, stock and nested payload injection '+JSON.stringify(changes),()=>{
      assert.equal(res.status,400,JSON.stringify(res.data));
    });
  }
  r=await http('POST','/api/products',{role:'procurement',body:{
    sku:'i-ssd-1',name:'Duplicate SKU'
  }});
  test('SKU uniqueness is case-insensitive and immutable across stock',()=>{
    assert.equal(r.status,409);
  });
  r=await http('PATCH','/api/products/'+productId,
    {role:'procurement',body:{sellingPrice:35,stockReserved:1}});
  test('Authorized typed product update continues to work',()=>{
    assert.equal(r.status,200);
    assert.equal(r.data.data.sellingPrice,35);
    assert.equal(r.data.data.id,productId);
  });
  r=await http('POST','/api/suppliers',{role:'procurement',body:{
    id:'i-injected-supplier',name:'Forged supplier'
  }});
  test('Supplier ID is server-authoritative, never accepted from requester',()=>{
    assert.equal(r.status,400);
  });
  r=await http('POST','/api/suppliers',{role:'procurement',body:{name:'Synthetic supplier'}});
  test('Valid supplier catalog entry has server-generated identity',()=>{
    assert.equal(r.status,201);
    assert.ok(r.data.data.id.startsWith('sup-'));
  });
  for(const payload of [
    {id:'i-injected-rfq',productName:'RFQ identity',requiredQty:1,urgency:'LOW'},
    {productName:'Fake PO',requiredQty:1,urgency:'LOW',preparedPO:{deliveryStatus:'SENT'}},
    {productName:'Fake quotes',requiredQty:1,urgency:'LOW',
      supplierQuotes:[{supplierId:'i-fake',unitCost:0}]}
  ]){
    r=await http('POST','/api/rfqs',{role:'procurement',body:payload});
    test('RFQ create rejects client identity and supplier/PO provenance injection',()=>{
      assert.equal(r.status,400,JSON.stringify(r.data));
    });
  }
  r=await http('POST','/api/rfqs',{role:'procurement',body:{
    productName:'Test SKU',requiredQty:2,urgency:'LOW',status:'PO_DISPATCHED'
  }});
  test('Historic caller status ignored while server issues OPEN RFQ identity',()=>{
    assert.equal(r.status,201);
    assert.ok(r.data.data.id.startsWith('rfq-'));
    assert.equal(r.data.data.status,'OPEN');
    assert.deepEqual(r.data.data.supplierQuotes,[]);
    assert.ok(!r.data.data.preparedPO);
  });
  const rfqId=r.data.data.id;
  const quote={supplierId:'supplier-synthetic',supplierName:'Fixture supplier',
    unitCost:40,leadTimeDays:4,inStock:true};
  r=await http('POST','/api/rfqs/'+rfqId+'/quotes',{role:'procurement',
    body:{...quote,recommended:true}});
  test('Client cannot self-certify recommended supplier quote',()=>{
    assert.equal(r.status,400);
  });
  r=await http('POST','/api/rfqs/'+rfqId+'/quotes',{role:'procurement',body:quote});
  test('Legitimate supplier quotation recorded without client status flags',()=>{
    assert.equal(r.status,200);
    assert.equal(r.data.data.supplierQuotes.length,1);
  });
  r=await http('POST','/api/rfqs/'+rfqId+'/quotes',{role:'procurement',body:quote});
  test('Same supplier cannot duplicate a previously recorded quote',()=>{
    assert.equal(r.status,409);
  });
  r=await http('POST','/api/rfqs/'+rfqId+'/dispatch-po',{role:'procurement',
    body:{supplierId:quote.supplierId}});
  test('PO preparation is internal only with recorded supplier amount',()=>{
    assert.equal(r.status,200,JSON.stringify(r.data));
    assert.equal(r.data.delivery,'NOT_SENT');
    assert.equal(r.data.data.preparedPO.deliveryStatus,'NOT_SENT');
    assert.equal(r.data.data.preparedPO.amount,80);
  });
  r=await http('POST','/api/rfqs/'+rfqId+'/quotes',{role:'procurement',
    body:{...quote,supplierId:'other-supplier'}});
  test('Prepared purchase order freezes supplier quote history',()=>{
    assert.equal(r.status,409);
  });
  const finalState=await snapshot();assert.equal(finalState.status,200);
  test('Every forbidden ID/customer spoof leaves catalog product identity authoritative',()=>{
    const products=finalState.data.data.products.filter(x=>x.sku==='I-SSD-1');
    assert.equal(products.length,1);
    assert.equal(products[0].id,productId);
    assert.equal(products[0].sellingPrice,35);
    assert.equal(products[0].stockReserved,1);
    assert.ok(!('customerId' in products[0]));
    assert.ok(!('tenantId' in products[0]));
  });
  test('Every forbidden RFQ injection leaves exactly one prepared internal PO',()=>{
    const rfqs=finalState.data.data.rfqs.filter(x=>x.id===rfqId);
    assert.equal(rfqs.length,1);
    assert.equal(rfqs[0].supplierQuotes.length,1);
    assert.equal(rfqs[0].status,'PO_PREPARED');
    assert.equal(rfqs[0].preparedPO.deliveryStatus,'NOT_SENT');
  });
  console.log(JSON.stringify({
    mode:'PHASE_10_5I_LEGACY_OBJECT_MUTATION_HARDENING',
    remainingParameterizedRoutes:paths.length,
    protectedRouteWrongRoleDenials:paths.length,
    protectedMissingObjectOrDisabledAdapterDenials:paths.length,
    ownerOnlyAndLegacyDataRemainsTenantWide:true,
    productIdsServerIssued:true,rfqPoAndQuoteSpoofingDenied:true,
    externalDeliveryEnabled:false,realMultiTenantJsonProven:false,
    productionCutoverReady:false,passed:checks
  }));
}catch(error){
  console.error('LEGACY OBJECT MATRIX FAILURE '+error.stack);
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
  fs.rmSync(tmp,{recursive:true,force:true});
}
