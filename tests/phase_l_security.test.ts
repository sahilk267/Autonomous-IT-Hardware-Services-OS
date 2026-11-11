import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { allowedOrigins, isOriginAllowed, isUnsafeMethod, writeOriginGuard } from '../server/writeOrigin.ts';
import { TenantScopeError, assertSupportedStorageMode } from '../server/tenantIntegrity.ts';
import { PersistentStore, getInitialCleanState } from '../server/db.ts';
import type { Request, Response, NextFunction } from 'express';

test('production origin allowlist accepts HTTPS only and no paths or credentials', () => {
  assert.deepEqual([...allowedOrigins('https://app.example.test', true)], ['https://app.example.test']);
  assert.throws(() => allowedOrigins('http://app.example.test', true), /HTTPS/);
  assert.throws(() => allowedOrigins('https://app.example.test/panel', true), /without paths/);
  assert.throws(() => allowedOrigins('https://user:pass@app.example.test', true), /without paths/);
});

test('CSRF checks block missing, null, spoofed, and wrong origins', () => {
  const origins = allowedOrigins('https://app.example.test', true);
  assert.equal(isOriginAllowed(undefined, origins), false);
  assert.equal(isOriginAllowed('null', origins), false);
  assert.equal(isOriginAllowed('https://attacker.example.test', origins), false);
  assert.equal(isOriginAllowed('https://app.example.test.attacker.test', origins), false);
  assert.equal(isOriginAllowed('https://app.example.test/path', origins), false);
  assert.equal(isOriginAllowed('https://app.example.test', origins), true);
  assert.equal(isUnsafeMethod('GET'), false);
  assert.equal(isUnsafeMethod('DELETE'), true);
});

test('cookie-authenticated writes reject a missing origin even if bearer header is supplied', () => {
  const guard = writeOriginGuard(allowedOrigins('https://app.example.test', true));
  let statusCode = 0;
  let nextCalls = 0;
  const request = {
    method: 'POST',
    path: '/api/state/reset',
    headers: { cookie: 'apex_session=valid; other=1', authorization: 'Bearer supplied' },
    get: (_key: string) => undefined,
  } as unknown as Request;
  const response = {
    status: (code: number) => { statusCode = code; return response; },
    json: (_body: unknown) => response,
  } as unknown as Response;
  guard(request, response, (() => { nextCalls++; }) as NextFunction);
  assert.equal(statusCode, 403);
  assert.equal(nextCalls, 0);
});

test('a matched same-origin browser write reaches authorization middleware', () => {
  const guard = writeOriginGuard(allowedOrigins('https://app.example.test', true));
  let nextCalls = 0;
  const request = {
    method: 'PATCH',
    path: '/api/products/1',
    headers: { cookie: 'apex_session=valid' },
    get: (key: string) => key === 'origin' ? 'https://app.example.test' : undefined,
  } as unknown as Request;
  const response = {} as Response;
  guard(request, response, (() => { nextCalls++; }) as NextFunction);
  assert.equal(nextCalls, 1);
});

test('multi-tenant mode fails closed until the PostgreSQL adapter exists', () => {
  assert.doesNotThrow(() => assertSupportedStorageMode(undefined));
  assert.doesNotThrow(() => assertSupportedStorageMode('single'));
  assert.throws(() => assertSupportedStorageMode('multi'), TenantScopeError);
});

test('fresh independent tenants have distinct stable identities and foreign writes cannot persist', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-phase-l-'));
  try {
    const aPath = path.join(dir, 'a.json');
    const bPath = path.join(dir, 'b.json');
    const a = new PersistentStore(aPath);
    const b = new PersistentStore(bPath);
    assert.notEqual(a.getState().tenant.id, b.getState().tenant.id);
    const stableId = a.getState().tenant.id;
    assert.equal(new PersistentStore(aPath).getState().tenant.id, stableId);
    assert.throws(
      () => a.commit(draft => {
        (draft.products as unknown as Array<{ id: string; tenantId: string }>).push({ id: 'foreign', tenantId: b.getState().tenant.id });
      }),
      /Cross-tenant record rejected/
    );
    assert.equal(new PersistentStore(aPath).getState().products.length, 0);
    assert.throws(() => a.updateTenant({ id: b.getState().tenant.id }), /Tenant identity cannot be changed/);
    a.commit(draft => {
      (draft.products as unknown as Array<{ id: string }>).push({ id: 'own' });
    });
    assert.equal((new PersistentStore(aPath).getState().products[0] as unknown as { tenantId: string }).tenantId, stableId);
    if (process.platform !== 'win32') {
      assert.equal(fs.statSync(aPath).mode & 0o777, 0o600);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('existing legacy single-tenant data remains loadable without tenant reassignment', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-phase-l-legacy-'));
  try {
    const file = path.join(dir, 'legacy.json');
    const legacy = getInitialCleanState();
    legacy.tenant.id = 'tenant-1';
    fs.writeFileSync(file, JSON.stringify(legacy));
    const store = new PersistentStore(file);
    assert.equal(store.getState().tenant.id, 'tenant-1');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
