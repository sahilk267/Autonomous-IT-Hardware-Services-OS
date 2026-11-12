// Phase 10.5D: zero-side-effect dispatch design preflight. No external calls.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import pg from 'pg';
const e=process.env;
if(!/^apex_stage_/.test(e.PGDATABASE||'')||
   e.APEX_PG_STAGING_ACK!=='STAGING_ONLY_NO_PRODUCTION')
  throw Error('OUTBOX PLAN TEST REFUSED');
const db=new pg.Client({host:e.PGHOST,port:Number(e.PGPORT||5432),
  user:e.PGUSER,password:e.PGPASSWORD,database:e.PGDATABASE});
let passed=0;
const check=(name,fn)=>{fn();passed++;console.log('PASS '+name);};
const run=extra=>spawnSync(process.execPath,
  ['scripts/postgres/outbox_dispatch_plan.mjs'],
  {encoding:'utf8',timeout:15000,env:{...e,...extra}});
try{
  await db.connect();
  const first=(await db.query(
    'SELECT (SELECT count(*)::integer FROM apex.pilot_service_outbox) AS outbox,'+
    '(SELECT count(*)::integer FROM apex.pilot_service_work_order_events) AS events,'+
    '(SELECT count(*)::integer FROM apex.pilot_audit_events) AS audit'
  )).rows;
  const accepted=run({});
  check('Outbox design assessment safely exits 3 BLOCKED',()=>{
    assert.equal(accepted.status,3,accepted.stderr);
    assert.equal(accepted.stderr,'');
  });
  const report=JSON.parse(accepted.stdout);
  check('Exactly matching internal events remain pending and delivery disabled',()=>{
    assert.equal(report.decision,'BLOCKED');
    assert.equal(report.dispatchEnabled,false);
    assert.equal(report.canSend,false);
    assert.equal(report.pendingInternalEvents,first[0].outbox);
    assert.ok(report.pendingInternalEvents>=5);
    assert.equal(report.historyParityVerified,true);
  });
  check('Read-only SQL, FORCE RLS, restricted writer, zero external side effects',()=>{
    assert.equal(report.SQLTransactionReadOnly,true);
    assert.equal(report.forceRls,true);
    assert.equal(report.writerMutationDenied,true);
    assert.equal(report.networkDeliveries,0);
    assert.equal(report.sourcePayloadsExposed,false);
    assert.equal(report.designGates.length,6);
  });
  const second=(await db.query(
    'SELECT (SELECT count(*)::integer FROM apex.pilot_service_outbox) AS outbox,'+
    '(SELECT count(*)::integer FROM apex.pilot_service_work_order_events) AS events,'+
    '(SELECT count(*)::integer FROM apex.pilot_audit_events) AS audit'
  )).rows;
  check('Design assessment cannot mutate staged history/outbox/audit rows',()=>{
    assert.deepEqual(second,first);
  });
  const badDb=run({PGDATABASE:'postgres'});
  check('Unsafe/default DB target is refused before connection',()=>{
    assert.equal(badDb.status,2);
    assert.match(badDb.stderr,/OUTBOX DESIGN REFUSED/);
  });
  const prod=run({NODE_ENV:'production'});
  check('Production environment refuses outbox dispatch design command',()=>{
    assert.equal(prod.status,2);
  });
  const flag=run({APEX_OUTBOX_DISPATCH_ENABLED:'true'});
  check('An attempted enable-delivery flag is explicitly refused',()=>{
    assert.equal(flag.status,2);
  });
  const send=spawnSync(process.execPath,
    ['scripts/postgres/outbox_dispatch_plan.mjs','--send'],
    {encoding:'utf8',env:e,timeout:10000});
  check('Command has no --send or delivery operation',()=>{
    assert.equal(send.status,2);
  });
  console.log('POSTGRES OUTBOX DESIGN SUMMARY: '+passed+'/'+passed+' PASSED');
}finally {await db.end().catch(()=>{});}
