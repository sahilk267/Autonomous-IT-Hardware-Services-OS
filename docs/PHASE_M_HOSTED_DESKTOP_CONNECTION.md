# Phase M follow-up — Desktop ↔ Hosted Server Connectivity

**Release state: draft PR.** Windows installer builds do NOT require a final domain, PostgreSQL connection string, tenant UUID, API keys or hosting provider decision. **No real hosted server is deployed or verified here.** Only automated tests and installer packaging can be verified without a live environment.

## 1. Correct topology

```text
Windows installer (.exe) — same binary for every deployment
  │
  ├── Hosted Server (default / recommended for employees)
  │   • First run may be left UNCONFIGURED.
  │   • Later enter https://app.yourcompany.com
  │   • HTTPS GET /api/desktop/handshake — identify Apex and protocol 1
  │   • HTTPS GET /api/health             — live DB ready
  │   • HTTPS GET /api/auth/status        — real auth service
  │   • Open remote React UI from that SAME HTTPS origin in sandboxed Chromium.
  │   • Login directly to hosted Express /api/auth/login (Secure, HttpOnly cookie).
  │   • Subsequent /api/* calls are same-origin HTTPS; PostgreSQL/keys stay SERVER-SIDE.
  │   • Native Server menu: change URL, retry, clear saved login.
  │
  └── Local Server (advanced / offline workstations only)
      • Local JSON (single writer) or operator-provisioned PostgreSQL.
      • Private Express process binds 127.0.0.1 on a selected port.
      • Windows DPAPI holds local backend settings + optional integration secrets.
      • NO automatic transfer of local records to the hosted server.
```

The hosted desktop window has **no Electron preload bridge**, no Node integration, sandboxed renderer, denied browser permissions and popups, and blocked cross-origin / non-HTTPS top-level navigation and redirects. Each chosen HTTPS origin gets its **own Electron session partition**; switching servers clears prior origin's local cookies and site storage. The setup UI itself is a separate trusted local file window and is opened from the native **Server** menu. Node's TLS validation is not bypassed and 3 preflight API requests send **no login cookies, setup token, API key or database credentials**.

### What installer knows versus what deployment decides

| At installer build | At first launch or after server deployment | Hosted server only |
| --- | --- | --- |
| Electron shell, frontend connectivity checks, protocol v1, offline setup UI | Verified HTTPS server origin, optional workspace UUID and user login | PostgreSQL DSN, migration credentials, application/setup secrets, Gemini/Telegram/Razorpay/GST/M365 credentials, tenancy configuration |
| None of your future domain or database details | Can remain empty until deployment | Accounts, billing, finance, inventory, audit and integrations |

**No URL?** Choose **Connect to hosted server** (default) and leave URL blank. Select **Save server details for later**. The app keeps the encrypted configuration and shows the setup wizard again on next launch. It will **not** secretly fall back to local data or connect to an unknown host. When hosting is ready, use **Server → Configure / Change Server**, enter the full public HTTPS origin and choose **Verify HTTPS & connect**. If the server is temporarily unavailable, you may save the syntactically valid HTTPS origin for later verification by checking the defer option.

**Changed domain / provider?** Reopen the native menu, enter the new domain, acknowledge that sessions/data are NOT migrated, and verify. If verification fails, the previous working origin stays saved. Staff sign in separately on the new server. Different origins have isolated browser storage; the host still needs to revoke sessions server-side when appropriate.

## 2. Hosted API contract and transport

New public **read-only** `GET /api/desktop/handshake` returns minimal nonsecret JSON:

```json
{
  "product": "apex-it-os",
  "desktopProtocol": { "min": 1, "max": 1 },
  "deploymentMode": "hosted",
  "storageMode": "postgres",
  "tenantMode": "dynamic"
}
```

The client refuses wrong product, `desktop-local` backends, unsupported protocol, HTTP/nonpublic origins, invalid certificates, redirects, missing/wrong content-type, unready database and malformed authentication. The response **never includes** database passwords, access tokens or user information. Hosted React UI runs from the same server URL; there is no cross-origin CORS requirement, external database socket, desktop-side Google API key or hardcoded Hostinger URL.

The server health and auth status checks are prerequisites for *connecting*, not proof that signed-in users have the correct roles or that real integrations work. In dynamic PostgreSQL mode each user must also provide a provisioned workspace UUID and credentials. The server enforces hashed sessions, role/membership and FORCE RLS; merely knowing a workspace UUID does not grant access.

