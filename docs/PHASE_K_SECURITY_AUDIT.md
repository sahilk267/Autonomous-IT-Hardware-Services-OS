# Phase K — High-Risk Security and Deployment Audit

**Audit date:** 2026-11-11  
**Scope:** Source-level review of the Apex application in `sahilk267/Autonomous-IT-Hardware-Services-OS`.  
**Release decision:** **NOT APPROVED for unrestricted public/multi-tenant production deployment.** This document separates verified source changes from live/runtime gates.

## Findings and remediation status

| ID | Severity | Evidence | Phase K change | Status |
| --- | --- | --- | --- | --- |
| K-01 | P0 | `POST /api/auth/setup` previously allowed the first HTTP caller to claim BUSINESS_OWNER. | Require a server-configured 32+ character `APEX_SETUP_TOKEN`, compare its digest in constant time, and collect it in the first-run UI only. | Code patched; runtime test pending |
| K-02 | P0 | Tracked `data/app-store.json` shipped a BUSINESS_OWNER user with no password hash/salt, so `users.length > 0` blocked initial setup. | Untrack the runtime JSON file, add ignore rules, and generate a new clean store at first launch. Existing deployed stores are not silently changed. | Repository fix; clean-clone test pending |
| K-03 | P0 | `PersistentStore` has a single global `tenant` object and shared arrays. Calling this multi-tenant is not sufficient for real isolation. | No invented fix: require a tenant-keyed database, authorization tests, data migration and a defined account/tenant model first. | **OPEN RELEASE BLOCKER** |
| K-04 | P1 | Any authenticated role could change tenant profile, reject quotes, settle invoices, dispatch purchase orders, and create financial records. | Add explicit role gates to these high-impact routes; re-read active account/role/tenant for each request. | Code patched; regression integration tests pending |
| K-05 | P1 | Login had no password-attempt throttling. | Per-IP-and-username 5-fail/15-minute in-memory throttle, 429 and Retry-After; unit tests. | Code patched; distributed limiter still needed |
| K-06 | P1 | `POST /api/events` trusted user-provided approvalStatus, enabling fabricated approval audit claims. | Reject direct client-generated audit writes with HTTP 405; use authoritative server transition events. | Code patched; broader audit immutability still open |
| K-07 | P1 | Session cookie omitted `Secure` in production; login/setup returned raw bearer tokens in JSON. | Production `Secure; HttpOnly; SameSite=Lax` cookies; remove token field from auth JSON; no fabricated auth-me identity. | Code patched; HTTPS browser validation pending |
| K-08 | P1 | Telegram webhook could process owner-approval callbacks with no owner/chat allowlists configured. | Require both owner and chat IDs plus webhook secret; digest comparison. | Code patched; live Telegram callback validation pending |
| K-09 | P1 | Public health response included invoice, quote and other business record counts. | Public health now returns readiness rather than business-volume data. | Code patched |
| K-10 | P1 | Persistent JSON sessions, mutable single-process store, missing database/transaction guarantees, and unproven backup/restore. | Documented as unresolved; recommend durable relational multi-tenant store with migrations, backups, retention and recovery drills. | **OPEN** |
| K-11 | P1 | All state-changing JSON endpoints rely on browser cookie and there is no comprehensive CSRF verification. | Require origin/CSRF strategy across mutating routes and proxy topology before public production. | **OPEN** |

## Required first-run deployment procedure

1. On the deployment host, ensure the application has a **private writable** runtime data directory. `data/app-store.json` must **not** be copied from a Git checkout, baked into an image, or synchronized across hosts.
2. Generate a unique random setup token on the server, for example `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
3. Set `APEX_SETUP_TOKEN` in the server's protected environment; never in `VITE_*`, frontend code, logs, URLs or Git.
4. Expose the application only behind HTTPS. Set `NODE_ENV=production` and a correct `PORT`. In the first-run UI enter the one-time setup token, a unique admin login and a password of at least 12 characters.
5. Verify `/api/auth/me`, logout, fresh browser login, non-owner restrictions, and that an unauthenticated or incorrect-token `/api/auth/setup` request is rejected.
6. After enrollment, remove `APEX_SETUP_TOKEN` from the running deployment environment and restart; the populated users table continues blocking bootstrap. Retain a protected recovery procedure.
7. If migrating a previously deployed `data/app-store.json`, **back it up offline first**. A legacy passwordless administrator record can block bootstrap: do not delete or overwrite production data to repair it automatically. Plan an audited account-recovery migration separately.

**Important:** Removing the tracked data file in this branch does not remove it from the Git history. Review the old file for any real personal data and follow repository-history remediation and credential rotation policies if necessary.

## Run the verification gates

```bash
npm install
npm run lint
npm test
npm run build
```

These commands are **required**, not claimed as executed by this audit. The new test suite covers token checks, login throttle and cookie attributes; it does **not** replace full HTTP integration, Windows deployment, TLS reverse-proxy, external provider, database concurrency or multi-tenant isolation tests.

Before accepting a Windows or Hostinger release, run a clean install, startup, setup, restart/login, role-denial, Telegram webhook-denial, cookie-over-HTTPS, persistence/backup, and failure-recovery E2E checklist. Verify secrets are absent from built frontend assets and Git history. A CI green status alone is not a production security sign-off.

## Next recommended priority

**Phase L:** Complete tenant and data-access architecture before claiming enterprise multi-tenant readiness. Follow with comprehensive role/CSRF enforcement, database migration, durable/distributed rate limiting, transactional audit append-only storage, backup/restore, dependency pinning/CI, and live Windows + Hostinger acceptance.
