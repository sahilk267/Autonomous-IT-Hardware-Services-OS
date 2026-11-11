/**
 * Future PostgreSQL adapter transaction boundary; deliberately not connected
 * to the existing JSON API until every call-site can be migrated atomically.
 *
 * Each DB operation MUST use a tenant identity resolved from an authenticated
 * account/membership. Passing a value straight from request.body is forbidden.
 */
export interface TenantSqlClient {
  query(sql: string, values?: readonly unknown[]): Promise<unknown>;
  release(): void;
}
export interface TenantSqlPool {
  connect(): Promise<TenantSqlClient>;
}
export function assertDatabaseTenantId(value: string): string {
  if (typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error('A verified UUID tenant identity is required by the PostgreSQL adapter');
  }
  return value.toLowerCase();
}

export async function withTenantTransaction<T>(
  pool: TenantSqlPool,
  authenticatedTenantId: string,
  operation: (client: TenantSqlClient) => Promise<T>,
): Promise<T> {
  // Validate BEFORE taking a connection or beginning a transaction.
  const tenantId = assertDatabaseTenantId(authenticatedTenantId);
  const client = await pool.connect();
  let began = false;
  try {
    await client.query('BEGIN');
    began = true;
    // SET LOCAL is scoped to the transaction and cannot leak to another user
    // when the pooled connection is returned after COMMIT/ROLLBACK.
    await client.query("SELECT set_config('apex.tenant_id', $1, true)", [tenantId]);
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    if (began) {
      try { await client.query('ROLLBACK'); } catch { /* Preserve original failure. */ }
    }
    throw error;
  } finally {
    client.release();
  }
}
