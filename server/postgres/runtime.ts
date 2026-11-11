import crypto from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import type { Request, Response, NextFunction } from 'express';
import {
  PersistentStore,
  getInitialCleanState,
  runWithScopedStore,
  type AppStoreState,
  type ServerUser,
  type SessionRecord,
} from '../db.ts';
import { enforceSingleTenantIntegrity } from '../tenantIntegrity.ts';
import { assertDatabaseTenantId } from './tenantUnitOfWork.ts';
import {
  captureCriticalState,
  readCriticalState,
  syncCriticalState,
  scrubWorkspaceCriticalCollections,
} from './criticalLedger.mjs';

export interface PgAccount {
  userId: string;
  username: string;
  name: string;
  email: string;
  role: ServerUser['role'];
  tenantId: string;
  createdAt: string;
  expiresAt: string;
}

export function hashSessionToken(token: string): Buffer {
  return crypto.createHash('sha256').update(token).digest();
}

export function readRequestToken(req: Request): string | null {
  const bearer = req.headers.authorization?.match(/^Bearer\s+([0-9a-f]{64})$/i);
  if (bearer) return bearer[1];
  const cookie = req.headers.cookie?.split(';').map(v => v.trim())
    .find(v => v.startsWith('apex_session='));
  if (!cookie) return null;
  try {
    const token = decodeURIComponent(cookie.slice('apex_session='.length));
    return /^[0-9a-f]{64}$/i.test(token) ? token : null;
  } catch {
    return null;
  }
}

export class PostgresRuntime {
  readonly pool: Pool;
  readonly tenantId: string;

  constructor(environment: NodeJS.ProcessEnv = process.env) {
    if (environment.APEX_STORAGE_MODE !== 'postgres') throw new Error('PostgreSQL runtime requires APEX_STORAGE_MODE=postgres');
    if (!environment.DATABASE_URL) throw new Error('DATABASE_URL is required for PostgreSQL runtime');
    if (!environment.APEX_TENANT_ID) throw new Error('APEX_TENANT_ID must identify a provisioned organization');
    this.tenantId = assertDatabaseTenantId(environment.APEX_TENANT_ID);
    this.pool = new Pool({
      connectionString: environment.DATABASE_URL,
      max: 10,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 20_000,
    });
  }

