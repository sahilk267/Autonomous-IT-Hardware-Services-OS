import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
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
import { SESSION_TOKEN_RE, sessionTenantHint, validSessionToken } from './workspaceIdentity.ts';
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
  const bearer = req.headers.authorization?.match(/^Bearer\s+([^\s]+)$/i);
  if (bearer) return validSessionToken(bearer[1]) ? bearer[1] : null;
  const cookie = req.headers.cookie?.split(';').map(v => v.trim())
    .find(v => v.startsWith('apex_session='));
  if (!cookie) return null;
  try {
    const token = decodeURIComponent(cookie.slice('apex_session='.length));
    return validSessionToken(token) ? token : null;
  } catch {
    return null;
  }
}

export class PostgresRuntime {
  readonly pool: Pool;
  readonly dynamicMode: boolean;
  private readonly configuredTenantId: string | null;
  private readonly tenantContext = new AsyncLocalStorage<string>();

  get tenantId(): string {
    const current = this.tenantContext.getStore() ?? this.configuredTenantId;
    if (!current) throw new Error('PostgreSQL request requires a scoped workspace identity');
    return current;
  }

  withTenant<T>(tenantId: string, operation: () => T): T {
    const verifiedFormat = assertDatabaseTenantId(tenantId);
    if (!this.dynamicMode && verifiedFormat !== this.configuredTenantId) {
      throw new Error('Tenant override forbidden in fixed-workspace mode');
    }
    // Tenant routing hint is NOT an authorization decision. Every business
    // request still verifies the hashed session against the RLS table.
    return this.tenantContext.run(verifiedFormat, operation);
  }

  constructor(environment: NodeJS.ProcessEnv = process.env) {
    if (environment.APEX_STORAGE_MODE !== 'postgres') throw new Error('PostgreSQL runtime requires APEX_STORAGE_MODE=postgres');
    if (!environment.DATABASE_URL) throw new Error('DATABASE_URL is required for PostgreSQL runtime');
    this.dynamicMode = environment.APEX_TENANT_MODE === 'dynamic';
    if (environment.APEX_TENANT_MODE && !['fixed', 'dynamic'].includes(environment.APEX_TENANT_MODE)) {
      throw new Error('APEX_TENANT_MODE must be fixed or dynamic');
    }
    if (!this.dynamicMode && !environment.APEX_TENANT_ID) {
      throw new Error('APEX_TENANT_ID must identify a provisioned organization');
    }
    if (this.dynamicMode && environment.APEX_TENANT_ID) {
      throw new Error('APEX_TENANT_ID must be unset in dynamic workspace mode to prevent ambiguous routing');
    }
    this.configuredTenantId = environment.APEX_TENANT_ID
      ? assertDatabaseTenantId(environment.APEX_TENANT_ID) : null;
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
    const client = this.dynamicMode ? await this.pool.connect() : await this.begin();
    try {
      if (this.dynamicMode) await client.query('BEGIN');
      const privileges = await client.query(
        'SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user'
      );
      if (!privileges.rows.length || privileges.rows[0].rolsuper || privileges.rows[0].rolbypassrls) {
        throw new Error('PostgreSQL application role must not be superuser or BYPASSRLS');
      }
      if (!this.dynamicMode) {
        const scoped = await client.query(
          'SELECT id FROM apex_tenants WHERE id = $1 AND disabled_at IS NULL',
          [this.tenantId]
        );
        if (scoped.rowCount !== 1) throw new Error('APEX_TENANT_ID is not an active provisioned tenant');
      }
      // Schema check does not enumerate tenant membership or expose it.
      await client.query('SELECT display_name,email FROM apex_memberships LIMIT 0');
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
      if (!this.dynamicMode) {
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
    if (!validSessionToken(token)) return null;
    if (this.dynamicMode && sessionTenantHint(token) !== this.tenantId) return null;
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
    return (req: Request, res: Response, next: NextFunction) => {
      const target = req.originalUrl.split('?')[0];
      if (!target.startsWith('/api/') || target.startsWith('/api/auth/') ||
          target.startsWith('/api/health') || target.startsWith('/api/integrations/status')) return next();
      if (!this.dynamicMode) return void this.executeScopedApi(req, res, next);
      const tenant = sessionTenantHint(readRequestToken(req));
      if (!tenant) {
        // Shared Telegram webhooks must be bound to one tenant with a separate
        // verified route/secret design. No untrusted tenant headers accepted.
        if (target === '/api/telegram/webhook') {
          return res.status(503).json({ success: false, error: 'Dynamic workspaces require dedicated webhook routing; disabled' });
        }
        return res.status(401).json({ success: false, error: 'Workspace session required' });
      }
      return this.withTenant(tenant, () => { void this.executeScopedApi(req, res, next); });
    };
  }

  private async executeScopedApi(req: Request, res: Response, next: NextFunction) {
      let client: PoolClient | undefined;
      try {
        client = await this.begin();
        const token = readRequestToken(req);
        const account = await this.verifySession(client, token);
        const webhook = req.originalUrl.split('?')[0] === '/api/telegram/webhook';
        if (!account) {
          if (!webhook) {
            await client.query('ROLLBACK');
            client.release();
            client = undefined;
            return res.status(401).json({ success: false, error: 'Authentication required' });
          }
          // Authenticate Telegram's secret before loading or locking ANY
          // business state. The original route still checks owner/chat IDs.
          const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
          const provided = req.get('x-telegram-bot-api-secret-token') || '';
          const valid = !!expected && crypto.timingSafeEqual(
            crypto.createHash('sha256').update(provided).digest(),
            crypto.createHash('sha256').update(expected).digest(),
          );
          if (!valid) {
            await client.query('ROLLBACK');
            client.release();
            client = undefined;
            return res.status(401).json({ success: false, error: 'Invalid Telegram webhook authorization' });
          }
        }
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
