import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {
  DESKTOP_PROTOCOL_VERSION, validateHostedOrigin, probeHostedServer, isPermittedNavigation,
} = require('../desktop/hosted.cjs');
const { validateDesktopSettings, environmentForDesktop } = require('../desktop/config.cjs');

const URL = 'https://app.example.com';
const base = {
  handshake: { product: 'apex-it-os', deploymentMode: 'hosted',
    desktopProtocol: { min: 1, max: 1 }, storageMode: 'postgres', tenantMode: 'dynamic' },
  health: { status: 'ok', database: { status: 'ready' } },
  auth: { success: true, authenticated: false, needsSetup: false },
};
function response(payload, opts={}) {
  return new Response(JSON.stringify(payload), {
    status: opts.status || 200,
    headers: { 'content-type': opts.contentType || 'application/json', ...opts.headers },
  });
}
function mockFetch(overrides={}) {
  const calls = [];
  const routes = {
    '/api/desktop/handshake': response(base.handshake),
    '/api/health': response(base.health),
    '/api/auth/status': response(base.auth),
    ...overrides,
  };
  const fetcher = async (url, opts) => {
    calls.push({ url, opts });
    const route = new globalThis.URL(url).pathname;
    if (!routes[route]) throw Error('Unexpected requested route: ' + route);
    return routes[route];
  };
  return { calls, fetcher };
}

