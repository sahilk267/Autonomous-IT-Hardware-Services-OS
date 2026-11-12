import test from 'node:test';
import assert from 'node:assert/strict';
import { checkHostedDeployment } from '../scripts/validate-hosted-deployment.mjs';

const valid = {
  NODE_ENV: 'production', APP_URL: 'https://app.example.com',
  APEX_STORAGE_MODE: 'postgres', APEX_TENANT_MODE: 'dynamic',
  DATABASE_URL: 'postgresql://limited_runtime:private_value@pg.example.com:5432/apex?sslmode=verify-full',
  APEX_SETUP_TOKEN: 'x'.repeat(64),
};
test('hosted environment check permits a later selected domain and dynamic PostgreSQL', () => {
  const result = checkHostedDeployment(valid);
  assert.equal(result.ok, true);
  assert.equal(result.origin, valid.APP_URL);
  assert.equal(result.tenantMode, 'dynamic');
  assert.equal(JSON.stringify(result).includes('private_value'), false);
  assert.equal(JSON.stringify(result).includes('x'.repeat(64)), false);
});
test('hosted server preflight refuses local endpoints, migration owner secrets and published Vite keys', () => {
  const result = checkHostedDeployment({
    ...valid, APP_URL: 'http://localhost:3000',
    APEX_MIGRATION_DATABASE_URL: 'postgresql://owner:danger@pg/db',
    APEX_TENANT_ID: 'tenant-1',
    VITE_GEMINI_API_KEY: 'server-secret',
    APEX_DESKTOP_MODE: '1',
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.length >= 5);
  assert.equal(JSON.stringify(result).includes('danger'), false);
  assert.equal(JSON.stringify(result).includes('server-secret'), false);
});
test('fixed PostgreSQL requires UUID; JSON requires private absolute path', () => {
  assert.equal(checkHostedDeployment({ ...valid, APEX_TENANT_MODE: 'fixed' }).ok, false);
  const json = checkHostedDeployment({ ...valid, APEX_STORAGE_MODE: 'single', APEX_DATA_DIR: './relative' });
  assert.equal(json.ok, false);
  const ready = checkHostedDeployment({ ...valid, APEX_STORAGE_MODE: 'single', APEX_DATA_DIR: '/srv/private/apex' });
  assert.equal(ready.ok, true);
  assert.ok(ready.warnings.some(x => /one writer only/.test(x)));
});
test('insecure database transport and malformed allowed origins fail preflight', () => {
  const result = checkHostedDeployment({
    ...valid, DATABASE_URL: 'postgresql://user:pass@pg.example.com/apex?sslmode=disable',
    APEX_ALLOWED_ORIGINS: 'http://evil.example.com',
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(x => /TLS/.test(x)));
  assert.ok(result.errors.some(x => /APEX_ALLOWED_ORIGINS/.test(x)));
});