  async begin(): Promise<PoolClient> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('apex.tenant_id', $1, true)", [this.tenantId]);
      return client;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      client.release();
      throw error;
    }
  }

  async preflight(): Promise<void> {
    const client = await this.begin();
    try {
      const privileges = await client.query(
        'SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user'
      );
      if (!privileges.rows.length || privileges.rows[0].rolsuper || privileges.rows[0].rolbypassrls) {
        throw new Error('PostgreSQL application role must not be superuser or BYPASSRLS');
      }
      const scoped = await client.query(
        'SELECT id FROM apex_tenants WHERE id = $1 AND disabled_at IS NULL',
        [this.tenantId]
      );
      if (scoped.rowCount !== 1) throw new Error('APEX_TENANT_ID is not an active provisioned tenant');
      const schema = await client.query(
        'SELECT display_name, email FROM apex_memberships WHERE tenant_id = $1 LIMIT 0',
        [this.tenantId]
      );
      void schema;
      const tables = await client.query(
        "SELECT c.relname AS tablename, c.relrowsecurity AS rowsecurity, c.relforcerowsecurity AS forcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = ANY($1)",
        [[
          'apex_tenants', 'apex_memberships', 'apex_sessions', 'apex_records', 'apex_audit',
          'apex_catalog_products', 'apex_finance_invoices', 'apex_invoice_settlements',
          'apex_inventory_movements', 'apex_finance_quotes', 'apex_critical_ledger_ready',
        ]]
      );
      if (tables.rows.length !== 11 || tables.rows.some(r => !r.rowsecurity || !r.forcerowsecurity)) {
        throw new Error('PostgreSQL RLS is missing or not forced on every tenant-owned table');
      }
      // Stage 3 must not serve a tenant with unsynchronized legacy JSONB
      // finance/inventory arrays. Offline backfill is an explicit operator step.
      const workspace = await client.query(
        "SELECT 1 FROM apex_records WHERE tenant_id=$1 AND record_type='workspace_state' AND record_id='current'",
        [this.tenantId]
      );
      if (workspace.rowCount) {
        const ledger = await client.query(
          'SELECT 1 FROM apex_critical_ledger_ready WHERE tenant_id=$1 AND schema_version=3',
          [this.tenantId]
        );
        if (!ledger.rowCount) throw new Error('Critical ledgers not backfilled; run the reviewed offline backfill command');
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async verifySession(client: PoolClient, token: string | null): Promise<PgAccount | null> {
    if (!token || !/^[0-9a-f]{64}$/i.test(token)) return null;
    const result = await client.query(
      `SELECT m.user_id, m.username, m.display_name, m.email, m.role, m.created_at,
              s.expires_at
         FROM apex_sessions s
         JOIN apex_memberships m ON m.tenant_id = s.tenant_id AND m.user_id = s.user_id
        WHERE s.tenant_id = $1 AND s.token_sha256 = $2
          AND s.revoked_at IS NULL AND s.expires_at > now() AND m.is_active = true`,
      [this.tenantId, hashSessionToken(token)]
    );
    const u = result.rows[0];
    return u ? {
      userId: u.user_id,
      username: u.username,
      name: u.display_name || u.username,
      email: u.email || '',
      role: u.role,
      tenantId: this.tenantId,
      createdAt: new Date(u.created_at).toISOString(),
      expiresAt: new Date(u.expires_at).toISOString(),
    } : null;
  }

  async loadBusinessState(client: PoolClient, exclusive: boolean, account: PgAccount | null, token: string | null): Promise<AppStoreState> {
    const stored = await client.query(
      `SELECT payload FROM apex_records
        WHERE tenant_id = $1 AND record_type = 'workspace_state' AND record_id = 'current'
        ${exclusive ? 'FOR UPDATE' : ''}`,
      [this.tenantId]
    );
    if (stored.rowCount !== 1) throw new Error('Workspace state is not provisioned. First complete authenticated administrator setup.');
    const state = stored.rows[0].payload as AppStoreState & { tenantId?: string };
    if (state.tenant?.id !== this.tenantId || state.tenantId !== this.tenantId) {
      throw new Error('PostgreSQL workspace identity mismatch — refusing to serve another tenant');
    }
    const users = await client.query(
      `SELECT user_id, username, display_name, email, role, created_at
         FROM apex_memberships WHERE tenant_id = $1 AND is_active = true`,
      [this.tenantId]
    );
    state.users = users.rows.map(u => ({
      id: u.user_id,
      username: u.username,
      name: u.display_name || u.username,
      email: u.email || '',
      role: u.role,
      tenantId: this.tenantId,
      createdAt: new Date(u.created_at).toISOString(),
    })) as ServerUser[];
    state.sessions = account && token ? [{
      token,
      userId: account.userId,
      username: account.username,
      role: account.role,
      createdAt: account.createdAt,
      expiresAt: account.expiresAt,
    } as SessionRecord] : [];
    await readCriticalState(client, this.tenantId, state);
    enforceSingleTenantIntegrity(state);
    return state;
  }

  async persistBusinessState(
    client: PoolClient, state: AppStoreState, req: Request,
    account: PgAccount | null, criticalBefore: ReturnType<typeof captureCriticalState>
  ): Promise<void> {
    if (state.tenant.id !== this.tenantId) throw new Error('Cross-tenant state write is forbidden');
    // DB constraints, append-only journal and finance transitions are checked
    // in the SAME transaction as the generic business snapshot and API audit.
    await syncCriticalState(client, this.tenantId, criticalBefore, state, { actorId: account?.userId ?? null });
    // Avoid duplicate sources of truth: critical records live ONLY in their
    // normalized tables; every other module remains in workspace JSONB.
    const payload = scrubWorkspaceCriticalCollections({
      ...state, tenantId: this.tenantId, users: [], sessions: [],
    });
    enforceSingleTenantIntegrity(payload);
    const result = await client.query(
      `UPDATE apex_records
          SET payload = $2::jsonb, revision = revision + 1, updated_at = now()
        WHERE tenant_id = $1 AND record_type = 'workspace_state' AND record_id = 'current'`,
      [this.tenantId, JSON.stringify(payload)]
    );
    if (result.rowCount !== 1) throw new Error('PostgreSQL workspace write did not update exactly one tenant record');

    // Immutable transaction-linked audit, without user-supplied approval claims.
    const target = req.originalUrl.split('?')[0].slice(0, 256);
    await client.query(
      `INSERT INTO apex_audit (tenant_id, actor_id, action, target_type, target_id, details)
       VALUES ($1, $2, $3, 'http_api', $4, $5::jsonb)`,
      [this.tenantId, account?.userId ?? null, `api.${req.method.toLowerCase()}`, target,
       JSON.stringify({ method: req.method, status: 200 })]
    );
  }

  scopedApiMiddleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
      // Handled directly by the dedicated PostgreSQL auth router, or public
      // endpoints with no state access.
      if (!req.originalUrl.startsWith('/api/') ||
          req.originalUrl.startsWith('/api/auth/') ||
          req.originalUrl.startsWith('/api/health') ||
          req.originalUrl.startsWith('/api/integrations/status')) return next();

      let client: PoolClient | undefined;
      try {
        client = await this.begin();
        const token = readRequestToken(req);
        const account = await this.verifySession(client, token);
        const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase());
        const state = await this.loadBusinessState(client, unsafe, account, token);
        const criticalBefore = captureCriticalState(state);
        const store = new PersistentStore(undefined, state);
        const originalJson = res.json.bind(res);
        let finalizing = false;
        let released = false;

        const release = () => {
          if (released) return;
          released = true;
          client!.release();
        };
        res.once('close', () => {
          if (!finalizing) {
            finalizing = true;
            void client!.query('ROLLBACK').catch(() => {}).finally(release);
          }
        });
        res.json = ((body: any): Response => {
          if (finalizing) return res;
          finalizing = true;
          const success = res.statusCode >= 200 && res.statusCode < 400;
          void (async () => {
            if (success && unsafe) {
              await this.persistBusinessState(client!, store.getState(), req, account, criticalBefore);
            }
            await client!.query(success ? 'COMMIT' : 'ROLLBACK');
            originalJson(body);
          })().catch(async error => {
            console.error('[PostgreSQL] Transaction rolled back:', error);
            await client!.query('ROLLBACK').catch(() => {});
            if (!res.headersSent) {
              res.status(503);
              originalJson({ success: false, error: 'Database transaction failed; no changes were committed.' });
            }
          }).finally(release);
          return res;
        }) as Response['json'];

        runWithScopedStore(store, next);
      } catch (error) {
        console.error('[PostgreSQL] Scoped request failed:', error);
        if (client) {
          await client.query('ROLLBACK').catch(() => {});
          client.release();
        }
        if (!res.headersSent) res.status(503).json({ success: false, error: 'Workspace data temporarily unavailable.' });
      }
    };
  }

  freshWorkspaceState(displayName: string): AppStoreState & { tenantId: string } {
    const state = getInitialCleanState() as AppStoreState & { tenantId: string };
    state.tenant.id = this.tenantId;
    state.tenant.name = displayName;
    state.tenantId = this.tenantId;
    enforceSingleTenantIntegrity(state);
    return state;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
