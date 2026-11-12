// Phase 10.2 — separately authenticated PostgreSQL staging pilot, not a production runtime switch.
// Main JSON /api endpoints and PersistentStore remain untouched.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import type { Express, Request, RequestHandler } from 'express';
import type { PersistentStore } from './db.ts';
import { compareStagingRepository, readVerifiedCrmThrough } from './staging_read_repository.ts';
import type { UserRole } from '../src/types.ts';

type Actor = { userId: string; role: UserRole; tenantId: string };
type PilotResult = { status: number; data: unknown };
type PilotOperation = (client: PoolClient, actor: Actor, req: Request) => Promise<PilotResult>;
const allowedStages = new Set(['LEAD','QUALIFIED','TECHNICAL_SCOPING','PROPOSAL_SENT','NEGOTIATION','WON','LOST']);

class PilotError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
function reject(status: number, message: string): never { throw new PilotError(status,message); }
function strictBody(input: unknown, keys: readonly string[]): Record<string,unknown> {
  if(!input || typeof input!=='object' || Array.isArray(input) ||
    Object.keys(input).some(key=>!keys.includes(key))) {
    reject(400,'Unrecognized or missing request fields.');
  }
  return input as Record<string,unknown>;
}

export function registerPostgresPilotRoutes(
  app: Express, requireAuth: RequestHandler,
  requireRole: (...roles: UserRole[]) => RequestHandler,
  store: PersistentStore
) {
  // Reject an isolated shadow toggle without the existing signed SQL pilot.
  // A production environment is always forbidden even when both flags are set.
  const repositoryShadowEnabled=process.env.APEX_PG_REPOSITORY_SHADOW_READS==='true';
  const crmReadThroughEnabled=process.env.APEX_PG_CRM_READ_THROUGH==='true';
  if((repositoryShadowEnabled || crmReadThroughEnabled) &&
    (process.env.NODE_ENV!=='staging' ||
      process.env.APEX_PG_PILOT_ENABLED!=='true')) {
    throw new Error('REPOSITORY SHADOW SAFETY: staging signed SQL pilot required.');
  }
  if(process.env.APEX_PG_PILOT_ENABLED!=='true') return null;

  const options={
    host:process.env.APEX_PG_PILOT_HOST||'',
    database:process.env.APEX_PG_PILOT_DB||'',
    user:process.env.APEX_PG_PILOT_USER||'',
    password:process.env.APEX_PG_PILOT_PASSWORD||'',
    port:Number(process.env.APEX_PG_PILOT_PORT||5432)
  };
  const jsonFile=process.env.APEX_DATA_FILE||'';
  const canonical=jsonFile && fs.existsSync(jsonFile) ? fs.realpathSync(jsonFile) : jsonFile;
  const rel=canonical?path.relative(process.cwd(),canonical):'';
  const inCheckout=rel==='' || (rel!=='..' && !rel.startsWith('..'+path.sep) && !path.isAbsolute(rel));
  if(process.env.NODE_ENV!=='staging' ||
    process.env.APEX_PG_PILOT_ACK!=='LOCAL_STAGING_ONLY_NO_CUTOVER' ||
    process.env.APEX_PG_STAGING_ACK!=='STAGING_ONLY_NO_PRODUCTION' ||
    !['127.0.0.1','localhost'].includes(options.host) ||
    !/^apex_stage_[a-z0-9_]{2,60}$/.test(options.database) ||
    options.user!=='apex_pilot_login' || !options.password ||
    !/^[0-9a-f]{64}$/.test(process.env.APEX_PG_PILOT_CONTEXT_KEY||'') ||
    !Number.isInteger(options.port) || options.port<1 || options.port>65535 ||
    !path.isAbsolute(jsonFile) || inCheckout ||
    !!process.env.DATABASE_URL || !!process.env.APEX_PG_RUNTIME_ENABLED) {
    throw new Error('STAGING PILOT SAFETY: refusing runtime outside isolated loopback staging.');
  }
  const pool=new Pool({
    ...options,max:4,connectionTimeoutMillis:2500,
    idleTimeoutMillis:5000,statement_timeout:5000,query_timeout:7000,ssl:false
  });
  async function transact(req: Request, operation: PilotOperation,
    readOnly=false): Promise<PilotResult> {
    const session=(req as any).user as {userId?:string;role?:UserRole};
    const user=session?.userId ? store.getUserById(session.userId) : undefined;
    const currentTenant=store.getState().tenant.id;
    if(!user || !user.passwordHash || user.disabledAt || user.tenantId!==currentTenant ||
       session.role!==user.role) {
      reject(403,'Authenticated actor does not belong to this staging tenant.');
    }
    const actor:Actor={userId:user.id,role:user.role,tenantId:currentTenant};
    // Only retry transactions that cannot have committed. No external side
    // effects are executed by this staging-only SQL service. Every attempt
    // obtains a fresh serializable snapshot and a NEW transaction-bound signature.
    for(let attempt=0;attempt<4;attempt++){
      const client=await pool.connect();
      let inTransaction=false;
      let retryable=false;
      let brokenConnection=false;
      try {
        await client.query(readOnly?
          'BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY':
          'BEGIN ISOLATION LEVEL SERIALIZABLE');
        inTransaction=true;
        const nonce=await client.query(
          'SELECT txid_current()::text AS txid, pg_backend_pid()::text AS backend');
        const payload=[actor.tenantId,actor.userId,nonce.rows[0].txid,nonce.rows[0].backend].join('\n');
        const signature=crypto.createHmac('sha256',
          Buffer.from(process.env.APEX_PG_PILOT_CONTEXT_KEY!,'hex')).update(payload).digest('hex');
        await client.query('SET LOCAL ROLE apex_pilot_writer');
        await client.query("SELECT set_config('apex.tenant_id',$1,true)",[actor.tenantId]);
        await client.query("SELECT set_config('apex.actor_id',$1,true)",[actor.userId]);
        await client.query("SELECT set_config('apex.context_signature',$1,true)",[signature]);
        const version=await client.query(
          "SELECT stage_only FROM apex.schema_versions WHERE version='10.5c-shadow-outbox'");
        if(version.rows.length!==1 || !version.rows[0].stage_only)
          reject(503,'The required staging pilot schema is not installed.');
        const sqlUser=await client.query(
          'SELECT role FROM apex.staff WHERE tenant_id=$1 AND staff_id=$2 AND disabled_at IS NULL',
          [actor.tenantId,actor.userId]);
        if(sqlUser.rows.length!==1 || sqlUser.rows[0].role!==actor.role)
          reject(403,'Authenticated local identity does not match the SQL staging role.');
        const result=await operation(client,actor,req);
        await client.query('COMMIT');
        inTransaction=false;
        return result;
      } catch(error: any) {
        if(inTransaction) {
          try { await client.query('ROLLBACK'); }
          catch { brokenConnection=true; }
        }
        // Retry only after a confirmed rollback. A broken connection is discarded.
        retryable=!brokenConnection &&
          (error?.code==='40001'||error?.code==='40P01') && attempt<3;
        if(!retryable)throw error;
      } finally {
        client.release(brokenConnection);
      }
      // Never hold a pooled DB connection while backing off. This matters for
      // eight concurrent HTTP requests sharing the four-connection staging pool.
      if(retryable)await new Promise(resolve=>setTimeout(resolve,20*(attempt+1)));
    }
    return reject(503,'Staging SQL serialization retries exhausted.');
  }

  function digestRequest(value: unknown): string {
    return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }
  async function claimDraftKey(client:PoolClient,actor:Actor,req:Request,
    operation:'PROCUREMENT_DRAFT'|'FINANCE_PREVIEW',customerId:string,
    requestDigest:string,generatedId:string):Promise<{id:string;replay:boolean}> {
    const key=req.get('Idempotency-Key');
    if(key===undefined)return {id:generatedId,replay:false};
    if(!/^[A-Za-z0-9._-]{12,80}$/.test(key))
      reject(400,'Idempotency-Key must be 12–80 URL-safe characters.');
    const inserted=await client.query(
      "INSERT INTO apex.pilot_request_keys "+
      "(tenant_id,actor_staff_id,request_key,operation,customer_id,request_sha256,resource_id) "+
      "VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING resource_id",
      [actor.tenantId,actor.userId,key,operation,customerId,requestDigest,generatedId]);
    if(inserted.rows.length===1)return {id:generatedId,replay:false};
    const existing=await client.query(
      "SELECT operation,customer_id,request_sha256,resource_id "+
      "FROM apex.pilot_request_keys WHERE tenant_id=$1 AND actor_staff_id=$2 AND request_key=$3",
      [actor.tenantId,actor.userId,key]);
    if(existing.rows.length!==1 ||
      existing.rows[0].operation!==operation ||
      existing.rows[0].customer_id!==customerId ||
      existing.rows[0].request_sha256!==requestDigest)
      reject(409,'Idempotency key already belongs to a different draft request.');
    return {id:existing.rows[0].resource_id,replay:true};
  }

  const handler=(operation:PilotOperation,readOnly=false):RequestHandler=>async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    try{
      const result=await transact(req,operation,readOnly);
      res.status(result.status).json({
        success:true,data:result.data,mode:'LOCAL_POSTGRES_STAGING_PILOT',
        jsonRuntimeUnchanged:true,productionCutover:false
      });
    }catch(error:any){
      if(error instanceof PilotError) {
        return res.status(error.status).json({success:false,error:error.message});
      }
      const code=error?.code;
      const status=code==='23505'?409:code==='23503'?400:
        code==='42501'||code==='42500'||code==='42502'?403:503;
      res.status(status).json({success:false,error:
        status===409?'A conflicting staging record already exists.':
        status===400?'Invalid staging association.':
        status===403?'Staging SQL authorization denied.':
        'Staging PostgreSQL operation unavailable.'});
    }
  };

  // A specific allowlist is mandatory even when the staging flag is enabled.
  // No wildcard/implicit global rollout. All callers still pass the JSON
  // route's requireAuth + BUSINESS_OWNER/SALES_MANAGER gate first.
  const ids=(process.env.APEX_PG_CRM_CANARY_STAFF_IDS||'').split(',').map(s=>s.trim());
  const canaryIds=crmReadThroughEnabled ? new Set(ids) : new Set<string>();
  if(crmReadThroughEnabled && (ids.length>20 || !ids.length ||
    ids.some(id=>!/^[A-Za-z0-9._-]{1,160}$/.test(id)) ||
    canaryIds.size!==ids.length))
    throw new Error('CRM READ-THROUGH SAFETY: explicit unique canary staff ID allowlist required.');
  const crmReadThrough:RequestHandler|null=crmReadThroughEnabled
    ?async(req,res,next)=>{
      const session=(req as any).user as {userId?:string;role?:UserRole};
      if(!session || !session.userId || !canaryIds.has(session.userId))
        return next(); // Normal JSON route, still authenticated and role-gated.
      res.setHeader('Cache-Control','no-store');
      try {
        const before=store.getState();
        const visible=new Set(before.customers.filter(c=>
          c.tenantId===before.tenant.id &&
          (session.role==='BUSINESS_OWNER'||c.staffUserIds.includes(session.userId!))
        ).map(c=>c.id));
        const jsonRows=before.crmOpportunities.filter(c=>visible.has(c.customerId));
        const sql=await transact(req,async(client,actor)=>{
          if(actor.tenantId!==before.tenant.id || actor.userId!==session.userId ||
            actor.role!==session.role)
            reject(403,'CRM read-through tenant/actor mismatch.');
          const comparison=await readVerifiedCrmThrough(client,actor.tenantId,jsonRows);
          if(!comparison.matched)
            reject(409,'Staging CRM read-through parity conflict; no records returned.');
          return {status:200,data:comparison.rows};
        },true);
        // Deny on concurrent local JSON grant/CRM mutation across the SQL
        // transaction rather than emit an out-of-date authorization snapshot.
        const after=store.getState();
        const afterVisible=new Set(after.customers.filter(c=>
          c.tenantId===after.tenant.id &&
          (session.role==='BUSINESS_OWNER'||c.staffUserIds.includes(session.userId!))
        ).map(c=>c.id));
        const afterRows=after.crmOpportunities.filter(c=>afterVisible.has(c.customerId));
        if(after.tenant.id!==before.tenant.id ||
          JSON.stringify(afterRows)!==JSON.stringify(jsonRows))
          reject(409,'Staging CRM read-through JSON snapshot changed; no records returned.');
        res.setHeader('X-Apex-CRM-Read','postgres-parity-verified');
        return res.json({success:true,data:sql.data});
      } catch(error:any){
        if(error instanceof PilotError)
          return res.status(error.status).json({success:false,error:error.message});
        return res.status(503).json({
          success:false,error:'Staging CRM read-through is unavailable; no records returned.'
        });
      }
    }:null;

  app.get('/api/pg-pilot/status',requireAuth,handler(async()=>({
    status:200,data:{stageOnly:true,storage:'postgres',applicationStorage:'json',
      writableKinds:['customers','customer_grants','crmOpportunities','projects','project_shares','tickets','assets','jobs','quotes','proposals','rmaClaims','pilot_procurement_drafts','pilot_finance_previews','pilot_service_work_orders','pilot_service_work_order_events','pilot_service_outbox'],externalTransactionsEnabled:false,outboxDeliveryEnabled:false}
  })));
  // Explicitly feature-gated, owner-only read diagnostic. No live /api/*
  // route calls this adapter, no automatic backfill, no source switch.
  if(repositoryShadowEnabled) {
    app.get('/api/pg-pilot/repository-shadow',requireAuth,
      requireRole('BUSINESS_OWNER'),handler(async(client,actor)=>{
        const report=await compareStagingRepository(client,store,actor.tenantId);
        return {status:200,data:report};
      },true));
  }
  app.get('/api/pg-pilot/customers',requireAuth,handler(async client=>{
    const result=await client.query(
      'SELECT customer_id AS id, display_name AS name FROM apex.customers ORDER BY display_name,customer_id');
    return {status:200,data:result.rows};
  }));
  app.post('/api/pg-pilot/customers',requireAuth,requireRole('BUSINESS_OWNER'),
    handler(async(client,actor,req)=>{
      const body=strictBody(req.body,['name']);
      const name=body.name;
      if(typeof name!=='string' || !name.trim() || name.trim().length>160)
        reject(400,'A registered customer name of 1–160 characters is required.');
      const id='cust-'+crypto.randomUUID();
      const row=await client.query(
        'INSERT INTO apex.customers(tenant_id,customer_id,display_name) VALUES($1,$2,$3) RETURNING customer_id AS id,display_name AS name',
        [actor.tenantId,id,name.trim()]);
      return {status:201,data:row.rows[0]};
    }));
  app.patch('/api/pg-pilot/customers/:id/access',requireAuth,requireRole('BUSINESS_OWNER'),
    handler(async(client,actor,req)=>{
      const body=strictBody(req.body,['userId','grant']);
      if(Object.keys(body).length!==2 || typeof body.userId!=='string' ||
         !body.userId || typeof body.grant!=='boolean') {
        reject(400,'Exact staff userId and boolean grant are required.');
      }
      const customer=await client.query('SELECT customer_id FROM apex.customers WHERE customer_id=$1',[req.params.id]);
      if(customer.rows.length!==1)reject(404,'Registered staging customer not found.');
      const member=await client.query(
        "SELECT staff_id FROM apex.staff WHERE staff_id=$1 AND role<>'BUSINESS_OWNER' AND disabled_at IS NULL",
        [body.userId]);
      if(member.rows.length!==1)reject(400,'Staff ID must belong to an active local nonowner identity.');
      let change;
      if(body.grant) {
        change=await client.query(
          'INSERT INTO apex.customer_grants(tenant_id,customer_id,staff_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING staff_id',
          [actor.tenantId,req.params.id,body.userId]);
      }else{
        change=await client.query(
          'DELETE FROM apex.customer_grants WHERE tenant_id=$1 AND customer_id=$2 AND staff_id=$3 RETURNING staff_id',
          [actor.tenantId,req.params.id,body.userId]);
      }
      return {status:200,data:{customerId:req.params.id,userId:body.userId,
        grant:body.grant,changed:change.rows.length===1}};
    }));
  app.get('/api/pg-pilot/crm',requireAuth,requireRole('BUSINESS_OWNER','SALES_MANAGER'),
    handler(async client=>{
      const rows=await client.query(
        "SELECT payload FROM apex.customer_records WHERE kind='crmOpportunities' ORDER BY source_id");
      return {status:200,data:rows.rows.map(r=>r.payload)};
    }));
  app.post('/api/pg-pilot/crm',requireAuth,requireRole('BUSINESS_OWNER','SALES_MANAGER'),
    handler(async(client,actor,req)=>{
      const body=strictBody(req.body,['customerId','clientName','title','value']);
      if(typeof body.customerId!=='string' || typeof body.title!=='string' ||
        !body.title.trim() || body.title.trim().length>180 ||
        typeof body.value!=='number' || !Number.isFinite(body.value) ||
        body.value<0 || body.value>1e12)reject(400,'Valid customer, title and finite monetary value are required.');
      const c=await client.query(
        'SELECT customer_id,display_name FROM apex.customers WHERE customer_id=$1',[body.customerId]);
      if(c.rows.length!==1)reject(404,'Customer not visible or not registered.');
      if(body.clientName!==undefined && body.clientName!==c.rows[0].display_name)
        reject(400,'Client name cannot differ from the registered customer.');
      const record={
        id:'crm-'+crypto.randomUUID(),customerId:body.customerId,
        clientName:c.rows[0].display_name,title:body.title.trim(),value:body.value,
        stage:'LEAD',winProbability:0,contactPerson:'',expectedCloseDate:'',
        assignedEngineer:'',category:'',createdByUserId:actor.userId
      };
      const stored=await client.query(
        "INSERT INTO apex.customer_records(tenant_id,customer_id,kind,source_id,payload,created_by_staff_id) "+
        "VALUES($1,$2,'crmOpportunities',$3,$4::jsonb,$5) RETURNING payload",
        [actor.tenantId,body.customerId,record.id,JSON.stringify(record),actor.userId]);
      return {status:201,data:stored.rows[0].payload};
    }));
  app.patch('/api/pg-pilot/crm/:id',requireAuth,requireRole('BUSINESS_OWNER','SALES_MANAGER'),
    handler(async(client,_actor,req)=>{
      const body=strictBody(req.body,['stage']);
      if(Object.keys(body).length!==1 || typeof body.stage!=='string' ||
         !allowedStages.has(body.stage))reject(400,'A permitted CRM stage is required.');
      const row=await client.query(
        "UPDATE apex.customer_records SET payload=jsonb_set(payload,'{stage}',to_jsonb($1::text),true) "+
        "WHERE kind='crmOpportunities' AND source_id=$2 RETURNING payload",
        [body.stage,req.params.id]);
      if(!row.rows.length)reject(404,'CRM record not found or not authorized.');
      return {status:200,data:row.rows[0].payload};
    }));

  // Staging-only domain repository — authorization is layered: Express role,
  // PostgreSQL signed actor context, tenant/customer membership and object RLS.
  app.get('/api/pg-pilot/projects',requireAuth,
    requireRole('BUSINESS_OWNER','ENTERPRISE_IT_HEAD','SALES_MANAGER','PROCUREMENT_LEAD'),
    handler(async client=>{
      const rows=await client.query(
        "SELECT p.payload, COALESCE((SELECT jsonb_agg(s.staff_id ORDER BY s.staff_id) "+
        "FROM apex.project_shares s WHERE s.tenant_id=p.tenant_id AND s.customer_id=p.customer_id "+
        "AND s.project_id=p.source_id),'[]'::jsonb) AS collaborators "+
        "FROM apex.customer_records p WHERE p.kind='projects' ORDER BY p.source_id");
      return {status:200,data:rows.rows.map(r=>({...r.payload,collaboratorUserIds:r.collaborators}))};
    }));
  app.post('/api/pg-pilot/projects',requireAuth,
    requireRole('BUSINESS_OWNER','ENTERPRISE_IT_HEAD'),
    handler(async(client,actor,req)=>{
      const body=strictBody(req.body,['customerId','title','scopeDescription','budget']);
      if(typeof body.customerId!=='string' || typeof body.title!=='string' ||
         !body.title.trim() || body.title.trim().length>180 ||
         (body.scopeDescription!==undefined && (typeof body.scopeDescription!=='string' ||
           body.scopeDescription.length>4000)) ||
         (body.budget!==undefined && (typeof body.budget!=='number' ||
           !Number.isFinite(body.budget) || body.budget<0 || body.budget>1e12))) {
        reject(400,'Registered customer, project title, scope and reasonable budget are required.');
      }
      const customer=await client.query(
        'SELECT customer_id,display_name FROM apex.customers WHERE customer_id=$1',[body.customerId]);
      if(customer.rows.length!==1)reject(404,'Authorized staging customer not found.');
      const project={
        id:'proj-'+crypto.randomUUID(),customerId:body.customerId,
        projectCode:'STAGE-'+crypto.randomUUID().slice(0,8).toUpperCase(),
        title:body.title.trim(),clientName:customer.rows[0].display_name,
        createdByUserId:actor.userId,collaboratorUserIds:[],
        scopeDescription:body.scopeDescription||'Internal staging project',
        budget:body.budget??0,category:'Hardware Overhaul',status:'PROPOSALS_OPEN',
        milestones:[],proposalsCount:0,deliverables:[],skillsRequired:[],
        clientLocation:'',createdAt:new Date().toISOString()
      };
      const row=await client.query(
        "INSERT INTO apex.customer_records "+
        "(tenant_id,customer_id,kind,source_id,payload,created_by_staff_id) "+
        "VALUES($1,$2,'projects',$3,$4::jsonb,$5) RETURNING payload",
        [actor.tenantId,project.customerId,project.id,JSON.stringify(project),actor.userId]);
      return {status:201,data:row.rows[0].payload};
    }));
  app.patch('/api/pg-pilot/projects/:id/access',requireAuth,
    requireRole('BUSINESS_OWNER'),handler(async(client,actor,req)=>{
      const body=strictBody(req.body,['userId','grant']);
      if(Object.keys(body).length!==2 || typeof body.userId!=='string' ||
        !body.userId || typeof body.grant!=='boolean')
        reject(400,'Exact active staff userId and boolean grant are required.');
      const project=await client.query(
        "SELECT customer_id FROM apex.customer_records WHERE kind='projects' AND source_id=$1",
        [req.params.id]);
      if(project.rows.length!==1)reject(404,'Authorized staging project not found.');
      const customerId=project.rows[0].customer_id;
      const staff=await client.query(
        "SELECT g.staff_id FROM apex.customer_grants g JOIN apex.staff u "+
        "ON u.tenant_id=g.tenant_id AND u.staff_id=g.staff_id "+
        "WHERE g.customer_id=$1 AND g.staff_id=$2 AND u.disabled_at IS NULL "+
        "AND u.role IN ('ENTERPRISE_IT_HEAD','SALES_MANAGER','PROCUREMENT_LEAD')",
        [customerId,body.userId]);
      if(staff.rows.length!==1)reject(403,'Staff must have a registered customer grant.');
      const result=body.grant
        ?await client.query(
          "INSERT INTO apex.project_shares(tenant_id,customer_id,project_id,staff_id) "+
          "VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING staff_id",
          [actor.tenantId,customerId,req.params.id,body.userId])
        :await client.query(
          "DELETE FROM apex.project_shares "+
          "WHERE tenant_id=$1 AND customer_id=$2 AND project_id=$3 AND staff_id=$4 RETURNING staff_id",
          [actor.tenantId,customerId,req.params.id,body.userId]);
      return {status:200,data:{projectId:req.params.id,customerId,userId:body.userId,
        grant:body.grant,changed:result.rows.length===1}};
    }));
  app.get('/api/pg-pilot/tickets',requireAuth,
    requireRole('BUSINESS_OWNER','ENTERPRISE_IT_HEAD','FIELD_ENGINEER'),
    handler(async client=>{
      const result=await client.query(
        "SELECT payload FROM apex.customer_records WHERE kind='tickets' ORDER BY source_id");
      return {status:200,data:result.rows.map(r=>r.payload)};
    }));
  app.post('/api/pg-pilot/tickets',requireAuth,
    requireRole('BUSINESS_OWNER','ENTERPRISE_IT_HEAD'),
    handler(async(client,actor,req)=>{
      const body=strictBody(req.body,['customerId','title','priority']);
      if(typeof body.customerId!=='string' || typeof body.title!=='string' ||
        !body.title.trim() || body.title.trim().length>180 ||
        (body.priority!==undefined &&
          !['LOW','MEDIUM','HIGH','CRITICAL'].includes(String(body.priority)))) {
        reject(400,'Registered customer, incident title and known priority are required.');
      }
      const customer=await client.query(
        'SELECT customer_id FROM apex.customers WHERE customer_id=$1',[body.customerId]);
      if(customer.rows.length!==1)reject(404,'Authorized staging customer not found.');
      const ticket={
        id:'tkt-'+crypto.randomUUID(),customerId:body.customerId,
        ticketNumber:'STAGE-'+crypto.randomUUID().slice(0,8).toUpperCase(),
        title:body.title.trim(),priority:body.priority||'MEDIUM',
        status:'OPEN',category:'Hardware Fault',
        reportedByUserId:actor.userId,assignedAgent:'Unassigned',
        createdAt:new Date().toISOString()
      };
      const row=await client.query(
        "INSERT INTO apex.customer_records "+
        "(tenant_id,customer_id,kind,source_id,payload,created_by_staff_id,reported_by_staff_id) "+
        "VALUES($1,$2,'tickets',$3,$4::jsonb,$5,$5) RETURNING payload",
        [actor.tenantId,ticket.customerId,ticket.id,JSON.stringify(ticket),actor.userId]);
      return {status:201,data:row.rows[0].payload};
    }));
  app.patch('/api/pg-pilot/tickets/:id/status',requireAuth,
    requireRole('BUSINESS_OWNER','ENTERPRISE_IT_HEAD'),
    handler(async(client,_actor,req)=>{
      const body=strictBody(req.body,['status']);
      if(Object.keys(body).length!==1 ||
        typeof body.status!=='string' ||
        !['OPEN','IN_PROGRESS','RESOLVED','CLOSED'].includes(body.status))
        reject(400,'Only an approved ticket status is accepted.');
      const result=await client.query(
        "UPDATE apex.customer_records SET payload=jsonb_set(payload,'{status}',to_jsonb($1::text),true) "+
        "WHERE kind='tickets' AND source_id=$2 RETURNING payload",
        [body.status,req.params.id]);
      if(result.rows.length!==1)reject(404,'Ticket is not visible or does not exist.');
      return {status:200,data:result.rows[0].payload};
    }));


  // Staging-only asset custody and field-job service ledger. Assignments and
  // human-visible labels are server-authored; the field must have customer membership.
  app.get('/api/pg-pilot/assets',requireAuth,
    requireRole('BUSINESS_OWNER','ENTERPRISE_IT_HEAD','FIELD_ENGINEER','PROCUREMENT_LEAD'),
    handler(async client=>{
      const rows=await client.query(
        "SELECT payload FROM apex.customer_records WHERE kind='assets' ORDER BY source_id");
      return {status:200,data:rows.rows.map(r=>r.payload)};
    }));
  app.post('/api/pg-pilot/assets',requireAuth,
    requireRole('BUSINESS_OWNER','ENTERPRISE_IT_HEAD'),
    handler(async(client,actor,req)=>{
      const body=strictBody(req.body,['customerId','assetTag','name','category']);
      if(typeof body.customerId!=='string' ||
         typeof body.assetTag!=='string' || !/^[A-Za-z0-9._-]{3,48}$/.test(body.assetTag) ||
         typeof body.name!=='string' || !body.name.trim() || body.name.trim().length>160 ||
         (body.category!==undefined &&
           !['Laptop','Server','Switch','Firewall','Workstation','UPS'].includes(String(body.category)))) {
        reject(400,'Registered customer, safe unique asset tag, name and known category required.');
      }
      const customer=await client.query(
        'SELECT customer_id FROM apex.customers WHERE customer_id=$1',[body.customerId]);
      if(customer.rows.length!==1)reject(404,'Customer not registered or not authorized.');
      const asset={
        id:'asset-'+crypto.randomUUID(),customerId:body.customerId,
        assetTag:body.assetTag,serialNumber:'',
        name:body.name.trim(),category:body.category||'Laptop',
        brand:'Unverified',model:'Unverified',
        assignedUser:'Unassigned',department:'IT',location:'',
        purchaseDate:'',purchaseCost:0,warrantyExpiresAt:'',
        status:'AVAILABLE_IN_STOCK'
      };
      const row=await client.query(
        "INSERT INTO apex.customer_records "+
        "(tenant_id,customer_id,kind,source_id,payload,created_by_staff_id) "+
        "VALUES($1,$2,'assets',$3,$4::jsonb,$5) RETURNING payload",
        [actor.tenantId,asset.customerId,asset.id,JSON.stringify(asset),actor.userId]);
      return {status:201,data:row.rows[0].payload};
    }));
  app.patch('/api/pg-pilot/assets/:id/assign',requireAuth,
    requireRole('BUSINESS_OWNER','ENTERPRISE_IT_HEAD'),
    handler(async(client,_actor,req)=>{
      const body=strictBody(req.body,['userId']);
      if(Object.keys(body).length!==1 || !(body.userId===null ||
        (typeof body.userId==='string' && body.userId.length>0)))
        reject(400,'Provide an active FIELD_ENGINEER staff ID or null.');
      const asset=await client.query(
        "SELECT customer_id FROM apex.customer_records WHERE kind='assets' AND source_id=$1",[req.params.id]);
      if(asset.rows.length!==1)reject(404,'Asset not visible or not registered.');
      if(body.userId) {
        const allowed=await client.query(
          'SELECT apex.is_active_customer_field_staff($1,$2,$3) AS valid',
          [_actor.tenantId,asset.rows[0].customer_id,body.userId]);
        if(!allowed.rows[0]?.valid)reject(403,'Assigned engineer must have customer membership.');
      }
      const changed=await client.query(
        "UPDATE apex.customer_records SET assigned_staff_id=$1, "+
        "payload=(payload - 'assignedUserId') || "+
        "CASE WHEN $1::text IS NULL THEN jsonb_build_object('assignedUser','Unassigned') "+
        "ELSE jsonb_build_object('assignedUserId',$1::text,'assignedUser',$1::text) END "+
        "WHERE kind='assets' AND source_id=$2 RETURNING payload",
        [body.userId,req.params.id]);
      if(changed.rows.length!==1)reject(404,'Asset not visible or not registered.');
      return {status:200,data:changed.rows[0].payload};
    }));
  app.patch('/api/pg-pilot/assets/:id/status',requireAuth,
    requireRole('BUSINESS_OWNER','ENTERPRISE_IT_HEAD','FIELD_ENGINEER'),
    handler(async(client,_actor,req)=>{
      const body=strictBody(req.body,['status']);
      if(Object.keys(body).length!==1 || typeof body.status!=='string' ||
         !['IN_USE','AVAILABLE_IN_STOCK','UNDER_REPAIR','RETIRED'].includes(body.status))
        reject(400,'Use only an authorized internal asset status.');
      const result=await client.query(
        "UPDATE apex.customer_records SET payload=jsonb_set(payload,'{status}',to_jsonb($1::text),true) "+
        "WHERE kind='assets' AND source_id=$2 RETURNING payload",
        [body.status,req.params.id]);
      if(result.rows.length!==1)reject(404,'Asset not visible or assigned.');
      return {status:200,data:result.rows[0].payload};
    }));
  app.get('/api/pg-pilot/jobs',requireAuth,
    requireRole('BUSINESS_OWNER','ENTERPRISE_IT_HEAD','FIELD_ENGINEER'),
    handler(async client=>{
      const rows=await client.query(
        "SELECT payload FROM apex.customer_records WHERE kind='jobs' ORDER BY source_id");
      return {status:200,data:rows.rows.map(r=>r.payload)};
    }));
  app.post('/api/pg-pilot/jobs',requireAuth,
    requireRole('BUSINESS_OWNER','ENTERPRISE_IT_HEAD'),
    handler(async(client,actor,req)=>{
      const body=strictBody(req.body,['customerId','title','address']);
      if(typeof body.customerId!=='string' || typeof body.title!=='string' ||
        !body.title.trim() || body.title.trim().length>180 ||
        (body.address!==undefined && (typeof body.address!=='string' || body.address.length>300))) {
        reject(400,'Registered customer, task title and optional dispatch address required.');
      }
      const customer=await client.query(
        'SELECT customer_id,display_name FROM apex.customers WHERE customer_id=$1',[body.customerId]);
      if(customer.rows.length!==1)reject(404,'Customer not registered or authorized.');
      const job={
        id:'job-'+crypto.randomUUID(),customerId:body.customerId,
        jobCode:'STAGE-'+crypto.randomUUID().slice(0,8).toUpperCase(),
        title:body.title.trim(),customerName:customer.rows[0].display_name,
        address:body.address||'',technicianName:'Unassigned',technicianPhone:'',
        status:'SCHEDULED',scheduledTime:'',partsConsumed:[],customerSignatureObtained:false
      };
      const row=await client.query(
        "INSERT INTO apex.customer_records "+
        "(tenant_id,customer_id,kind,source_id,payload,created_by_staff_id) "+
        "VALUES($1,$2,'jobs',$3,$4::jsonb,$5) RETURNING payload",
        [actor.tenantId,job.customerId,job.id,JSON.stringify(job),actor.userId]);
      return {status:201,data:row.rows[0].payload};
    }));
  app.patch('/api/pg-pilot/jobs/:id/assign',requireAuth,
    requireRole('BUSINESS_OWNER','ENTERPRISE_IT_HEAD'),
    handler(async(client,actor,req)=>{
      const body=strictBody(req.body,['userId']);
      if(Object.keys(body).length!==1 || !(body.userId===null ||
        (typeof body.userId==='string' && body.userId.length>0)))
        reject(400,'Choose a FIELD_ENGINEER staff ID or null.');
      const job=await client.query(
        "SELECT customer_id FROM apex.customer_records WHERE kind='jobs' AND source_id=$1",
        [req.params.id]);
      if(job.rows.length!==1)reject(404,'Field job not visible.');
      if(body.userId) {
        const active=await client.query(
          'SELECT apex.is_active_customer_field_staff($1,$2,$3) AS valid',
          [actor.tenantId,job.rows[0].customer_id,body.userId]);
        if(!active.rows[0]?.valid)reject(403,'Engineer has no active grant to this customer.');
      }
      const changed=await client.query(
        "UPDATE apex.customer_records SET assigned_staff_id=$1, "+
        "payload=(payload - 'assignedUserId') || "+
        "CASE WHEN $1::text IS NULL THEN jsonb_build_object('technicianName','Unassigned') "+
        "ELSE jsonb_build_object('assignedUserId',$1::text,'technicianName',$1::text) END "+
        "WHERE kind='jobs' AND source_id=$2 RETURNING payload",
        [body.userId,req.params.id]);
      if(changed.rows.length!==1)reject(404,'Field job not visible.');
      return {status:200,data:changed.rows[0].payload};
    }));
  app.patch('/api/pg-pilot/jobs/:id/status',requireAuth,
    requireRole('BUSINESS_OWNER','ENTERPRISE_IT_HEAD','FIELD_ENGINEER'),
    handler(async(client,_actor,req)=>{
      const body=strictBody(req.body,['status']);
      if(Object.keys(body).length!==1 || typeof body.status!=='string' ||
         !['SCHEDULED','EN_ROUTE','CHECKED_IN','DIAGNOSING'].includes(body.status))
        reject(400,'Only internal dispatch/progress states are supported; no verified completion claims.');
      const changed=await client.query(
        "UPDATE apex.customer_records SET payload=jsonb_set(payload,'{status}',to_jsonb($1::text),true) "+
        "WHERE kind='jobs' AND source_id=$2 RETURNING payload",
        [body.status,req.params.id]);
      if(changed.rows.length!==1)reject(404,'Field job not visible or assigned.');
      return {status:200,data:changed.rows[0].payload};
    }));


  // Phase 10.4 — strictly unissued commercial drafts and internally logged claims.
  // No GST certification, invoice issuance, payments, OEM approval, supplier dispatch
  // or external provider impersonation is possible through these routes.
  app.get('/api/pg-pilot/quotes',requireAuth,
    requireRole('BUSINESS_OWNER','SALES_MANAGER','PROCUREMENT_LEAD'),
    handler(async client=>{
      const rows=await client.query(
        "SELECT payload FROM apex.customer_records WHERE kind='quotes' ORDER BY source_id");
      return {status:200,data:rows.rows.map(r=>r.payload)};
    }));
  app.post('/api/pg-pilot/quotes',requireAuth,
    requireRole('BUSINESS_OWNER','SALES_MANAGER','PROCUREMENT_LEAD'),
    handler(async(client,actor,req)=>{
      const body=strictBody(req.body,['customerId','title','subtotal']);
      if(typeof body.customerId!=='string' || typeof body.title!=='string' ||
        !body.title.trim() || body.title.trim().length>160 ||
        typeof body.subtotal!=='number' || !Number.isFinite(body.subtotal) ||
        body.subtotal<0 || body.subtotal>1000000000000 ||
        Math.round(body.subtotal*100)/100!==body.subtotal) {
        reject(400,'Registered customer, draft description and 2-decimal subtotal required.');
      }
      const customer=await client.query(
        'SELECT display_name FROM apex.customers WHERE customer_id=$1',[body.customerId]);
      if(customer.rows.length!==1)reject(404,'Customer not visible or unregistered.');
      const quote={
        id:'quote-'+crypto.randomUUID(),customerId:body.customerId,
        quoteNumber:'STAGE-'+crypto.randomUUID().slice(0,8).toUpperCase(),
        customerName:customer.rows[0].display_name,
        customerGstin:'',customerState:'',
        solutionName:body.title.trim(),items:[],services:[],
        subtotal:body.subtotal,discountAmount:0,marginPercent:0,
        gstAmount:0,totalAmount:body.subtotal,
        taxStatus:'PENDING_CLASSIFICATION',status:'DRAFT',
        createdDate:new Date().toISOString(),validUntil:'',paymentTerms:'UNVERIFIED',
        createdByUserId:actor.userId
      };
      const result=await client.query(
        "INSERT INTO apex.customer_records "+
        "(tenant_id,customer_id,kind,source_id,payload,created_by_staff_id) "+
        "VALUES($1,$2,'quotes',$3,$4::jsonb,$5) RETURNING payload",
        [actor.tenantId,quote.customerId,quote.id,JSON.stringify(quote),actor.userId]);
      return {status:201,data:result.rows[0].payload};
    }));
  app.get('/api/pg-pilot/proposals',requireAuth,
    requireRole('BUSINESS_OWNER','ENTERPRISE_IT_HEAD','SALES_MANAGER','PROCUREMENT_LEAD'),
    handler(async client=>{
      const result=await client.query(
        "SELECT payload FROM apex.customer_records WHERE kind='proposals' ORDER BY source_id");
      return {status:200,data:result.rows.map(r=>r.payload)};
    }));
  app.post('/api/pg-pilot/proposals',requireAuth,
    requireRole('BUSINESS_OWNER','ENTERPRISE_IT_HEAD','SALES_MANAGER','PROCUREMENT_LEAD'),
    handler(async(client,actor,req)=>{
      const body=strictBody(req.body,['projectId','commercialBid','technicalApproach']);
      if(typeof body.projectId!=='string' ||
        typeof body.commercialBid!=='number' || !Number.isFinite(body.commercialBid) ||
        body.commercialBid<0 || body.commercialBid>1000000000000 ||
        (body.technicalApproach!==undefined &&
          (typeof body.technicalApproach!=='string' || body.technicalApproach.length>3000))) {
        reject(400,'Accessible project ID, nonnegative commercial estimate and approach required.');
      }
      const parent=await client.query(
        "SELECT customer_id,payload FROM apex.customer_records "+
        "WHERE kind='projects' AND source_id=$1",[body.projectId]);
      if(parent.rows.length!==1)reject(404,'Accessible staging project not found.');
      if(parent.rows[0].payload.status!=='PROPOSALS_OPEN')
        reject(409,'Project is not currently accepting proposals.');
      const proposal={
        id:'proposal-'+crypto.randomUUID(),projectId:body.projectId,
        customerId:parent.rows[0].customer_id,submittedByUserId:actor.userId,
        providerName:'INTERNAL_UNVERIFIED',providerRating:0,providerVerified:false,
        commercialBid:body.commercialBid,timelineDays:0,matchScore:0,
        matchExplanation:'Internal estimate only; no external provider verified',
        technicalApproach:body.technicalApproach||'',oemCertifications:[],status:'SUBMITTED',
        externalSubmission:false
      };
      const result=await client.query(
        "INSERT INTO apex.customer_records "+
        "(tenant_id,customer_id,kind,source_id,payload,created_by_staff_id,related_kind,related_id) "+
        "VALUES($1,$2,'proposals',$3,$4::jsonb,$5,'projects',$6) RETURNING payload",
        [actor.tenantId,proposal.customerId,proposal.id,JSON.stringify(proposal),actor.userId,body.projectId]);
      return {status:201,data:result.rows[0].payload};
    }));
  app.get('/api/pg-pilot/rma',requireAuth,
    requireRole('BUSINESS_OWNER','ENTERPRISE_IT_HEAD','FIELD_ENGINEER'),
    handler(async client=>{
      const rows=await client.query(
        "SELECT payload FROM apex.customer_records WHERE kind='rmaClaims' ORDER BY source_id");
      return {status:200,data:rows.rows.map(r=>r.payload)};
    }));
  app.post('/api/pg-pilot/rma',requireAuth,
    requireRole('BUSINESS_OWNER','ENTERPRISE_IT_HEAD','FIELD_ENGINEER'),
    handler(async(client,actor,req)=>{
      const body=strictBody(req.body,['assetId','faultSymptom']);
      if(typeof body.assetId!=='string' ||
        typeof body.faultSymptom!=='string' || !body.faultSymptom.trim() ||
        body.faultSymptom.trim().length>1500) {
        reject(400,'Accessible asset and nonempty fault description required.');
      }
      const asset=await client.query(
        "SELECT customer_id,payload FROM apex.customer_records "+
        "WHERE kind='assets' AND source_id=$1",[body.assetId]);
      if(asset.rows.length!==1)reject(404,'Asset not visible or unavailable.');
      const a=asset.rows[0].payload;
      const rma={
        id:'rma-'+crypto.randomUUID(),
        rmaNumber:'STAGE-'+crypto.randomUUID().slice(0,8).toUpperCase(),
        customerId:asset.rows[0].customer_id,
        assetId:body.assetId,assetTag:a.assetTag,assetName:a.name,serialNumber:a.serialNumber||'',
        oemBrand:a.brand||'',oemCaseNumber:'',
        faultSymptom:body.faultSymptom.trim(),
        warrantyStatus:'UNVERIFIED',courierTracking:'',courierPartner:'',
        stage:'FAULT_LOGGED',createdAt:new Date().toISOString(),
        createdByUserId:actor.userId,externalOemCaseOpened:false
      };
      const inserted=await client.query(
        "INSERT INTO apex.customer_records "+
        "(tenant_id,customer_id,kind,source_id,payload,created_by_staff_id,related_kind,related_id) "+
        "VALUES($1,$2,'rmaClaims',$3,$4::jsonb,$5,'assets',$6) RETURNING payload",
        [actor.tenantId,rma.customerId,rma.id,JSON.stringify(rma),actor.userId,body.assetId]);
      return {status:201,data:inserted.rows[0].payload};
    }));
  app.get('/api/pg-pilot/procurement-drafts',requireAuth,
    requireRole('BUSINESS_OWNER','PROCUREMENT_LEAD'),
    handler(async client=>{
      const result=await client.query(
        "SELECT draft_id AS id,customer_id AS \"customerId\",created_by_staff_id AS \"createdByUserId\","+
        "product_name AS \"productName\",required_qty AS qty,estimated_unit_cost AS \"estimatedUnitCost\","+
        "status FROM apex.pilot_procurement_drafts ORDER BY created_at,draft_id");
      return {status:200,data:result.rows};
    }));
  app.post('/api/pg-pilot/procurement-drafts',requireAuth,
    requireRole('BUSINESS_OWNER','PROCUREMENT_LEAD'),
    handler(async(client,actor,req)=>{
      const body=strictBody(req.body,['customerId','productName','qty','estimatedUnitCost']);
      if(typeof body.customerId!=='string' ||
        typeof body.productName!=='string' || !body.productName.trim() ||
        body.productName.trim().length>180 ||
        !Number.isInteger(body.qty) || (body.qty as number)<1 || (body.qty as number)>100000 ||
        typeof body.estimatedUnitCost!=='number' ||
        !Number.isFinite(body.estimatedUnitCost) || body.estimatedUnitCost<0 ||
        body.estimatedUnitCost>1000000000000 ||
        Math.round(body.estimatedUnitCost*100)/100!==body.estimatedUnitCost) {
        reject(400,'Registered customer, material description, quantity and 2-decimal estimate required.');
      }
      const customer=await client.query(
        'SELECT customer_id FROM apex.customers WHERE customer_id=$1',[body.customerId]);
      if(customer.rows.length!==1)reject(404,'Customer not visible or registered.');
      const key=await claimDraftKey(client,actor,req,'PROCUREMENT_DRAFT',
        body.customerId,digestRequest({
          customerId:body.customerId,productName:body.productName.trim(),
          qty:body.qty,estimatedUnitCost:body.estimatedUnitCost
        }),'proc-draft-'+crypto.randomUUID());
      if(key.replay){
        const existing=await client.query(
          "SELECT draft_id AS id,customer_id AS \"customerId\",created_by_staff_id AS \"createdByUserId\","+
          "product_name AS \"productName\",required_qty AS qty,estimated_unit_cost AS \"estimatedUnitCost\",status "+
          "FROM apex.pilot_procurement_drafts WHERE draft_id=$1",[key.id]);
        if(existing.rows.length!==1)reject(409,'Original draft no longer accessible.');
        return {status:200,data:existing.rows[0]};
      }
      const id=key.id;
      const result=await client.query(
        "INSERT INTO apex.pilot_procurement_drafts "+
        "(tenant_id,customer_id,draft_id,created_by_staff_id,product_name,required_qty,estimated_unit_cost) "+
        "VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING "+
        "draft_id AS id,customer_id AS \"customerId\",created_by_staff_id AS \"createdByUserId\","+
        "product_name AS \"productName\",required_qty AS qty,estimated_unit_cost AS \"estimatedUnitCost\",status",
        [actor.tenantId,body.customerId,id,actor.userId,body.productName.trim(),
         body.qty,body.estimatedUnitCost]);
      return {status:201,data:result.rows[0]};
    }));
  app.get('/api/pg-pilot/finance-previews',requireAuth,
    requireRole('BUSINESS_OWNER'),
    handler(async client=>{
      const result=await client.query(
        "SELECT preview_id AS id,customer_id AS \"customerId\",quote_id AS \"quoteId\","+
        "subtotal,status,tax_status AS \"taxStatus\",created_by_staff_id AS \"createdByUserId\" "+
        "FROM apex.pilot_finance_previews ORDER BY created_at,preview_id");
      return {status:200,data:result.rows};
    }));
  app.post('/api/pg-pilot/finance-previews',requireAuth,
    requireRole('BUSINESS_OWNER'),
    handler(async(client,actor,req)=>{
      const body=strictBody(req.body,['quoteId']);
      if(Object.keys(body).length!==1 ||
        typeof body.quoteId!=='string' || !body.quoteId) {
        reject(400,'Exact existing quote ID is required for an unissued finance preview.');
      }
      const existing=await client.query(
        "SELECT customer_id,payload FROM apex.customer_records "+
        "WHERE kind='quotes' AND source_id=$1",[body.quoteId]);
      if(existing.rows.length!==1)reject(404,'Draft quotation not visible.');
      const quote=existing.rows[0];
      if(quote.payload.status!=='DRAFT' ||
        quote.payload.taxStatus!=='PENDING_CLASSIFICATION' ||
        typeof quote.payload.subtotal!=='number')
        reject(409,'Only an unverified draft quotation can generate a preview.');
      const key=await claimDraftKey(client,actor,req,'FINANCE_PREVIEW',
        quote.customer_id,digestRequest({quoteId:body.quoteId}),'fin-preview-'+crypto.randomUUID());
      if(key.replay){
        const previous=await client.query(
          "SELECT preview_id AS id,customer_id AS \"customerId\",quote_id AS \"quoteId\","+
          "subtotal,status,tax_status AS \"taxStatus\",created_by_staff_id AS \"createdByUserId\" "+
          "FROM apex.pilot_finance_previews WHERE preview_id=$1",[key.id]);
        if(previous.rows.length!==1)reject(409,'Original unissued preview not available.');
        return {status:200,data:previous.rows[0]};
      }
      const id=key.id;
      const inserted=await client.query(
        "INSERT INTO apex.pilot_finance_previews "+
        "(tenant_id,customer_id,preview_id,created_by_staff_id,quote_id,subtotal) "+
        "VALUES($1,$2,$3,$4,$5,$6) RETURNING "+
        "preview_id AS id,customer_id AS \"customerId\",quote_id AS \"quoteId\","+
        "subtotal,status,tax_status AS \"taxStatus\",created_by_staff_id AS \"createdByUserId\"",
        [actor.tenantId,quote.customer_id,id,actor.userId,body.quoteId,quote.payload.subtotal]);
      return {status:201,data:inserted.rows[0]};
    }));


  // Phase 10.5B — first normalized service repository. Two independent staging
  // Express instances may share this SQL DB, without sharing JSON business state.
  const serviceProjection=
    'order_id AS id,customer_id AS "customerId",title,'+
    'created_by_staff_id AS "createdByUserId",assigned_staff_id AS "assignedUserId",'+
    'status,revision,created_at AS "createdAt",changed_at AS "changedAt"';
  app.get('/api/pg-pilot/service-work-orders',requireAuth,
    requireRole('BUSINESS_OWNER','ENTERPRISE_IT_HEAD','FIELD_ENGINEER'),
    handler(async client=>{
      const rows=await client.query(
        'SELECT '+serviceProjection+' FROM apex.pilot_service_work_orders ORDER BY order_id');
      return {status:200,data:rows.rows};
    }));
  app.post('/api/pg-pilot/service-work-orders',requireAuth,
    requireRole('BUSINESS_OWNER','ENTERPRISE_IT_HEAD'),
    handler(async(client,actor,req)=>{
      const body=strictBody(req.body,['customerId','title']);
      if(Object.keys(body).length!==2 ||
        typeof body.customerId!=='string' ||
        typeof body.title!=='string' || !body.title.trim() ||
        body.title.trim().length>180)
        reject(400,'Registered customer and nonempty service title required.');
      const customer=await client.query(
        'SELECT customer_id FROM apex.customers WHERE customer_id=$1',[body.customerId]);
      if(customer.rows.length!==1)reject(404,'Customer not visible or unregistered.');
      const id='wko-'+crypto.randomUUID();
      const created=await client.query(
        'INSERT INTO apex.pilot_service_work_orders '+
        '(tenant_id,customer_id,order_id,title,created_by_staff_id) '+
        'VALUES($1,$2,$3,$4,$5) RETURNING '+serviceProjection,
        [actor.tenantId,body.customerId,id,body.title.trim(),actor.userId]);
      return {status:201,data:created.rows[0]};
    }));
  app.patch('/api/pg-pilot/service-work-orders/:id/assign',requireAuth,
    requireRole('BUSINESS_OWNER','ENTERPRISE_IT_HEAD'),
    handler(async(client,actor,req)=>{
      const body=strictBody(req.body,['userId','expectedVersion']);
      if(Object.keys(body).length!==2 ||
        !(body.userId===null || (typeof body.userId==='string'&&body.userId.length>0)) ||
        !Number.isSafeInteger(body.expectedVersion) || (body.expectedVersion as number)<1)
        reject(400,'Provide active engineer userId (or null) and expectedVersion.');
      const existing=await client.query(
        'SELECT customer_id,assigned_staff_id,revision FROM apex.pilot_service_work_orders WHERE order_id=$1',
        [req.params.id]);
      if(existing.rows.length!==1)reject(404,'Service order not visible.');
      if(existing.rows[0].revision!==body.expectedVersion)
        reject(409,'Stale service revision; reload before applying the change.');
      if(existing.rows[0].assigned_staff_id===body.userId)
        reject(409,'Service assignment is unchanged.');
      if(body.userId!==null){
        const allowed=await client.query(
          'SELECT apex.is_active_customer_field_staff($1,$2,$3) AS ok',
          [actor.tenantId,existing.rows[0].customer_id,body.userId]);
        if(!allowed.rows[0]?.ok)reject(403,'Engineer must have active customer membership.');
      }
      const updated=await client.query(
        'UPDATE apex.pilot_service_work_orders SET assigned_staff_id=$1 '+
        'WHERE order_id=$2 AND revision=$3 RETURNING '+serviceProjection,
        [body.userId,req.params.id,body.expectedVersion]);
      if(updated.rows.length!==1)reject(409,'Concurrent service update; reload revision.');
      return {status:200,data:updated.rows[0]};
    }));
  app.patch('/api/pg-pilot/service-work-orders/:id/status',requireAuth,
    requireRole('BUSINESS_OWNER','ENTERPRISE_IT_HEAD','FIELD_ENGINEER'),
    handler(async(client,_actor,req)=>{
      const body=strictBody(req.body,['status','expectedVersion']);
      if(Object.keys(body).length!==2 ||
        typeof body.status!=='string' ||
        !['EN_ROUTE','CHECKED_IN','DIAGNOSING'].includes(body.status) ||
        !Number.isSafeInteger(body.expectedVersion) || (body.expectedVersion as number)<1)
        reject(400,'Provide next internal service state and expectedVersion.');
      const current=await client.query(
        'SELECT status,revision,assigned_staff_id FROM apex.pilot_service_work_orders WHERE order_id=$1',
        [req.params.id]);
      if(current.rows.length!==1)reject(404,'Service order not visible or assigned.');
      if(current.rows[0].revision!==body.expectedVersion)
        reject(409,'Stale service revision; reload before applying the change.');
      const next:Record<string,string>={
        SCHEDULED:'EN_ROUTE',EN_ROUTE:'CHECKED_IN',CHECKED_IN:'DIAGNOSING'
      };
      if(next[current.rows[0].status]!==body.status || !current.rows[0].assigned_staff_id)
        reject(409,'A verified engineer assignment and next sequential internal state are required.');
      const result=await client.query(
        'UPDATE apex.pilot_service_work_orders SET status=$1 '+
        'WHERE order_id=$2 AND revision=$3 RETURNING '+serviceProjection,
        [body.status,req.params.id,body.expectedVersion]);
      if(result.rows.length!==1)reject(409,'Concurrent service progress update; reload revision.');
      return {status:200,data:result.rows[0]};
    }));
  app.get('/api/pg-pilot/service-work-orders/:id/history',requireAuth,
    requireRole('BUSINESS_OWNER'),
    handler(async(client,_actor,req)=>{
      const visible=await client.query(
        'SELECT order_id FROM apex.pilot_service_work_orders WHERE order_id=$1',
        [req.params.id]);
      if(visible.rows.length!==1)reject(404,'Service order not visible.');
      const events=await client.query(
        'SELECT order_id AS "orderId",revision,changed_by_staff_id AS "changedByUserId",'+
        'operation,previous_status AS "previousStatus",next_status AS "nextStatus",'+
        'assigned_staff_id AS "assignedUserId",occurred_at AS "occurredAt" '+
        'FROM apex.pilot_service_work_order_events WHERE order_id=$1 ORDER BY revision',
        [req.params.id]);
      return {status:200,data:events.rows};
    }));


  // Outbox is an internal, inert pending-review ledger. No dispatcher exists.
  app.get('/api/pg-pilot/service-outbox',requireAuth,
    requireRole('BUSINESS_OWNER'),handler(async client=>{
      const rows=await client.query(
        'SELECT order_id AS "orderId",revision,event_type AS "eventType",'+
        'event_data AS data,delivery_state AS "deliveryState",'+
        'delivery_enabled AS "deliveryEnabled",delivery_attempts AS "deliveryAttempts" '+
        'FROM apex.pilot_service_outbox ORDER BY order_id,revision');
      return {status:200,data:rows.rows};
    }));

  app.get('/api/pg-pilot/audit',requireAuth,requireRole('BUSINESS_OWNER'),
    handler(async client=>{
      const rows=await client.query(
        'SELECT event_id AS id,actor_staff_id AS actor,operation,entity,object_id AS object,customer_id AS "customerId",txid,occurred_at AS "occurredAt" '+
        'FROM apex.pilot_audit_events ORDER BY occurred_at,event_id');
      return {status:200,data:rows.rows};
    }));
  return crmReadThrough;
}
