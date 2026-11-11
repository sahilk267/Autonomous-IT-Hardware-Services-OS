#!/usr/bin/env node
// Phase 10.5 — READ-ONLY, fail-closed PostgreSQL pre-cutover assessment.
// Intentionally NEVER authorizes a production cutover. Not a migration command.
import pg from 'pg';

const e=process.env;
if(process.argv.length!==2 ||
   !['127.0.0.1','localhost'].includes(e.PGHOST||'') ||
   !/^apex_stage_[a-z0-9_]{2,60}$/.test(e.PGDATABASE||'') ||
   e.APEX_PG_STAGING_ACK!=='STAGING_ONLY_NO_PRODUCTION' ||
   e.NODE_ENV==='production' || !!e.DATABASE_URL || !!e.APEX_PG_RUNTIME_ENABLED){
  console.error('CUTOVER ASSESSMENT REFUSED: only local isolated PostgreSQL staging.');
  process.exit(2);
}
const requiredVersions=[
  '10.1-staging','10.2-pilot','10.3a-context-domain',
  '10.3b-field-assets','10.4a-commerce-drafts','10.5a-idempotent-drafts',
  '10.5b-normalized-service'
];
const names=[
  'tenants','staff','customers','customer_grants','customer_records',
  'project_shares','owner_legacy_records','audit_events','staging_imports',
  'pilot_audit_events','pilot_procurement_drafts','pilot_finance_previews',
  'pilot_request_keys','pilot_service_work_orders','pilot_service_work_order_events'
];
const hardBlockers=[
  'JSON_BUSINESS_RUNTIME_IS_SYSTEM_OF_RECORD',
  'ALL_MODULE_SQL_TRANSACTIONAL_PARITY_NOT_IMPLEMENTED',
  'PRODUCTION_DATABASE_IDENTITY_AND_SECRET_MANAGEMENT_UNREVIEWED',
  'HISTORICAL_CUSTOMER_DATA_CROSSWALK_AND_PARITY_NOT_APPROVED',
  'EXTERNAL_FINANCE_PROCUREMENT_PROVIDER_SANDBOX_EVIDENCE_MISSING',
  'PRODUCTION_BACKUP_RESTORE_CUTOVER_AND_ROLLBACK_NOT_APPROVED'
];
const client=new pg.Client({
  host:e.PGHOST,port:Number(e.PGPORT||5432),
  user:e.PGUSER,password:e.PGPASSWORD,database:e.PGDATABASE,
  connectionTimeoutMillis:3000,statement_timeout:8000
});
let connected=false,transaction=false;
try {
  await client.connect();connected=true;
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  transaction=true;
  const ro=await client.query("SHOW transaction_read_only");
  if(ro.rows[0].transaction_read_only!=='on')
    throw Error('Read-only verification transaction could not be established.');
  const version=await client.query("SELECT current_setting('server_version_num')::integer AS num");
  const versions=(await client.query('SELECT version FROM apex.schema_versions')).rows.map(x=>x.version);
  const rls=(await client.query(
    "SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c "+
    "JOIN pg_namespace n ON n.oid=c.relnamespace "+
    "WHERE n.nspname='apex' AND c.relname=ANY($1::text[]) AND c.relkind='r'",
    [names])).rows;
  const writer=(await client.query(
    "SELECT rolcanlogin,rolinherit,rolsuper,rolbypassrls "+
    "FROM pg_roles WHERE rolname='apex_pilot_writer'")).rows;
  const dangerousGrants=await client.query(
    "SELECT has_table_privilege('apex_pilot_writer','apex.pilot_finance_previews','UPDATE') AS finance_update,"+
    "has_table_privilege('apex_pilot_writer','apex.pilot_procurement_drafts','UPDATE') AS procurement_update,"+
    "has_table_privilege('apex_pilot_writer','apex.pilot_request_keys','UPDATE') AS key_update,"+
    "has_table_privilege('apex_pilot_writer','apex.pilot_request_keys','DELETE') AS key_delete,"+
    "has_table_privilege('apex_pilot_writer','apex.pilot_audit_events','INSERT') AS audit_insert");
  const provenance=(await client.query(
    'SELECT tenant_id,sha256 FROM apex.staging_imports')).rows;
  const countRecords=await client.query('SELECT count(*)::integer n FROM apex.customer_records');
  const countDrafts=await client.query(
    'SELECT (SELECT count(*)::integer FROM apex.pilot_procurement_drafts) AS procurement,'+
    '(SELECT count(*)::integer FROM apex.pilot_finance_previews) AS finance,'+
    '(SELECT count(*)::integer FROM apex.pilot_request_keys) AS retry_keys');
  const schemaOk=requiredVersions.every(x=>versions.includes(x)) &&
    rls.length===names.length &&
    rls.every(x=>x.relrowsecurity && x.relforcerowsecurity);
  const restrictedWriter=writer.length===1 &&
    writer[0].rolcanlogin===false && writer[0].rolinherit===false &&
    writer[0].rolsuper===false && writer[0].rolbypassrls===false &&
    Object.values(dangerousGrants.rows[0]).every(x=>x===false);
  const provenanceOk=provenance.length===1 &&
    provenance.every(x=>/^[0-9a-f]{64}$/.test(x.sha256));
  const pg16=version.rows[0].num>=160000 && version.rows[0].num<170000;
  const stagingChecksPassed=pg16 && schemaOk && restrictedWriter && provenanceOk;
  const report={
    gate:'BLOCKED',
    mode:'READ_ONLY_STAGING_PRE_CUTOVER_ASSESSMENT',
    canDeploy:false,canSwitchRuntime:false,canIssuePayments:false,
    stagingChecksPassed,
    checks:{
      postgresMajor16:pg16,
      requiredMigrationMarkers:requiredVersions.length,
      migrationMarkersPresent:requiredVersions.filter(x=>versions.includes(x)).length,
      forcedRlsTables:rls.filter(x=>x.relrowsecurity&&x.relforcerowsecurity).length,
      expectedForcedRlsTables:names.length,
      writerHasNoElevatedOrMutationPrivileges:restrictedWriter,
      sourceImportProvenanceValid:provenanceOk,
      scopedRecordCount:countRecords.rows[0].n,
      internalProcurementDrafts:countDrafts.rows[0].procurement,
      unissuedFinancePreviews:countDrafts.rows[0].finance,
      immutableRetryKeys:countDrafts.rows[0].retry_keys
    },
    blockers:hardBlockers
  };
  await client.query('ROLLBACK');transaction=false;
  console.log(JSON.stringify(report,null,2));
  // 3 means safely BLOCKED. 1 means an integrity check failed.
  process.exitCode=stagingChecksPassed?3:1;
}catch(error){
  console.error('CUTOVER ASSESSMENT ERROR: '+error.message);
  process.exitCode=1;
}finally{
  if(transaction)await client.query('ROLLBACK').catch(()=>{});
  if(connected)await client.end().catch(()=>{});
}
