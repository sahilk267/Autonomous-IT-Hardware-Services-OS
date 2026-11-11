# Phase M — Windows Desktop & Hosted Deployment Acceptance

**Status (2026-11-12):** Stage M automated PostgreSQL migration/restore and Windows x64 installer packaging have both **PASSED GitHub Actions**. This is a candidate implementation on a draft PR, **not production approval**. Still requires interactive Windows install/upgrade/uninstall, real-user data restore, code signing and live Hostinger staging acceptance.

## 1. Windows desktop installer and setup wizard

The application now has an Electron desktop main process, a Node/Express loopback backend and an NSIS x64 installer build.

**Build on Windows / via Windows CI**
```powershell
npm install
npm run lint
npm run package:windows
# Artifact: release/windows/Apex-IT-OS-Desktop-0.1.0-Setup-x64.exe
```

The Windows GitHub Actions workflow uploads the **unsigned preview** installer as a workflow artifact if the build succeeds. **Do not distribute it as an official signed release** until a trusted Windows code-signing certificate, installer checksums, malware scanning, SmartScreen reputation, and actual interactive install/uninstall testing are complete. This project has no auto-updater.

**First run**
1. Launch the installed app under the intended Windows account. The offline configuration wizard opens before the API server starts.
2. Choose **Local JSON** (single-workstation) or **PostgreSQL** (existing operator-provisioned and migrated DB). Local mode uses a private Windows user-data directory; PostgreSQL mode requires the limited runtime connection URL. Never paste migration-owner credentials.
3. For PostgreSQL select **Fixed** (enter tenant UUID once) or **Dynamic** (enter UUID when signing in and switch by signing in again). A UUID alone cannot authenticate.
4. Optionally configure Gemini, Telegram, Razorpay, GST or Microsoft 365 integration credentials. You may leave optional services blank and add keys later.
5. Save. Settings including tokens and database URL are encrypted with Windows DPAPI via Electron `safeStorage`, in `settings.dpapi` within the current user's application-data directory. The app creates a random 32-byte setup secret.
6. When the app opens, enroll the Business Owner with a 12+ character password. On trusted local loopback, the desktop process supplies the bootstrap token only when the server confirms setup is still required.
7. Later, click **Desktop server settings** to change integrations/database connection. Changes restart the private backend; errors attempt recovery of the previous working configuration. **Changing the local JSON data folder in place is blocked** to prevent silent data loss.

**Security boundaries and limitations:** The app binds to `127.0.0.1`, never to a public interface; browser renderer has no Node.js integration and IPC permissions are validated in the main process. HTTPS is still required for every hosted deployment. Desktop loopback HTTP is a narrowly scoped exception. The DPAPI setting file is protected for the signed-in Windows user, but business JSON data is **not encrypted at rest by this feature**: enable Windows BitLocker/EFS and a private user ACL for the data directory. Windows-level administrator accounts can access the file. A Windows computer can be offline when using local JSON; AI/payment/cloud features require connectivity. Windows installer and app require an actual Windows acceptance test.

**User profiles, restoring and updating:** Preserve protected `settings.dpapi` and the private data directory in a user-bound encrypted backup. DPAPI blobs generally do not decrypt under another Windows account/machine; plan a managed recovery path for integration credentials. Do not mix two writers with the same JSON file. Install updates from a trusted signed source only after backing up and testing the same-profile data directory.

## 2. Dynamic PostgreSQL workspace selection

Enable only after migrations **001–003**, grants, backup and `verify-critical`:
```dotenv
NODE_ENV=production
APP_URL=https://your-deployment.example
APEX_STORAGE_MODE=postgres
APEX_TENANT_MODE=dynamic
DATABASE_URL=postgresql://limited-runtime-role:...@trusted-postgresql-host:5432/apex
# APEX_TENANT_ID MUST be unset in dynamic mode.
APEX_SETUP_TOKEN=<fresh-long-random-secret>
```

