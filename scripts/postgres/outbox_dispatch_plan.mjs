#!/usr/bin/env node
// Phase 10.5D: deterministic read-only outbox dispatch *DESIGN CHECK*.
// No delivery worker, no HTTP request, no lease, no status update, no credentials.
// Exit 3 = correctly BLOCKED; 1 = invalid integrity; 2 = unsafe environment.
import pg from 'pg';
const e=process.env;
if(process.argv.length!==2||
  !['127.0.0.1','localhost'].includes(e.PGHOST||'')||
  !/^apex_stage_[a-z0-9_]{2,60}$/.test(e.PGDATABASE||'')||
  e.APEX_PG_STAGING_ACK!=='STAGING_ONLY_NO_PRODUCTION'||
  e.NODE_ENV==='production'||e.DATABASE_URL||e.APEX_PG_RUNTIME_ENABLED||
  e.APEX_OUTBOX_DISPATCH_ENABLED==='true'){
  console.error('OUTBOX DESIGN REFUSED: isolated read-only staging with delivery disabled required.');
  process.exit(2);
}
const db=new pg.Client({
  host:e.PGHOST,port:Number(e.PGPORT||5432),
  user:e.PGUSER,password:e.PGPASSWORD,database:e.PGDATABASE,
  connectionTimeoutMillis:3000,statement_timeout:10000
});
let connected=false,tx=false;
try{
  await db.connect();connected=true;
  await db.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');tx=true;
  const ro=await db.query('SHOW transaction_read_only');
  if(ro.rows[0].transaction_read_only!=='on')throw Error('not read-only');
  const v=await db.query(
    "SELECT stage_only FROM apex.schema_versions WHERE version='10.5c-shadow-outbox'");
  if(v.rowCount!==1||!v.rows[0].stage_only)throw Error('outbox schema marker absent');
  const roles=await db.query(
    "SELECT has_table_privilege('apex_pilot_writer','apex.pilot_service_outbox','INSERT') AS ins,"+
    "has_table_privilege('apex_pilot_writer','apex.pilot_service_outbox','UPDATE') AS upd,"+
    "has_table_privilege('apex_pilot_writer','apex.pilot_service_outbox','DELETE') AS del");
  if(Object.values(roles.rows[0]).some(Boolean))
    throw Error('application writer gained delivery/mutation privilege');
  const rls=await db.query(
    "SELECT relrowsecurity,relforcerowsecurity FROM pg_class "+
    "WHERE oid='apex.pilot_service_outbox'::regclass");
  if(rls.rowCount!==1 || !rls.rows[0].relrowsecurity ||
    !rls.rows[0].relforcerowsecurity)
    throw Error('outbox FORCE RLS missing');
  const [events,outbox]=await Promise.all([
    db.query('SELECT tenant_id,customer_id,order_id,revision,operation,next_status '+
      'FROM apex.pilot_service_work_order_events'),
    db.query('SELECT tenant_id,customer_id,order_id,revision,event_type,event_data,'+
      'delivery_state,delivery_enabled,delivery_attempts FROM apex.pilot_service_outbox')
  ]);
  const key=r=>[r.tenant_id,r.order_id,r.revision].join(':');
  const keyed=new Map(outbox.rows.map(r=>[key(r),r]));
  if(keyed.size!==outbox.rows.length||events.rows.length!==outbox.rows.length)
    throw Error('event/outbox count or uniqueness drift');
  for(const record of events.rows){
    const entry=keyed.get(key(record));
    if(!entry||entry.customer_id!==record.customer_id||
       entry.event_type!=='service.work_order.changed'||
       entry.delivery_state!=='PENDING_REVIEW'||
       entry.delivery_enabled!==false||entry.delivery_attempts!==0||
       entry.event_data?.orderId!==record.order_id||
       entry.event_data?.revision!==record.revision||
       entry.event_data?.operation!==record.operation||
       entry.event_data?.status!==record.next_status||
       Object.keys(entry.event_data).sort().join(',')!=='operation,orderId,revision,status'){
      throw Error('outbox/history/protected event payload mismatch');
    }
  }
  const report={
    mode:'STAGING_OUTBOX_DISPATCH_DESIGN_REVIEW_ONLY',
    decision:'BLOCKED',dispatchEnabled:false,canSend:false,
    providerConfigured:false,paymentEnabled:false,networkDeliveries:0,
    SQLTransactionReadOnly:true,forceRls:true,writerMutationDenied:true,
    pendingInternalEvents:outbox.rows.length,
    historyParityVerified:true,sourcePayloadsExposed:false,
    designGates:[
      'PROVIDER_SANDBOX_AND_CONTRACT_NOT_APPROVED',
      'DELIVERY_PAYLOAD_PRIVACY_AND_SIGNATURE_REVIEW_PENDING',
      'DURABLE_CONSUMER_IDEMPOTENCY_AND_RETRY_DLQ_NOT_DESIGNED',
      'TENANT_SCOPED_WORKER_IDENTITY_KMS_AND_LEASES_MISSING',
      'EXTERNAL_RECEIPT_AUDIT_REPLAY_AND_RECOVERY_NOT_CERTIFIED',
      'PRODUCTION_RELEASE_AND_ROLLBACK_NOT_AUTHORIZED'
    ]
  };
  await db.query('ROLLBACK');tx=false;
  console.log(JSON.stringify(report,null,2));
  process.exitCode=3;
}catch(error){
  console.error('OUTBOX DESIGN FAILED: '+error.message);
  process.exitCode=1;
}finally{
  if(tx)await db.query('ROLLBACK').catch(()=>{});
  if(connected)await db.end().catch(()=>{});
}
