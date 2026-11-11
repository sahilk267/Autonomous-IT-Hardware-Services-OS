import type { AppStoreState } from './db.ts';

/**
 * The legacy JSON store supports ONE organization per server instance.
 * This validation forbids cross-tenant records even when a client smuggles
 * tenantId through a spread payload or PATCH. It is a safety barrier, not
 * a substitute for a PostgreSQL multi-tenant adapter with RLS.
 */
const tenantCollections = [
  'users', 'sessions', 'products', 'leads', 'quotes', 'telegramMessages',
  'suppliers', 'rfqs', 'tickets', 'endpoints', 'jobs', 'assets', 'licenses',
  'amcs', 'projects', 'proposals', 'providers', 'events', 'invoices',
  'workflows', 'rmaClaims', 'knowledgeArticles', 'crmOpportunities',
  'marketplaceDisputes', 'inventoryTransactions',
] as const satisfies ReadonlyArray<keyof AppStoreState>;

export class TenantScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenantScopeError';
  }
}

export function enforceSingleTenantIntegrity(state: AppStoreState): void {
  const tenantId = state.tenant?.id;
  if (typeof tenantId !== 'string' || tenantId.trim().length < 12 || tenantId.length > 128) {
    throw new TenantScopeError('Invalid tenant identity in local data store');
  }

  for (const key of tenantCollections) {
    const records = state[key];
    if (!Array.isArray(records)) throw new TenantScopeError(`Invalid ${key} collection`);
    for (const record of records) {
      if (!record || typeof record !== 'object' || Array.isArray(record)) {
        throw new TenantScopeError(`Invalid record in ${key} collection`);
      }
      const item = record as { tenantId?: unknown };
      if (item.tenantId !== undefined && item.tenantId !== tenantId) {
        throw new TenantScopeError(`Cross-tenant record rejected in ${key} collection`);
      }
      // Existing local-only records had no tenant ID. Tag in memory and during
      // the next successful commit; never infer a tenant from request input.
      item.tenantId = tenantId;
    }
  }
}

/**
 * A JSON file shared between process replicas cannot supply safe multi-tenant
 * transactional semantics. Explicitly disallow claiming it as multi-tenant.
 */
export function assertSupportedStorageMode(mode: string | undefined): void {
  if (mode && mode !== 'single') {
    throw new TenantScopeError('Multi-tenant runtime is disabled until the PostgreSQL data adapter and RLS are wired to every endpoint');
  }
}
