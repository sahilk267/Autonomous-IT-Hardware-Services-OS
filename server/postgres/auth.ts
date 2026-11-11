import crypto from 'node:crypto';
import type { Express, Request, Response } from 'express';
import type { PoolClient } from 'pg';
import { hashPassword, verifyPassword } from '../db.ts';
import { LoginRateLimiter, verifySetupToken, deriveWorkspaceSetupToken, sessionCookie, expiredSessionCookie } from '../security.ts';
import { hashSessionToken, readRequestToken, PostgresRuntime } from './runtime.ts';
import { markEmptyCriticalLedgerReady } from './criticalLedger.mjs';
import { issueSessionToken, sessionTenantHint, resolvedTenantHint } from './workspaceIdentity.ts';

interface Result {
  status: number;
  payload: Record<string, unknown>;
  cookie?: string;
}

const failures = new LoginRateLimiter();

async function transact<T>(runtime: PostgresRuntime, operation: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await runtime.begin();
  try {
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function send(res: Response, operation: () => Promise<Result>): Promise<void> {
  try {
    const result = await operation();
    if (result.cookie) res.setHeader('Set-Cookie', result.cookie);
    res.status(result.status).json(result.payload);
  } catch (error) {
    console.error('[PostgreSQL/auth] Database request rejected:', error);
    res.status(503).json({ success: false, error: 'Authentication service temporarily unavailable.' });
  }
}

function publicUser(row: any, tenantId: string) {
  return {
    id: row.user_id,
    username: row.username,
    name: row.display_name || row.username,
    email: row.email || '',
    role: row.role,
    tenantId,
  };
}

async function createSession(client: PoolClient, runtime: PostgresRuntime, userId: string): Promise<string> {
  const token = issueSessionToken(runtime.tenantId, runtime.dynamicMode);
  await client.query(
    `INSERT INTO apex_sessions (tenant_id, token_sha256, user_id, expires_at)
     VALUES ($1, $2, $3, now() + interval '24 hours')`,
    [runtime.tenantId, hashSessionToken(token), userId]
  );
  return token;
}

export function registerPostgresAuth(app: Express, runtime: PostgresRuntime): void {
  const production = process.env.NODE_ENV === 'production';

  // Every protected request resolves tenant scope from an existing session
  // token. For login/setup only, a caller may supply a tenant UUID as a HINT;
  // membership+password or bootstrap token is still mandatory.
  app.use(['/api/auth', '/api/admin/users'], (req, res, next) => {
    if (!runtime.dynamicMode) return next();
    const route = req.originalUrl.split('?')[0];
    const status = route === '/api/auth/status';
    const publicEnrollment = route === '/api/auth/login' || route === '/api/auth/setup';
    const submitted = publicEnrollment ? req.body?.workspaceId
      : status ? (req.query.workspaceId || sessionTenantHint(readRequestToken(req)))
      : sessionTenantHint(readRequestToken(req));
    if (status && !submitted) {
      return res.json({
        success: true, tenantMode: 'dynamic', workspaceSelectionRequired: true,
        authenticated: false, setupRequired: false, needsSetup: false, user: null,
      });
    }
    if (!submitted && !publicEnrollment) {
      return res.status(401).json({ success: false, error: 'Workspace session required' });
    }
    try {
      const scope = resolvedTenantHint(true, null, submitted);
      runtime.withTenant(scope, next);
    } catch {
      res.status(publicEnrollment || status ? 400 : 401).json({
        success: false, error: 'A valid provisioned workspace UUID is required',
      });
    }
  });

  app.get('/api/health', (_req, res) => {
    void send(res, async () => {
      if (runtime.dynamicMode) {
        await runtime.pool.query('SELECT 1');
        return { status: 200,
          payload: { status: 'ok', tenantMode: 'dynamic', database: { status: 'ready', engine: 'postgresql' } } };
      }
      return transact(runtime, async client => {
        await client.query('SELECT id FROM apex_tenants WHERE id = $1', [runtime.tenantId]);
        return { status: 200,
          payload: { status: 'ok', tenantMode: 'fixed', database: { status: 'ready', engine: 'postgresql' } } };
      });
    });
  });

  app.get('/api/auth/status', (req, res) => {
    void send(res, async () => transact(runtime, async client => {
      const count = await client.query(
        'SELECT count(*)::int AS count FROM apex_memberships WHERE tenant_id = $1',
        [runtime.tenantId]
      );
      const existing = Number(count.rows[0].count);
      const account = await runtime.verifySession(client, readRequestToken(req));
      return {
        status: 200,
        payload: {
          success: true,
          setupRequired: existing === 0,
          needsSetup: existing === 0,
          authenticated: !!account,
          tenantMode: runtime.dynamicMode ? 'dynamic' : 'fixed',
          workspaceId: runtime.tenantId,
          user: account ? { id: account.userId, username: account.username, role: account.role, tenantId: runtime.tenantId } : null,
        },
      };
    }));
  });

  app.post('/api/auth/setup', (req, res) => {
    void send(res, async (): Promise<Result> => {
      const expectedSetupToken = runtime.dynamicMode
        ? deriveWorkspaceSetupToken(process.env.APEX_SETUP_TOKEN, runtime.tenantId)
        : process.env.APEX_SETUP_TOKEN;
      const check = verifySetupToken(expectedSetupToken ?? undefined, req.body?.setupToken);
      if (check === 'unconfigured') return {
        status: 503, payload: { success: false, error: 'Setup is locked. Configure a private APEX_SETUP_TOKEN of at least 32 characters.' }
      };
      if (check !== 'valid') return {
        status: 403, payload: { success: false, error: 'Invalid setup authorization token.' }
      };
      const { username, password, name, email } = req.body ?? {};
      if (typeof username !== 'string' || username.trim().length < 3 || username.length > 128 ||
          typeof password !== 'string' || password.length < 12 || password.length > 1024 ||
          (name !== undefined && (typeof name !== 'string' || name.length > 256)) ||
          (email !== undefined && (typeof email !== 'string' || email.length > 256))) {
        return { status: 400, payload: { success: false, error: 'Invalid admin credentials or profile fields.' } };
      }

      return transact(runtime, async client => {
        // Serializable first-run enrollment without granting the application
        // UPDATE permission on tenants. Advisory xact lock is keyed to the
        // server-verified tenant UUID and released automatically on commit.
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))', [runtime.tenantId]);
        const tenant = await client.query(
          'SELECT id, display_name FROM apex_tenants WHERE id = $1 AND disabled_at IS NULL',
          [runtime.tenantId]
        );
        if (tenant.rowCount !== 1) return {
          status: 503, payload: { success: false, error: 'Workspace must be provisioned by the database operator first.' }
        };
        const existing = await client.query(
          'SELECT count(*)::int AS count FROM apex_memberships WHERE tenant_id = $1',
          [runtime.tenantId]
        );
        if (Number(existing.rows[0].count) > 0) return {
          status: 403, payload: { success: false, error: 'Initial administrator enrollment is already completed.' }
        };
        const id = crypto.randomUUID();
        const { salt, hash } = hashPassword(password);
        const user = await client.query(
          `INSERT INTO apex_memberships
            (tenant_id, user_id, username, password_hash, role, display_name, email)
           VALUES ($1,$2,$3,$4,'BUSINESS_OWNER',$5,$6)
           RETURNING user_id, username, display_name, email, role`,
          [runtime.tenantId, id, username.trim(), `${salt}:${hash}`,
           (name || '').trim() || 'System Administrator', (email || '').trim()]
        );
        // A verified legacy import may contain business records but zero
        // usable accounts. Bootstrap must never overwrite that imported data.
        const existingWorkspace = await client.query(
          "SELECT 1 FROM apex_records WHERE tenant_id=$1 AND record_type='workspace_state' AND record_id='current'",
          [runtime.tenantId]
        );
        if (existingWorkspace.rowCount === 0) {
          const state = runtime.freshWorkspaceState(tenant.rows[0].display_name);
          await client.query(
            `INSERT INTO apex_records (tenant_id,record_type,record_id,payload)
             VALUES ($1,'workspace_state','current',$2::jsonb)`,
            [runtime.tenantId, JSON.stringify(state)]
          );
          // A brand-new organization starts with empty normalized ledgers.
          // Legacy imports require the offline backfill command instead.
          await markEmptyCriticalLedgerReady(client, runtime.tenantId);
        } else {
          const ready = await client.query(
            'SELECT 1 FROM apex_critical_ledger_ready WHERE tenant_id=$1 AND schema_version=3',
            [runtime.tenantId]
          );
          if (!ready.rowCount) throw new Error('Imported workspace requires reviewed critical-ledger backfill');
        }
        const token = await createSession(client, runtime, id);
        await client.query(
          `INSERT INTO apex_audit (tenant_id,actor_id,action,target_type,target_id)
           VALUES ($1,$2,'auth.bootstrap','membership',$3)`,
          [runtime.tenantId, id, id]
        );
        return {
          status: 201, payload: { success: true, user: publicUser(user.rows[0], runtime.tenantId) },
          cookie: sessionCookie(token, production),
        };
      });
    });
  });

  app.post('/api/auth/login', (req, res) => {
    void send(res, async (): Promise<Result> => {
      const { username, password } = req.body ?? {};
      if (typeof username !== 'string' || typeof password !== 'string' ||
          !username || !password || username.length > 128 || password.length > 1024) {
        return { status: 400, payload: { success: false, error: 'Invalid username or password.' } };
      }
      const key = `${req.ip || req.socket.remoteAddress || 'unknown'}:${username.toLowerCase().trim()}`;
      const remaining = failures.check(key);
      if (remaining) {
        res.setHeader('Retry-After', String(remaining));
        return { status: 429, payload: { success: false, error: 'Too many login attempts. Try again later.' } };
      }
      const result = await transact(runtime, async client => {
        const user = await client.query(
          `SELECT user_id, username, password_hash, display_name, email, role
             FROM apex_memberships WHERE tenant_id = $1 AND lower(username) = lower($2)
               AND is_active = true`,
          [runtime.tenantId, username.trim()]
        );
        const account = user.rows[0];
        const encoded = typeof account?.password_hash === 'string' ? account.password_hash : '';
        const sep = encoded.indexOf(':');
        const valid = sep > 0 && verifyPassword(password, encoded.slice(0, sep), encoded.slice(sep + 1));
        if (!valid) return null;
        const token = await createSession(client, runtime, account.user_id);
        await client.query(
          `INSERT INTO apex_audit (tenant_id, actor_id, action, target_type, target_id)
           VALUES ($1,$2,'auth.login','membership',$3)`,
          [runtime.tenantId, account.user_id, account.user_id]
        );
        return { account, token };
      });
      if (!result) {
        failures.fail(key);
        return { status: 401, payload: { success: false, error: 'Invalid username or password.' } };
      }
      failures.success(key);
      return {
        status: 200,
        payload: { success: true, user: publicUser(result.account, runtime.tenantId) },
        cookie: sessionCookie(result.token, production),
      };
    });
  });

  app.get('/api/auth/me', (req, res) => {
    void send(res, async () => transact(runtime, async client => {
      const account = await runtime.verifySession(client, readRequestToken(req));
      if (!account) return { status: 401, payload: { success: false, error: 'Unauthorized' } };
      const state = await client.query(
        `SELECT payload->'tenant' AS tenant FROM apex_records
          WHERE tenant_id = $1 AND record_type = 'workspace_state' AND record_id = 'current'`,
        [runtime.tenantId]
      );
      return {
        status: 200,
        payload: {
          success: true,
          user: {
            id: account.userId, username: account.username, name: account.name,
            email: account.email, role: account.role, tenantId: runtime.tenantId,
          },
          tenant: state.rows[0]?.tenant ?? null,
        }
      };
    }));
  });

  app.post('/api/auth/logout', (req, res) => {
    void send(res, async () => transact(runtime, async client => {
      const token = readRequestToken(req);
      const account = await runtime.verifySession(client, token);
      if (!account || !token) return {
        status: 401, payload: { success: false, error: 'Unauthorized' }
      };
      await client.query(
        `UPDATE apex_sessions SET revoked_at = now()
         WHERE tenant_id = $1 AND token_sha256 = $2 AND revoked_at IS NULL`,
        [runtime.tenantId, hashSessionToken(token)]
      );
      await client.query(
        `INSERT INTO apex_audit (tenant_id, actor_id, action, target_type, target_id)
         VALUES ($1,$2,'auth.logout','membership',$3)`,
        [runtime.tenantId, account.userId, account.userId]
      );
      return {
        status: 200, payload: { success: true, message: 'Logged out successfully.' },
        cookie: expiredSessionCookie(production),
      };
    }));
  });
  // Prevent destructive reset of legal/financial journals and invoice history.
  // Offline retention-aware archival must be an explicit operator workflow.
  app.post('/api/state/reset', (_req, res) => {
    res.status(409).json({
      success: false,
      error: 'PostgreSQL financial and inventory ledgers cannot be reset from the web UI.',
    });
  });

  // Membership management is server-side and RLS scoped. The existing React
  // header's role switcher never grants privileges.
  app.get('/api/admin/users', (req, res) => {
    void send(res, async () => transact(runtime, async client => {
      const owner = await runtime.verifySession(client, readRequestToken(req));
      if (!owner) return { status: 401, payload: { success: false, error: 'Unauthorized' } };
      if (owner.role !== 'BUSINESS_OWNER') return { status: 403, payload: { success: false, error: 'Owner privileges required' } };
      const users = await client.query(
        `SELECT user_id, username, role, display_name, email, is_active
           FROM apex_memberships WHERE tenant_id = $1 ORDER BY created_at`,
        [runtime.tenantId]
      );
      return { status: 200, payload: {
        success: true,
        data: users.rows.map(row => ({ ...publicUser(row, runtime.tenantId), isActive: row.is_active }))
      } };
    }));
  });

  app.post('/api/admin/users', (req, res) => {
    void send(res, async () => transact(runtime, async client => {
      const owner = await runtime.verifySession(client, readRequestToken(req));
      if (!owner) return { status: 401, payload: { success: false, error: 'Unauthorized' } };
      if (owner.role !== 'BUSINESS_OWNER') return { status: 403, payload: { success: false, error: 'Owner privileges required' } };
      const { username, password, name, email, role } = req.body ?? {};
      const validRoles = ['BUSINESS_OWNER', 'SALES_MANAGER', 'ENTERPRISE_IT_HEAD', 'FIELD_ENGINEER', 'PROCUREMENT_LEAD'];
      if (typeof username !== 'string' || username.trim().length < 3 || username.length > 128 ||
          typeof password !== 'string' || password.length < 12 || password.length > 1024 ||
          !validRoles.includes(role) ||
          (name !== undefined && (typeof name !== 'string' || name.length > 256)) ||
          (email !== undefined && (typeof email !== 'string' || email.length > 256))) {
        return { status: 400, payload: { success: false, error: 'Invalid operator credentials or role' } };
      }
      const exists = await client.query(
        'SELECT 1 FROM apex_memberships WHERE tenant_id=$1 AND lower(username)=lower($2)',
        [runtime.tenantId, username.trim()]
      );
      if (exists.rowCount) return { status: 409, payload: { success: false, error: 'Username already exists in this workspace' } };
      const id = crypto.randomUUID();
      const { salt, hash } = hashPassword(password);
      const created = await client.query(
        `INSERT INTO apex_memberships
         (tenant_id,user_id,username,password_hash,role,display_name,email)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING user_id,username,role,display_name,email`,
        [runtime.tenantId, id, username.trim(), `${salt}:${hash}`, role,
         (name || '').trim() || username.trim(), (email || '').trim()]
      );
      await client.query(
        `INSERT INTO apex_audit(tenant_id,actor_id,action,target_type,target_id,details)
         VALUES($1,$2,'membership.create','membership',$3,$4::jsonb)`,
        [runtime.tenantId, owner.userId, id, JSON.stringify({ assignedRole: role })]
      );
      return { status: 201, payload: { success: true, user: publicUser(created.rows[0], runtime.tenantId) } };
    }));
  });

  app.post('/api/admin/users/:id/disable', (req, res) => {
    void send(res, async () => transact(runtime, async client => {
      const owner = await runtime.verifySession(client, readRequestToken(req));
      if (!owner) return { status: 401, payload: { success: false, error: 'Unauthorized' } };
      if (owner.role !== 'BUSINESS_OWNER') return { status: 403, payload: { success: false, error: 'Owner privileges required' } };
      const id = req.params.id;
      if (!/^[0-9a-f-]{36}$/i.test(id) || id === owner.userId) {
        return { status: 400, payload: { success: false, error: 'Invalid target account or self-disable forbidden' } };
      }
      const result = await client.query(
        `UPDATE apex_memberships SET is_active = false
         WHERE tenant_id=$1 AND user_id=$2 AND is_active=true RETURNING user_id`,
        [runtime.tenantId, id]
      );
      if (!result.rowCount) return { status: 404, payload: { success: false, error: 'Active user not found' } };
      await client.query(
        'UPDATE apex_sessions SET revoked_at = now() WHERE tenant_id=$1 AND user_id=$2 AND revoked_at IS NULL',
        [runtime.tenantId, id]
      );
      await client.query(
        `INSERT INTO apex_audit(tenant_id,actor_id,action,target_type,target_id)
         VALUES($1,$2,'membership.disable','membership',$3)`,
        [runtime.tenantId, owner.userId, id]
      );
      return { status: 200, payload: { success: true, disabledUserId: id } };
    }));
  });

}
