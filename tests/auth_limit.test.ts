// Deterministic limiter checks: no HTTP ports, production files or real credentials.
import assert from 'node:assert/strict';
import { LoginAttemptLimiter } from '../server/login_limit.ts';

const WINDOW_MS = 15 * 60 * 1000;
let checks = 0;
function verify(label: string, f: () => void) {
  f();
  checks++;
  console.log('PASS ' + label);
}

const limiter = new LoginAttemptLimiter();
for (let i = 0; i < 8; i++) {
  limiter.recordFailure('MixedCaseUser', '198.51.100.8', 1000);
}
verify('Eight failed logins lock one case-folded username', () => {
  assert.equal(limiter.getRetryAfterSeconds('mixedcaseuser', '198.51.100.8', 1000), 900);
  assert.equal(limiter.getRetryAfterSeconds('MIXEDCASEUSER', '203.0.113.25', 1000), 900);
});
verify('Another username on same source remains usable below peer threshold', () => {
  assert.equal(limiter.getRetryAfterSeconds('other-user', '198.51.100.8', 1000), 0);
});
limiter.recordSuccess('mixedcaseuser');
verify('Successful sign-in clears only the user-level failure bucket', () => {
  assert.equal(limiter.getRetryAfterSeconds('MixedCaseUser', '198.51.100.8', 1000), 0);
});

const sourceLimiter = new LoginAttemptLimiter();
for (let i = 0; i < 80; i++) {
  sourceLimiter.recordFailure('different-' + i, '198.51.100.100', 2000);
}
verify('Eighty failed attempts across many usernames exhaust peer limit', () => {
  assert.equal(sourceLimiter.getRetryAfterSeconds('never-tried', '198.51.100.100', 2000), 900);
});
verify('Source budget is independent from unrelated socket peer', () => {
  assert.equal(sourceLimiter.getRetryAfterSeconds('never-tried', '203.0.113.101', 2000), 0);
});
sourceLimiter.recordSuccess('different-0');
verify('Success does not erase peer-level credential-stuffing budget', () => {
  assert.equal(sourceLimiter.getRetryAfterSeconds('never-tried', '198.51.100.100', 2000), 900);
});
verify('Failed-login limits expire at the fixed 15-minute window', () => {
  assert.equal(sourceLimiter.getRetryAfterSeconds('never-tried', '198.51.100.100', 2000 + WINDOW_MS), 0);
  assert.equal(limiter.getRetryAfterSeconds('MixedCaseUser', '198.51.100.8', 1000 + WINDOW_MS), 0);
});
console.log('AUTH LIMIT SUMMARY: ' + checks + '/' + checks + ' PASSED');
