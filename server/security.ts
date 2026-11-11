import crypto from 'node:crypto';

export type SetupTokenResult = 'unconfigured' | 'invalid' | 'valid';

/**
 * Compare a deployment-supplied one-time bootstrap secret without exposing
 * length-dependent string-comparison behavior. No hardcoded bypasses.
 */
export function verifySetupToken(configured: string | undefined, supplied: unknown): SetupTokenResult {
  if (!configured || configured.length < 32) return 'unconfigured';
  if (typeof supplied !== 'string' || supplied.length > 2048) return 'invalid';

  const expectedHash = crypto.createHash('sha256').update(configured).digest();
  const receivedHash = crypto.createHash('sha256').update(supplied).digest();
  return crypto.timingSafeEqual(expectedHash, receivedHash) ? 'valid' : 'invalid';
}

export class LoginRateLimiter {
  private attempts = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly maxAttempts = 5,
    private readonly windowMs = 15 * 60 * 1000,
    private readonly now: () => number = () => Date.now()
  ) {}

  check(key: string): number {
    const entry = this.attempts.get(key);
    if (!entry) return 0;
    const now = this.now();
    if (entry.resetAt <= now) {
      this.attempts.delete(key);
      return 0;
    }
    return entry.count >= this.maxAttempts ? Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) : 0;
  }

  fail(key: string): void {
    const now = this.now();
    const entry = this.attempts.get(key);
    if (!entry || entry.resetAt <= now) {
      this.attempts.set(key, { count: 1, resetAt: now + this.windowMs });
    } else {
      entry.count += 1;
    }
    // Protect the process from unbounded growth under username-spray attacks.
    if (this.attempts.size > 10_000) {
      for (const [candidate, record] of this.attempts) {
        if (record.resetAt <= now) this.attempts.delete(candidate);
      }
      while (this.attempts.size > 10_000) {
        this.attempts.delete(this.attempts.keys().next().value!);
      }
    }
  }

  success(key: string): void {
    this.attempts.delete(key);
  }
}

export function sessionCookie(token: string, production: boolean): string {
  return `apex_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${production ? '; Secure' : ''}`;
}

export function expiredSessionCookie(production: boolean): string {
  return `apex_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${production ? '; Secure' : ''}`;
}
