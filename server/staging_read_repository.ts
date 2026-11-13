// Phase 10.5D — explicitly staged read-only repository abstraction.
// This never replaces the JSON source of truth or issues PostgreSQL writes.
// The caller must enter an authenticated, transaction-attested, RLS-scoped
// PostgreSQL transaction before calling the adapter.
import crypto from 'node:crypto';
import type {PoolClient} from 'pg';
import type {PersistentStore} from './db.ts';

export const SHADOW_DOMAINS = [
  'customers','projects','assets','tickets','crmOpportunities'
] as const;
export type ShadowDomain = typeof SHADOW_DOMAINS[number];

type Projection = {id:string;[key:string]:unknown};
export interface StagingReadRepository {
  readonly name: 'postgres-rls';
  readDomain(client:PoolClient,domain:ShadowDomain):Promise<Projection[]>;
}
const canonical=(value:unknown):unknown=>{
  if(Array.isArray(value))return value.map(canonical);
  if(value && typeof value==='object'){
    return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))
      .map(([key,v])=>[key,canonical(v)]));
  }
  return value;
};
const fingerprint=(rows:ReadonlyArray<{id:string}>):string=>{
  const ids=rows.map(x=>x.id);
  if(ids.some(x=>typeof x!=='string'||x.length===0) ||
    new Set(ids).size!==ids.length)throw Error('Shadow repository contains duplicate/missing identity');
  const sorted=[...rows].sort((a,b)=>a.id.localeCompare(b.id));
  return crypto.createHash('sha256').update(JSON.stringify(canonical(sorted))).digest('hex');
};
export class PostgresStagingReadRepository implements StagingReadRepository{
  readonly name='postgres-rls' as const;
  async readDomain(client:PoolClient,domain:ShadowDomain):Promise<Projection[]>{
    // Domain table is a literal allowlist: never interpolate request-driven SQL.
    if(domain==='customers'){
      const result=await client.query(
        'SELECT customer_id AS id,display_name AS name FROM apex.customers ORDER BY customer_id'
      );
      return result.rows;
    }
    if(!SHADOW_DOMAINS.includes(domain))
      throw Error('Unsupported staging repository domain');
    const result=await client.query(
      'SELECT payload FROM apex.customer_records WHERE kind=$1 ORDER BY source_id',
      [domain]
    );
    return result.rows.map(row=>row.payload as Projection);
  }
}
export type ShadowDomainComparison={
  domain:ShadowDomain;match:boolean;jsonCount:number;postgresCount:number;
};
export type ShadowReadReport={
  mode:'NONPRODUCTION_READ_ONLY_REPOSITORY_SHADOW';
  sourceOfTruth:'json';repository:'postgres-rls';
  matched:boolean;comparisons:ShadowDomainComparison[];
  databasesWritten:false;automaticReconciliation:false;productionCutover:false;
};
export async function compareStagingRepository(
  client:PoolClient,store:PersistentStore,tenantId:string,
  repo:StagingReadRepository=new PostgresStagingReadRepository()
):Promise<ShadowReadReport>{
  const state=store.getState();
  const mode=await client.query('SHOW transaction_read_only');
  if(mode.rows[0]?.transaction_read_only!=='on')
    throw Error('Repository shadow must execute in read-only SQL transaction');
  if(state.tenant.id!==tenantId)
    throw Error('Staging repository JSON tenant does not match signed actor');
  const comparisons:ShadowDomainComparison[]=[];
  for(const domain of SHADOW_DOMAINS){
    const source:Projection[]=domain==='customers'
      ?(state.customers||[]).filter(c=>c.tenantId===tenantId)
        .map(c=>({id:c.id,name:c.name}))
      :(state[domain]||[]).map(row=>row as Projection);
    const sql=await repo.readDomain(client,domain);
    comparisons.push({
      domain,match:fingerprint(source)===fingerprint(sql),
      jsonCount:source.length,postgresCount:sql.length
    });
  }
  return {
    mode:'NONPRODUCTION_READ_ONLY_REPOSITORY_SHADOW',
    sourceOfTruth:'json',repository:repo.name,
    matched:comparisons.every(x=>x.match),comparisons,
    databasesWritten:false,automaticReconciliation:false,productionCutover:false
  };
}

// Phase 10.5E: guarded read-through for exactly one pre-existing business GET.
// Compare the *actor-visible* JSON contract, not the owner's whole JSON table.
// PostgreSQL is eligible to answer only on full canonical row + membership parity.
export async function readVerifiedCrmThrough(
  client:PoolClient,tenantId:string,jsonRows:Array<{id:string}>
):Promise<{matched:boolean;rows:Array<{id:string}>}>{
  const mode=await client.query('SHOW transaction_read_only');
  if(mode.rows[0]?.transaction_read_only!=='on')
    throw Error('CRM read-through requires a read-only SQL transaction');
  const result=await client.query(
    'SELECT tenant_id,customer_id,source_id,payload FROM apex.customer_records '+
    'WHERE tenant_id=$1 AND kind=$2 ORDER BY source_id',
    [tenantId,'crmOpportunities']
  );
  const sqlRows:Projection[]=result.rows.map(row=>{
    const payload=row.payload as Projection | null;
    if(row.tenant_id!==tenantId || !payload || Array.isArray(payload) ||
      typeof payload!=='object' || typeof payload.id!=='string' ||
      row.source_id!==payload.id || typeof payload.customerId!=='string' ||
      row.customer_id!==payload.customerId)
      throw Error('CRM SQL row identity or customer custody mismatch');
    return payload;
  });
  // This also rejects duplicate/missing IDs; hashes never leave the server.
  if(fingerprint(jsonRows)!==fingerprint(sqlRows))
    return {matched:false,rows:[]};
  const matched=new Map(sqlRows.map(row=>[row.id,row]));
  // Preserve the existing JSON business response order and envelope.
  return {matched:true,rows:jsonRows.map(row=>matched.get(row.id)!)};
}
