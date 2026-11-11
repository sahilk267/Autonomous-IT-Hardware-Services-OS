import crypto from 'node:crypto';
import { assertDatabaseTenantId } from './tenantUnitOfWork.ts';

export const SESSION_TOKEN_RE = /^(?:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.)?([0-9a-f]{64})$/i;

/** Tenant UUID is a routing hint only — never a credential or access grant. */
export function sessionTenantHint(token: string | null): string | null {
  if (!token) return null;
  return SESSION_TOKEN_RE.exec(token)?.[1]?.toLowerCase() ?? null;
}
export function validSessionToken(token: string | null): boolean {
  return !!token && SESSION_TOKEN_RE.test(token);
}
export function issueSessionToken(tenantId: string, dynamicMode: boolean): string {
  const random = crypto.randomBytes(32).toString('hex');
  return dynamicMode ? `${assertDatabaseTenantId(tenantId)}.${random}` : random;
}

export function resolvedTenantHint(
  dynamicMode: boolean,
  configuredTenantId: string | null,
  submittedWorkspaceId: unknown,
): string {
  if (!dynamicMode) {
    if (!configuredTenantId) throw new Error('Fixed mode requires APEX_TENANT_ID');
    return configuredTenantId;
  }
  if (typeof submittedWorkspaceId !== 'string') throw new Error('Select a provisioned workspace UUID');
  return assertDatabaseTenantId(submittedWorkspaceId);
}
