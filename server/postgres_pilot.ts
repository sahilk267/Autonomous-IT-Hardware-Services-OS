// Phase 10.2 — separately authenticated PostgreSQL staging pilot, not a production runtime switch.
// Main JSON /api endpoints and PersistentStore remain untouched.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import type { Express, Request, RequestHandler } from 'express';
import type { PersistentStore } from './db.ts';
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
  if(process.env.APEX_PG_PILOT_ENABLED!=='true') return;

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
  async function transact(req: Request, operation: PilotOperation): Promise<PilotResult> {
    const session=(req as any).user as {userId?:string;role?:UserRole};
    const user=session?.userId ? store.getUserById(session.userId) : undefined;
    const currentTenant=store.getState().tenant.id;
    if(!user || !user.passwordHash || user.disabledAt || user.tenantId!==currentTenant ||
       session.role!==user.role) {
      reject(403,'Authenticated actor does not belong to this staging tenant.');
    }
    const actor:Actor={userId:user.id,role:user.role,tenantId:currentTenant};
    const client=await pool.connect();
    let inTransaction=false;
    try {
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      inTransaction=true;
      // Attest this exact database transaction and backend connection to the
      // authenticated JSON session. A standalone SQL client cannot forge actor
      // identity by supplying its own custom PostgreSQL GUC settings.
      const nonce=await client.query(
        'SELECT txid_current()::text AS txid, pg_backend_pid()::text AS backend');
      const payload=[actor.tenantId,actor.userId,nonce.rows[0].txid,nonce.rows[0].backend].join('\n');
      const signature=crypto.createHmac('sha256',
        Buffer.from(process.env.APEX_PG_PILOT_CONTEXT_KEY!,'hex')).update(payload).digest('hex');
      await client.query('SET LOCAL ROLE apex_pilot_writer');
      await client.query("SELECT set_config('apex.tenant_id',$1,true)",[actor.tenantId]);
      await client.query("SELECT set_config('apex.actor_id',$1,true)",[actor.userId]);
      await client.query("SELECT set_config('apex.context_signature',$1,true)",[signature]);
      const version=await client.query("SELECT stage_only FROM apex.schema_versions WHERE version='10.3b-field-assets'");
      if(version.rows.length!==1 || !version.rows[0].stage_only)
        reject(503,'The required staging pilot schema is not installed.');
      // Fail closed if JSON and SQL role/tenant records ever drift.
      const sqlUser=await client.query(
        'SELECT role FROM apex.staff WHERE tenant_id=$1 AND staff_id=$2 AND disabled_at IS NULL',
        [actor.tenantId,actor.userId]);
      if(sqlUser.rows.length!==1 || sqlUser.rows[0].role!==actor.role)
        reject(403,'Authenticated local identity does not match the SQL staging role.');
      const result=await operation(client,actor,req);
      await client.query('COMMIT');
      inTransaction=false;
      return result;
    } catch(error) {
      if(inTransaction)await client.query('ROLLBACK').catch(()=>{});
      throw error;
    } finally {client.release();}
  }
  const handler=(operation:PilotOperation):RequestHandler=>async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    try{
      const result=await transact(req,operation);
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

  app.get('/api/pg-pilot/status',requireAuth,handler(async()=>({
    status:200,data:{stageOnly:true,storage:'postgres',applicationStorage:'json',
      writableKinds:['customers','customer_grants','crmOpportunities','projects','project_shares','tickets','assets','jobs']}
  })));
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

  app.get('/api/pg-pilot/audit',requireAuth,requireRole('BUSINESS_OWNER'),
    handler(async client=>{
      const rows=await client.query(
        'SELECT event_id AS id,actor_staff_id AS actor,operation,entity,object_id AS object,customer_id AS "customerId",txid,occurred_at AS "occurredAt" '+
        'FROM apex.pilot_audit_events ORDER BY occurred_at,event_id');
      return {status:200,data:rows.rows};
    }));
}
