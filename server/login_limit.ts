// Per-process login failure throttling; temporary defense until a shared multi-instance store exists.
// Never trust client-provided X-Forwarded-For without a dedicated reverse-proxy trust policy.
const WINDOW_MS = 15 * 60 * 1000;
const USER_LIMIT = 8;
const SOURCE_LIMIT = 80;
const MAX_TRACKED_KEYS = 4096;
interface Bucket { failures: number; expiresAt: number }

export class LoginAttemptLimiter {
  private readonly buckets = new Map<string, Bucket>();

  private get(key: string, now: number): Bucket | null {
    const value = this.buckets.get(key);
    if (!value) return null;
    if (value.expiresAt <= now) {
      this.buckets.delete(key);
      return null;
    }
    return value;
  }

  private increase(key: string, now: number) {
    const value = this.get(key, now);
    // Purge expired entries and cap memory; this is best-effort single-process defense.
    if (!value && this.buckets.size >= MAX_TRACKED_KEYS) {
      for (const [name, item] of this.buckets) {
        if (item.expiresAt <= now) this.buckets.delete(name);
      }
      while (this.buckets.size >= MAX_TRACKED_KEYS) {
        const oldest = this.buckets.keys().next().value;
        if (!oldest) break;
        this.buckets.delete(oldest);
      }
    }
    this.buckets.set(key, value
      ? { failures: value.failures + 1, expiresAt: value.expiresAt }
      : { failures: 1, expiresAt: now + WINDOW_MS });
  }

  private userKey(username: string) {
    // Client-supplied usernames can be sensitive. Never put them in request logs.
    return 'account:' + username.trim().toLowerCase();
  }
  private sourceKey(source: string) {
    return 'source:' + source;
  }
  public getRetryAfterSeconds(username: string, source: string, now = Date.now()): number {
    const user = this.get(this.userKey(username), now);
    const origin = this.get(this.sourceKey(source), now);
    const until = Math.max(user && user.failures >= USER_LIMIT ? user.expiresAt : 0,
      origin && origin.failures >= SOURCE_LIMIT ? origin.expiresAt : 0);
    return until > now ? Math.max(1, Math.ceil((until - now) / 1000)) : 0;
  }

  public recordFailure(username: string, source: string, now = Date.now()) {
    this.increase(this.userKey(username), now);
    this.increase(this.sourceKey(source), now);
  }

  public recordSuccess(username: string) {
    // Don't reset the source-level budget; prevents credential stuffing across accounts.
    this.buckets.delete(this.userKey(username));
  }
}

export const loginAttemptLimiter = new LoginAttemptLimiter();
