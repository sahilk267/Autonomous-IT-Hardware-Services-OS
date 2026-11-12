#!/usr/bin/env node
/** Read-only public HTTPS deployment acceptance (no credentials needed). */
import tls from 'node:tls';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function parseAcceptanceOrigin(input) {
  if (typeof input !== 'string' || !input) throw new Error('Pass an explicit HTTPS deployment origin');
  const url = new URL(input);
  if (url.protocol !== 'https:' || url.username || url.password || url.search ||
      url.hash || url.pathname !== '/' || !url.hostname ||
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('Acceptance requires an explicit public HTTPS origin without credentials, path or query');
  }
  return url.origin;
}

export async function certificateInfo(url) {
  const target = new URL(url);
  const cert = await new Promise((resolve, reject) => {
    const socket = tls.connect({
      host: target.hostname,
      port: Number(target.port || 443),
      servername: target.hostname,
      rejectUnauthorized: true,
      timeout: 12000,
    }, () => {
      try {
        if (!socket.authorized) throw new Error('TLS certificate is not authorized');
        const certificate = socket.getPeerCertificate();
        if (!certificate?.valid_to) throw new Error('TLS certificate validity not available');
        resolve({ validUntil: certificate.valid_to,
          daysRemaining: Math.floor((new Date(certificate.valid_to).getTime() - Date.now()) / 86400000) });
      } catch (error) { reject(error); }
      socket.end();
    });
    socket.on('error', reject);
    socket.on('timeout', () => { socket.destroy(); reject(new Error('TLS handshake timed out')); });
  });
  return cert;
}

async function fetchPublic(base, route, options = {}) {
  const response = await fetch(base + route, {
    method: options.method || 'GET',
    headers: { ...(options.origin ? { origin: options.origin } : {}),
      ...(options.method === 'POST' ? { 'content-type': 'application/json' } : {}) },
    body: options.method === 'POST' ? '{}' : undefined,
    redirect: 'manual',
    signal: AbortSignal.timeout(12000),
  });
  const text = await response.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }
  return { status: response.status, headers: Object.fromEntries(response.headers), json, text: text.slice(0, 3000) };
}

export async function runHostingerAcceptance(input, probe = fetchPublic, checkTls = certificateInfo) {
  const base = parseAcceptanceOrigin(input);
  const checks = [];
  const validate = (name, success, evidence) => {
    checks.push({ name, passed: !!success, evidence });
  };
  const tlsCertificate = await checkTls(base);
  validate('TLS certificate valid for at least 14 more days',
    tlsCertificate.daysRemaining >= 14, `${tlsCertificate.daysRemaining} days, expires ${tlsCertificate.validUntil}`);
  const handshake = await probe(base, '/api/desktop/handshake');
  validate('Desktop-compatible Apex server handshake',
    handshake.status === 200 && handshake.json?.product === 'apex-it-os' &&
      handshake.json?.deploymentMode === 'hosted' &&
      Number.isInteger(handshake.json?.desktopProtocol?.min) &&
      Number.isInteger(handshake.json?.desktopProtocol?.max) &&
      handshake.json.desktopProtocol.min <= 1 && handshake.json.desktopProtocol.max >= 1,
    `HTTP ${handshake.status}, product ${handshake.json?.product || 'unknown'}`);
  const health = await probe(base, '/api/health');
  validate('Health and authoritative DB ready', health.status === 200 &&
    health.json?.status === 'ok' && health.json?.database?.status === 'ready',
    `HTTP ${health.status}, DB ${health.json?.database?.status || 'unknown'}`);
  validate('HSTS on production HTTPS',
    typeof health.headers['strict-transport-security'] === 'string' &&
      /max-age=\d+/.test(health.headers['strict-transport-security']),
    health.headers['strict-transport-security'] || 'missing');
  validate('X-Content-Type-Options', health.headers['x-content-type-options'] === 'nosniff',
    health.headers['x-content-type-options'] || 'missing');
  validate('API responses never cached publicly',
    /no-store/i.test(health.headers['cache-control'] || ''),
    health.headers['cache-control'] || 'missing');
  validate('No Express version disclosure',
    !health.headers['x-powered-by'], health.headers['x-powered-by'] ? 'leaked' : 'not exposed');

  const auth = await probe(base, '/api/auth/status');
  validate('Authentication status readable without credentials',
    auth.status === 200 && auth.json?.success === true &&
    typeof auth.json?.authenticated === 'boolean',
    `HTTP ${auth.status}`);
  const protectedState = await probe(base, '/api/state');
  validate('Unauthenticated business state blocked',
    protectedState.status === 401 && protectedState.json?.success === false,
    `HTTP ${protectedState.status}`);
  const protectedTenant = await probe(base, '/api/tenant');
  validate('Unauthenticated tenant access blocked',
    protectedTenant.status === 401, `HTTP ${protectedTenant.status}`);
  const crossSite = await probe(base, '/api/auth/login', {
    method: 'POST', origin: 'https://untrusted-phase-m-test.invalid',
  });
  validate('Cross-origin login write rejected before credentials',
    crossSite.status === 403, `HTTP ${crossSite.status}`);
  const page = await probe(base, '/');
  validate('Application frontend served',
    page.status === 200 && /text\/html/i.test(page.headers['content-type'] || ''),
    `HTTP ${page.status}, type ${page.headers['content-type'] || 'unknown'}`);

  const result = {
    format: 'apex-hostinger-acceptance-v1',
    testedAt: new Date().toISOString(), origin: base,
    passed: checks.every(x => x.passed), checks,
    note: 'External HTTPS-only checks; Hostinger plan identity, DB restore, real login, Windows installer and owner permissions require authenticated private acceptance.',
  };
  return result;
}

async function main() {
  const result = await runHostingerAcceptance(process.argv[2]);
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exitCode = 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error('Hostinger acceptance failed closed: ' + error.message);
    process.exitCode = 1;
  });
}
