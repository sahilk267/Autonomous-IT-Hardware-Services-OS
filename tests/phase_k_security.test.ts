import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LoginRateLimiter,
  verifySetupToken,
  sessionCookie,
  expiredSessionCookie,
} from '../server/security.ts';

test('bootstrap enrollment fails closed without a configured server token', () => {
  assert.equal(verifySetupToken(undefined, 'anything'), 'unconfigured');
  assert.equal(verifySetupToken('short-token', 'short-token'), 'unconfigured');
});

test('bootstrap token checks valid, absent, incorrect, and very long values', () => {
  const secret = 'f630b3e1c828a0a4f2c598b3a9676d4c0b8bf8d3f715cad96938204895eab12d';
  assert.equal(verifySetupToken(secret, secret), 'valid');
  assert.equal(verifySetupToken(secret, secret + 'x'), 'invalid');
  assert.equal(verifySetupToken(secret, null), 'invalid');
  assert.equal(verifySetupToken(secret, 'x'.repeat(2050)), 'invalid');
});

test('login failures impose a 15-minute 429 window and clear after expiry', () => {
  let now = 0;
  const limit = new LoginRateLimiter(5, 900_000, () => now);
  const key = '192.0.2.1:administrator';
  for (let i = 0; i < 4; i++) {
    limit.fail(key);
    assert.equal(limit.check(key), 0);
  }
  limit.fail(key);
  assert.equal(limit.check(key), 900);
  now = 899_000;
  assert.equal(limit.check(key), 1);
  now = 900_000;
  assert.equal(limit.check(key), 0);
});

test('successful login clears only the relevant account limiter', () => {
  const limit = new LoginRateLimiter(2, 20_000);
  limit.fail('ip:alice');
  limit.fail('ip:alice');
  limit.fail('ip:bob');
  limit.fail('ip:bob');
  assert.ok(limit.check('ip:alice') > 0);
  limit.success('ip:alice');
  assert.equal(limit.check('ip:alice'), 0);
  assert.ok(limit.check('ip:bob') > 0);
});

test('session cookies are HttpOnly, SameSite and Secure for production', () => {
  const cookie = sessionCookie('random-token', true);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /; Secure$/);
  assert.doesNotMatch(sessionCookie('random-token', false), /; Secure/);
  assert.match(expiredSessionCookie(true), /Max-Age=0; Secure$/);
});
