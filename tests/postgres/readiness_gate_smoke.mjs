// Phase 10.5 — no production access, explicit BLOCKED status, no writes.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import pg from 'pg';

const env=process.env;
if(!/^apex_stage_/.test(env.PGDATABASE||'') ||
   env.APEX_PG_STAGING_ACK!=='STAGING_ONLY_NO_PRODUCTION')
  throw Error('Cutover gate CI suite must use disposable local staging.');
const client=new pg.Client({
  host:env.PGHOST,port:Number(env.PGPORT||5432),
  user:env.PGUSER,password:env.PGPASSWORD,database:env.PGDATABASE
});
let passes=0;
const check=(name,fn)=>{fn();passes++;console.log('PASS '+name);};
const run=(extra={})=>spawnSync(process.execPath,
  ['scripts/postgres/cutover_readiness_gate.mjs'],
  {encoding:'utf8',env:{...env,...extra},timeout:12000});
try {
  await client.connect();
  const before=await client.query(
    'SELECT (SELECT count(*)::integer FROM apex.customer_records) AS records,'+
    '(SELECT count(*)::integer FROM apex.pilot_request_keys) AS keys,'+
    '(SELECT count(*)::integer FROM apex.pilot_audit_events) AS audit');
  const result=run();
  check('Read-only readiness gate exits 3 (BLOCKED), never promotes staging to production',()=>{
    assert.equal(result.status,3,result.stderr);
    assert.equal(result.stderr,'');
  });
  const report=JSON.parse(result.stdout);
  check('All 7 staging migration markers and 15 FORCE-RLS tables verified',()=>{
    assert.equal(report.stagingChecksPassed,true);
    assert.equal(report.checks.postgresMajor16,true);
    assert.equal(report.checks.requiredMigrationMarkers,7);
    assert.equal(report.checks.migrationMarkersPresent,7);
    assert.equal(report.checks.forcedRlsTables,15);
    assert.equal(report.checks.expectedForcedRlsTables,15);
  });
  check('Readiness report rejects production runtime, finance and deployment',()=>{
    assert.equal(report.gate,'BLOCKED');
    assert.equal(report.canDeploy,false);
    assert.equal(report.canSwitchRuntime,false);
    assert.equal(report.canIssuePayments,false);
    assert.equal(report.blockers.length,6);
  });
  check('Restricted signed writer lacks update/delete and direct audit privileges',()=>{
    assert.equal(report.checks.writerHasNoElevatedOrMutationPrivileges,true);
    assert.equal(report.checks.sourceImportProvenanceValid,true);
  });
  check('Gate report includes no database passwords, actor tokens or signing key',()=>{
    assert.ok(!result.stdout.includes(env.PGPASSWORD));
    assert.ok(!result.stdout.includes(env.APEX_PG_PILOT_CONTEXT_KEY));
  });
  const after=await client.query(
    'SELECT (SELECT count(*)::integer FROM apex.customer_records) AS records,'+
    '(SELECT count(*)::integer FROM apex.pilot_request_keys) AS keys,'+
    '(SELECT count(*)::integer FROM apex.pilot_audit_events) AS audit');
  check('Assessment never modifies any business, request-key or audit rows',()=>{
    assert.deepEqual(after.rows,before.rows);
  });
  const unsafe=run({PGDATABASE:'postgres'});
  check('Readiness command refuses default/non-staging database target',()=>{
    assert.equal(unsafe.status,2);
    assert.match(unsafe.stderr,/CUTOVER ASSESSMENT REFUSED/);
  });
  const prod=run({NODE_ENV:'production'});
  check('Readiness command refuses production environment',()=>{
    assert.equal(prod.status,2);
    assert.match(prod.stderr,/CUTOVER ASSESSMENT REFUSED/);
  });
  console.log('POSTGRES CUTOVER GATE SUMMARY: '+passes+'/'+passes+' PASSED');
} finally {await client.end().catch(()=>{});}
