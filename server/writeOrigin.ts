import type { Request, Response, NextFunction } from 'express';

/**
 * Browser write requests must carry an Origin matching the deployment's
 * explicit public origin. Never trust Host or X-Forwarded-* as an allowlist.
 */
export function allowedOrigins(configured: string, production: boolean, desktopLoopback = false): ReadonlySet<string> {
  const entries = configured.split(',').map(value => value.trim()).filter(Boolean);
  if (!entries.length) throw new Error('APP_URL is required for write-origin validation');
  const origins = new Set<string>();
  for (const entry of entries) {
    let url: URL;
    try {
      url = new URL(entry);
    } catch {
      throw new Error('APP_URL / APEX_ALLOWED_ORIGINS contains an invalid URL');
    }
    if (!['http:', 'https:'].includes(url.protocol) ||
        url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('Write origins must be absolute HTTP(S) origins without paths or credentials');
    }
    const approvedLocal = desktopLoopback && url.protocol === 'http:' &&
      ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    if (production && url.protocol !== 'https:' && !approvedLocal) {
      throw new Error('Production write origins must use HTTPS (except packaged desktop loopback)');
    }
    if (desktopLoopback && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
      throw new Error('Packaged desktop must use a loopback-only origin');
    }
    origins.add(url.origin);
  }
  return origins;
}

export function isUnsafeMethod(method: string): boolean {
  return !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
}

export function isOriginAllowed(origin: string | undefined, permitted: ReadonlySet<string>): boolean {
  if (!origin || origin === 'null') return false;
  try {
    const parsed = new URL(origin);
    // Origin header is an origin, not a complete arbitrary URL.
    if (parsed.origin !== origin || parsed.pathname !== '/' || parsed.search || parsed.hash) return false;
    return permitted.has(parsed.origin);
  } catch {
    return false;
  }
}

export function writeOriginGuard(permitted: ReadonlySet<string>) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!isUnsafeMethod(req.method) || req.path === '/api/telegram/webhook') return next();

    // Machine clients use Authorization: Bearer, not browser cookies; cookies
    // always take precedence, preventing CSRF bypass with a dummy header.
    const hasCookie = typeof req.headers.cookie === 'string' &&
      /(?:^|;)\s*apex_session=/.test(req.headers.cookie);
    const bearerOnly = !hasCookie && /^Bearer\s+\S+$/i.test(req.headers.authorization || '');
    const isLogin = req.path === '/api/auth/login' || req.path === '/api/auth/setup';
    if (!isLogin && bearerOnly) return next();

    const rawOrigin = req.get('origin') || undefined;
    if (!isOriginAllowed(rawOrigin, permitted)) {
      return res.status(403).json({ success: false, error: 'Forbidden: Invalid or missing request origin' });
    }
    next();
  };
}