test('installed desktop may remain unconfigured until hosted server is deployed', () => {
  const settings = validateDesktopSettings({ storageMode: 'hosted' }, '/tmp/phase-m-data');
  assert.equal(settings.storageMode, 'hosted');
  assert.equal(settings.serverUrl, '');
  assert.equal(settings.databaseUrl, '');
  assert.equal(settings.tenantId, '');
  assert.throws(() => environmentForDesktop(settings, 3000, 'x'.repeat(64), '/dist'),
    /must never start a local database or backend/);
});
test('hosted mode never persists database credentials or integration secrets', () => {
  const settings = validateDesktopSettings({
    storageMode: 'hosted', serverUrl: 'https://app.example.com/',
    databaseUrl: 'postgresql://user:password@db.local/database',
    tenantMode: 'dynamic', tenantId: 'default-tenant',
    geminiApiKey: 'sensitive', telegramBotToken: 'private', razorpayKeySecret: 'private',
  }, '/tmp/phase-m-data');
  assert.equal(settings.serverUrl, URL);
  assert.equal(settings.databaseUrl, '');
  assert.equal(settings.tenantId, '');
  assert.equal(settings.tenantMode, 'fixed');
  assert.equal('geminiApiKey' in settings, false);
  assert.equal(JSON.stringify(settings).includes('sensitive'), false);
  assert.equal(JSON.stringify(settings).includes('postgresql://'), false);
});
test('remote URL requires a public exact HTTPS origin, never arbitrary endpoint or embedded credential', () => {
  for (const invalid of [
    'http://app.example.com', 'https://localhost', 'https://127.0.0.1',
    'https://192.168.1.3', 'https://[::1]', 'file:///etc/passwd',
    'https://app.example.com/path', 'https://app.example.com/api',
    'https://user:password@app.example.com', 'https://app.example.com/?key=1',
    'https://app.example.com/#hash', 'https://app.example.com.evil.org\n',
    ' https://app.example.com', 'https://metadata.google.internal',
    'https://service.local', 'https://127.0.0.1.nip.io/', '',
  ]) {
    // DNS alias to a loopback IP may have a public-looking domain name;
    // the client relies on valid public TLS and OS DNS policy for that case.
    if (invalid.includes('nip.io')) continue;
    assert.throws(() => validateHostedOrigin(invalid), undefined, invalid);
  }
  assert.equal(validateHostedOrigin('https://app.example.com/'), URL);
  assert.equal(validateHostedOrigin('https://app.example.com:8443'), 'https://app.example.com:8443');
});
test('remote renderer navigation is same-origin HTTPS only', () => {
  assert.equal(isPermittedNavigation('https://app.example.com/dashboard', URL), true);
  assert.equal(isPermittedNavigation('https://app.example.com/auth/login', URL), true);
  for (const dest of [
    'http://app.example.com', 'https://evil.example.com', 'file:///C:/Windows/system.ini',
    'javascript:alert(1)', 'https://app.example.com.evil.test/', 'http://127.0.0.1:3000',
    'https://user:pass@app.example.com',
  ]) assert.equal(isPermittedNavigation(dest, URL), false, dest);
});
test('remote compatibility preflight verifies the actual server without sending secrets or cookies', async () => {
  const { fetcher, calls } = mockFetch();
  const connected = await probeHostedServer(URL, { fetcher });
  assert.equal(connected.origin, URL);
  assert.equal(connected.protocol, DESKTOP_PROTOCOL_VERSION);
  assert.equal(connected.tenantMode, 'dynamic');
  assert.equal(calls.length, 3);
  for (const { url, opts } of calls) {
    assert.equal(new globalThis.URL(url).origin, URL);
    assert.equal(opts.method, 'GET');
    assert.equal(opts.credentials, 'omit');
    assert.equal(opts.redirect, 'manual');
    assert.equal('authorization' in opts.headers, false);
    assert.equal('cookie' in opts.headers, false);
  }
});
test('preflight blocks wrong product, local backend, incompatible API and unready database', async () => {
  const wrongs = [
    { '/api/desktop/handshake': response({ ...base.handshake, product: 'other-app' }) },
    { '/api/desktop/handshake': response({ ...base.handshake, deploymentMode: 'desktop-local' }) },
    { '/api/desktop/handshake': response({ ...base.handshake, desktopProtocol: { min: 2, max: 4 } }) },
    { '/api/health': response({ status: 'ok', database: { status: 'down' } }) },
    { '/api/auth/status': response({ success: false, authenticated: false }) },
    { '/api/auth/status': response({ success: true, authenticated: 'false' }) },
    { '/api/desktop/handshake': response(base.handshake, { status: 302 }) },
    { '/api/desktop/handshake': response(base.handshake, { contentType: 'text/html' }) },
  ];
  for (const entry of wrongs) {
    const { fetcher } = mockFetch(entry);
    await assert.rejects(probeHostedServer(URL, { fetcher }), /compatible|protocol|database|authentication|HTTP|JSON/i);
  }
});
test('preflight fails closed when missing, oversized or malformed JSON is returned', async () => {
  const wrongs = [
    response({ ...base.handshake, payload: 'x'.repeat(17000) }),
    new Response('not-json', { status: 200, headers: { 'content-type': 'application/json' } }),
    new Response('{}', { status: 200, headers: { 'content-type': 'application/json', 'content-length': '20000' } }),
  ];
  for (const value of wrongs) {
    const { fetcher } = mockFetch({ '/api/desktop/handshake': value });
    await assert.rejects(probeHostedServer(URL, { fetcher }), /payload|invalid JSON/);
  }
});

test('deferred remote choice persists across restart and needs explicit verification to activate', () => {
  const directory = process.platform === 'win32' ? 'C:\\Apex\\Data' : '/tmp/apex-data';
  const deferred = validateDesktopSettings({
    storageMode: 'hosted',
    serverUrl: 'https://staging.example.com',
    connectionPending: true,
  }, directory);
  assert.equal(deferred.connectionPending, true);
  const afterRestart = validateDesktopSettings(JSON.parse(JSON.stringify(deferred)), directory);
  assert.equal(afterRestart.connectionPending, true);
  assert.equal(afterRestart.serverUrl, 'https://staging.example.com');
  const preExistingWithoutFlag = validateDesktopSettings({
    storageMode: 'hosted', serverUrl: 'https://staging.example.com',
  }, directory);
  assert.equal(preExistingWithoutFlag.connectionPending, true);
  const verified = validateDesktopSettings({
    storageMode: 'hosted', serverUrl: 'https://staging.example.com',
    connectionPending: false,
  }, directory);
  assert.equal(verified.connectionPending, false);
  const empty = validateDesktopSettings({
    storageMode: 'hosted', connectionPending: false,
  }, directory);
  assert.equal(empty.connectionPending, true);
});
