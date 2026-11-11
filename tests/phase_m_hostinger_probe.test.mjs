import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAcceptanceOrigin, runHostingerAcceptance } from '../scripts/hostinger-acceptance.mjs';

const site = 'https://staging.example.invalid';
test('Hostinger acceptance requires exact public HTTPS with no URL credentials', () => {
  assert.equal(parseAcceptanceOrigin(site), site);
  for (const invalid of [
    'http://staging.example.invalid', 'https://127.0.0.1',
    'https://localhost:9000', 'https://user:password@staging.example.invalid',
    'https://staging.example.invalid/unsafe', 'https://staging.example.invalid?token=abc',
  ]) assert.throws(() => parseAcceptanceOrigin(invalid), /HTTPS|origin/);
});
test('Hostinger acceptance collects minimal read-only checks and rejects insecure responses', async () => {
  const calls = [];
  const probe = async (_base, url, options = {}) => {
    calls.push({ url, options });
    if (url === '/api/health') return { status: 200,
      json: { status: 'ok', database: { status: 'ready' } },
      headers: { 'strict-transport-security': 'max-age=31536000',
        'x-content-type-options': 'nosniff', 'cache-control': 'no-store' } };
    if (url === '/api/auth/status') return { status: 200,
      json: { success: true, authenticated: false }, headers: {} };
    if (url === '/api/state' || url === '/api/tenant') return {
      status: 401, json: { success: false }, headers: {},
    };
    if (url === '/api/auth/login') return {
      status: 403, json: { success: false }, headers: {},
    };
    return { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } };
  };
  const tls = async () => ({ daysRemaining: 100, validUntil: '2027-05-01' });
  const result = await runHostingerAcceptance(site, probe, tls);
  assert.equal(result.passed, true);
  assert.equal(result.checks.length, 11);
  assert.equal(calls.filter(x => x.options.method === 'POST').length, 1);
  const bad = await runHostingerAcceptance(site, async (...args) => {
    const baseResult = await probe(...args);
    if (args[1] === '/api/state') return { ...baseResult, status: 200 };
    return baseResult;
  }, tls);
  assert.equal(bad.passed, false);
  assert.match(bad.checks.find(x => x.name.includes('business state')).evidence, /200/);
});
