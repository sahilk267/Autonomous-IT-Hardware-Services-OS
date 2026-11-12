'use strict';
const net = require('node:net');

const DESKTOP_PROTOCOL_VERSION = 1;

/**
 * Desktop connects only to an explicitly selected, public HTTPS web origin.
 * It never accepts postgres:// credentials, arbitrary API URLs or IP-based
 * loopback/private targets. TLS verification is performed by Node and Chromium.
 */
function validateHostedOrigin(value) {
  if (typeof value !== 'string' || value.length > 1024 || !value.trim()) {
    throw new Error('Enter the deployed server HTTPS address, for example https://app.example.com');
  }
  if (/[\s\x00-\x1f\x7f]/.test(value) || !/^https:\/\//i.test(value)) {
    throw new Error('Hosted server URL must start with https:// and contain no whitespace');
  }
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error('Invalid hosted server URL'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password ||
      parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('Use a clean HTTPS origin only (no login, path, query or fragment)');
  }
  const name = parsed.hostname.toLowerCase();
  if (!name || name.length > 253 || net.isIP(name) ||
      !name.includes('.') || name === 'localhost' || name.endsWith('.localhost') ||
      name.endsWith('.local') || name.endsWith('.internal') ||
      !/^[a-z0-9.-]+$/.test(name) || name.split('.').some(x => !x || x.startsWith('-') || x.endsWith('-'))) {
    throw new Error('Hosted server must use a public HTTPS domain with a valid TLS certificate');
  }
  return parsed.origin;
}

async function jsonRequest(origin, route, fetcher, timeoutMs) {
  const response = await fetcher(origin + route, {
    method: 'GET',
    credentials: 'omit',
    redirect: 'manual',
    cache: 'no-store',
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (response.status !== 200) throw new Error(`Server ${route} returned HTTP ${response.status}. Check your deployment.`);
  const type = response.headers.get('content-type') || '';
  if (!/\bapplication\/json\b/i.test(type)) {
    throw new Error(`Server ${route} did not return JSON. Check reverse-proxy routing.`);
  }
  const size = Number(response.headers.get('content-length') || 0);
  if (size > 16_384) throw new Error(`Server ${route} returned an unexpectedly large payload`);
  // Limit untrusted responses even when Content-Length is absent.
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Server returned an empty API response');
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > 16_384) throw new Error('Server API payload exceeds limit');
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new Error(`Server ${route} returned invalid JSON`); }
}

/** Safe main-process preflight. No cookies, access tokens, DB URL or API keys. */
async function probeHostedServer(serverUrl, opts = {}) {
  const origin = validateHostedOrigin(serverUrl);
  const request = opts.fetcher || fetch;
  const timeout = opts.timeoutMs || 8000;
  const handshake = await jsonRequest(origin, '/api/desktop/handshake', request, timeout);
  if (handshake?.product !== 'apex-it-os' || handshake?.deploymentMode !== 'hosted') {
    throw new Error('This URL does not identify a compatible hosted Apex server.');
  }
  const range = handshake.desktopProtocol;
  if (!Number.isInteger(range?.min) || !Number.isInteger(range?.max) ||
      range.min > DESKTOP_PROTOCOL_VERSION || range.max < DESKTOP_PROTOCOL_VERSION) {
    throw new Error('Desktop/server protocol mismatch. Update the installer or deploy a compatible server.');
  }
  const health = await jsonRequest(origin, '/api/health', request, timeout);
  if (health?.status !== 'ok' || health?.database?.status !== 'ready') {
    throw new Error('The hosted server is reachable but its database is not ready.');
  }
  const auth = await jsonRequest(origin, '/api/auth/status', request, timeout);
  if (auth?.success !== true || typeof auth?.authenticated !== 'boolean') {
    throw new Error('The hosted server authentication endpoint is not ready.');
  }
  return Object.freeze({
    origin, protocol: DESKTOP_PROTOCOL_VERSION, storageMode: handshake.storageMode,
    tenantMode: handshake.tenantMode, needsSetup: auth.needsSetup === true,
    workspaceSelectionRequired: auth.workspaceSelectionRequired === true,
  });
}

function isPermittedNavigation(candidate, origin) {
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' && url.origin === origin &&
      !url.username && !url.password;
  } catch { return false; }
}

module.exports = {
  DESKTOP_PROTOCOL_VERSION, validateHostedOrigin, probeHostedServer, isPermittedNavigation,
};