Hosted server frontend updates normally ship with the server. If future server versions change the desktop protocol beyond the supported range, the app refuses connection until a compatible desktop version is installed. There is **no automatic installer updater** in this phase.

## 3. Deploy the server later (operator actions, never the employee's desktop)

1. Decide provider/domain **after** installer is distributed. Hostinger managed Node.js requires a compatible plan and an **external managed PostgreSQL** service for SQL mode. VPS can run its own PostgreSQL under proper administration. The server must terminate public HTTPS at a trusted reverse proxy.
2. Review/merge prerequisite PRs (K #2 → L Stage 1 #3 → L Stage 2 #4 → L Stage 3 #5 → M #6 → this follow-up). Do not deploy unreviewed draft branches to production.
3. Configure on **server only**:
   ```dotenv
   NODE_ENV=production
   APP_URL=https://app.yourcompany.com
   APEX_STORAGE_MODE=postgres
   APEX_TENANT_MODE=dynamic
   DATABASE_URL=postgresql://limited-runtime-user:...@your-pg-provider:5432/apex?sslmode=verify-full
   # APEX_TENANT_ID must be blank for dynamic mode.
   APEX_SETUP_TOKEN=<a-private-random-root-at-least-32-characters>
   ```
   For fixed mode, provide `APEX_TENANT_MODE=fixed` and the provisioned `APEX_TENANT_ID`.
4. Validate environment **without printing secret values**:
   ```bash
   npm run check:hosting
   ```
   This catches missing HTTPS origin, conflicting fixed/dynamic tenant settings, disabled PostgreSQL TLS, accidental VITE_* secrets and migration-owner credentials in web runtime. A passing check does **not** test database credentials or Hostinger plan availability.
5. Apply PostgreSQL migrations and any reviewed legacy data backfill/verification from the private operator environment; run `npm run build`, then start `npm start` (or Hostinger's supported Node entrypoint). Configure public reverse-proxy/SSL and firewall rules, not public database credentials.
6. Open `https://app.yourcompany.com/api/desktop/handshake`. It must return `product=apex-it-os`, protocol range including 1 and `deploymentMode=hosted`.
7. Run read-only acceptance from your operator PC:
   ```bash
   node scripts/hostinger-acceptance.mjs https://app.yourcompany.com
   ```
   This also tests server response headers, TLS expiry, health, unauthenticated data denial, CSRF and frontend delivery. Then do private login/tenant/financial tests and backup/restore rehearsal on a separate database.
8. On any Windows desktop, open Server → Configure / Change Server and enter the origin. No installer rebuild needed.

## 4. Tests, limitations and explicit release blockers

Automated tests: Hosted config can be empty before deployment; remote mode scrubs any local PostgreSQL and integration secrets; strict URL validation, in-process no-cookie compatibility probe and negative tests; host health/auth mismatch; migration/environment validator; real Node PostgreSQL integration tests assert actual Express handshake never includes setup token or DB password; Windows installer workflow runs desktop tests, packaging and artifact upload.

**Still unverified without your infrastructure:** actual Hostinger TLS domain and plan, operator PostgreSQL connection and migration, end-user remote login in a physically installed Windows .exe, real signed installer / SmartScreen, enterprise proxy and certificate policy, real disaster recovery metrics, actual external gateway accounts. Those cannot be truthfully declared PASS before deployment.

**Important:** The remote desktop is a secure wrapper for an authenticated website. It does NOT copy hosted data into a local offline cache, sync local JSON into PostgreSQL, access SQL directly, auto-discover domains via an unsafe network scan, or infer your hosting configuration. Such behaviors would need separate explicitly designed migrations/sync and operator approval.

## 5. Safety notes

- Treat the chosen remote HTTPS domain as your company's trusted application identity. The desktop can validate TLS and the Apex protocol, but it cannot independently determine the legitimate business owner of an arbitrary valid domain.
- **Never** paste PostgreSQL connection strings or Gemini/payment keys into hosted-mode desktop setup. They belong in the private server environment.
- When switching hosted domains, browser storage for the old origin is cleared but preexisting server-side sessions may stay valid until explicit logout or expiry; server administrators should revoke old sessions when migrating.
- In a local-to-hosted change, keep a backup of your local JSON/SQL data. Switching the UI **does not move any records**.
- Public OAuth redirect flows or third-party site windows may need a reviewed allowlist and separate external browser; this desktop currently denies new windows/cross-origin navigation by default.