Each organization is provisioned by the database owner with:
```bash
node scripts/postgres-admin.mjs provision example-org "Example Organization"
node scripts/postgres-admin.mjs grant-runtime apex_runtime
```
**Tenant-specific first-time enrollment token:** Never give administrators the shared deployment-root `APEX_SETUP_TOKEN`. After provisioning a new tenant, derive its unique one-time setup authorization token in a private operator shell using the **same root secret** configured in the server:
```bash
# Never commit the root to Git or send it to another tenant's administrator.
APEX_SETUP_TOKEN=<server-root-secret> node scripts/workspace-setup-token.mjs <tenant-uuid>
```
Give only that 64-character derived token to the new workspace administrator. The server refuses a token derived for any *different* tenant. Windows desktop generates the selected workspace's derived token automatically when setup is still required. Rotate the root after all intended first-run tenant enrollments and coordinate pending provisioning. This is **not** a self-service public signup system.

The provisioned UUID goes in the login UI. Users select a workspace and authenticate with **that workspace's own username and password**; the server issues a high-entropy session token including an untrusted tenant UUID *routing hint*. Every protected request hashes the full token, verifies the matching member/session in PostgreSQL under RLS, and checks active role/account membership. Substituting UUID prefixes, guessing UUIDs or sending tenant IDs in JSON cannot authorize data access.

**Scope:** Multiple provisioned organizations now share one Node process and PostgreSQL cluster with tenant-isolated API sessions. Switching clears frontend data and revokes the previous session, then requires fresh login. This is **not** automatic cross-workspace SSO, a workspace directory, self-service company signup, shared memberships, or background worker multi-tenant scheduling. Existing fixed-mode sessions (legacy 64-char tokens) require **reauthentication** when migrating to dynamic mode. Shared Telegram webhook callbacks are disabled in dynamic mode until per-tenant webhook URL+secret binding is designed. Never pass client-provided tenant headers directly to SQL.

## 3. Real PostgreSQL backup, restore, and rollback rehearsal

CI acceptance uses a disposable PostgreSQL 16 service, never production. `scripts/phase-m-restore-rehearsal.mjs` seeds a legacy JSON snapshot and validates a real import, normalized critical-ledger backfill, invalid financial transaction rollback, and source fingerprints. The CI job then uses the *actual* PostgreSQL tools `pg_dump -Fc`, `createdb`, and `pg_restore --no-owner --exit-on-error` into a **separate** database. Finally it checks records, membership/session hashes, audit rows, critical finance/inventory counts, settlement/stock reconciliation and real RLS using a non-BYPASSRLS role with no tenant context, correct context and a foreign tenant.

To rehearse on a *copy* of your own PostgreSQL installation, arrange a maintenance window and use private, encrypted backup storage. Do not copy actual production credentials/data to GitHub Actions. Validate the exact postgres client versions and run:
```bash
# Operator example only; supply your own private DB name + offsite encrypted storage.
pg_dump -Fc --no-owner -d "$SOURCE_DATABASE_URL" -f /secure-backup/apex.dump
createdb -h <dbhost> -U <operator> apex_restore_rehearsal
pg_restore --no-owner --exit-on-error -d "$RESTORE_DATABASE_URL" /secure-backup/apex.dump
# Compare source/restore counts and tenant audit, and run:
node scripts/postgres-admin.mjs verify-critical <tenant-uuid>
```
Never restore over the live database. A CI pass does **not** certify your real RPO/RTO, encrypted backup retention, offsite storage, staff recovery permissions or version-specific upgrade behavior. Once writes happen after cutover, do **not** roll back to stale JSON without a reconciled reverse migration.

## 4. Hostinger full-stack acceptance

Hostinger's managed **Business Web Hosting and Cloud** Node.js web-app plans support Express/Vite and env-var management. For PostgreSQL, use an *external* managed PostgreSQL provider (e.g. Supabase); Hostinger's managed hosting databases themselves are MySQL, not local PostgreSQL. VPS may support PostgreSQL under your own administration.

**Recommended staging route**
1. Merge security stages in order, then select a temporary staging domain on a compatible Hostinger Node.js plan. For managed hosting use Hostinger's **Node.js App / GitHub deployment** flow, Node.js **22.x**, build `npm run build`, startup `npm start` (or entry `server.js` if Hostinger requires it), and point the staging branch explicitly. Set `ELECTRON_SKIP_BINARY_DOWNLOAD=1` during the server-only npm install/build to avoid downloading unused desktop binaries.
2. Configure server-side environment variables through hPanel, **not** through `VITE_*` or Git. At minimum set `NODE_ENV=production`, exact HTTPS `APP_URL`, `APEX_STORAGE_MODE=postgres`, `APEX_TENANT_MODE=fixed|dynamic`, `DATABASE_URL` for the non-owner runtime role, `APEX_TENANT_ID` only for fixed, and `APEX_SETUP_TOKEN` for uninitialized tenants. Keep migration credentials off the live app. No internal Hostinger shared-hosting PostgreSQL is assumed.
3. Apply schema changes and required backfill from a controlled operator environment before starting app traffic. Ensure outbound TLS connectivity to the external database, persistent secrets and proxy-to-Node routing.
4. Once staging is deployed, run read-only external acceptance from your machine:
   ```bash
   node scripts/hostinger-acceptance.mjs https://staging.yourdomain.example
   ```
   This checks certificate expiry, HTTPS security headers/HSTS, no public API cache, database health, static frontend, unauthenticated read denial and cross-origin login rejection. **No user credentials are sent.**
5. Complete **authenticated private manual checks** in staging: owner enrollment, payment/financial workflows, role permissions, tenant switching, real integrations, database connectivity, process restart, and backup/restore comparison. These tests are intentionally not performed by the public acceptance script.

**Hostinger evidence:** The app has not been deployed to a Hostinger account in this phase and no customer domain URL was provided; therefore **live Hostinger acceptance remains unverified** even if the probe's unit tests pass.

References: https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/ and https://www.hostinger.com/support/connecting-a-hostinger-mysql-database-to-a-node-js-application/

## 5. Release gates and known exclusions

| Gate | Status |
| --- | --- |
| Dynamic tenant session isolation and two-tenant HTTP E2E | **PASS** — PostgreSQL 16 CI on Phase M commit `e0756cb` |
| Real pg_dump → pg_restore of disposable migrated tenant + RLS/finance reconciliation | **PASS** — real disposable database backup/restore and fingerprints on commit `e0756cb` |
| Windows x64 NSIS executable built and uploaded | **PASS** — unsigned preview x64 NSIS installer built and uploaded on commit `e0756cb` |
| Local Windows wizard validation / encrypted configuration | **PASS** pure desktop config tests on Windows CI; interactive application/DPAPI smoke test **NOT RUN** |
| Signed installer, update security, SmartScreen and uninstall/data retention | **Not complete** |
| Live Hostinger deployment + external acceptance on an actual domain | **Not executed** |
| Real encrypted production PostgreSQL backup and restore/rollback drill | **Not executed** |
| Dynamic workspace SSO, membership discovery, invite flow and per-tenant workers/Telegram webhooks | **Not implemented** |

**Production is not approved until all applicable gates have real environment evidence.**


## Phase M automated evidence (2026-11-12)

- [PostgreSQL 16 CI / dynamic workspace + actual pg_dump/pg_restore PASS](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/43111633601): all lint/unit/build, Stage K/L 1–3, dynamic in-process tenant HTTP tests, real migration import/backfill, negative mutation rollback, custom-format backup and separate-DB restore + reconciliation PASS.
- [Windows x64 NSIS packaging PASS](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/43111633699): Windows Node 22, lint, setup validation, packaged installer file existence, artifact upload PASS. Installer artifact name: `apex-it-os-windows-x64-unsigned-preview` (~130 MB ZIP), GitHub Actions artifact ID `13895244980`, available through the run's **Artifacts** panel until approximately 2026-11-25. GitHub artifact archive digest `sha256:dbd8cccaec919765af31baf2f352f9164f19179c386d4844e14d0a5fc0539909` (this is the artifact ZIP hash, not necessarily the EXE hash).
- **Neither workflow executes an interactive Electron GUI launch**, a physical Windows install/uninstall, signed binary verification or Hostinger customer-domain deployment. Do not infer those outcomes from packaging success.
