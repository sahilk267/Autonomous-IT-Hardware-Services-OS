# Phase M — Release Gates, Signed Windows Build and Recovery Playbook

**2026-11-12. Status: review-only.** Phase M source/Windows *preview* CI is not a production release. This playbook describes which checks can run automatically today and which require real hosting infrastructure, a code-signing identity and an authorized production operator.

## Deployment choices (installer is reusable)

**Recommended: employee desktop → hosted HTTPS server → private PostgreSQL.** The installer knows no final domain/database/provider. On first start select **Hosted**, leave URL blank and save for later. After deploying the backend, enter `https://app.company.example` using **Server → Configure / Change Server**. The app verifies TLS, Apex protocol, database health and authentication before opening a sandboxed same-origin browser window. Direct DB credentials, migration secret and integration keys stay only on the hosted server. A saved URL marked *pending* does **not** auto-connect after app restart.

**Alternative:** advanced single-workstation local JSON/PG mode. Switching modes changes the connected environment, NOT the data. Back up/migrate separately. Hosted session partitions are segregated by origin; old hosted storage is cleared after closing the old renderer.

## 1. Automated unsigned Windows installer validation

PR workflow: `.github/workflows/phase-m-windows-installer.yml`.

On an **ephemeral Windows runner** it installs all packages, lints, tests desktop URL/settings and syntax, produces an NSIS x64 EXE, checks the preview isn't accidentally Authenticode-signed, generates `SHA256SUMS.txt`, then runs `scripts/windows-installer-smoke.ps1`:

1. Silent NSIS install (per-user; no administrator rights in the app).
2. Verify installed `app.asar` and React static assets.
3. Launch the **installed** Electron GUI without any hosted URL configured.
4. Confirm the offline **Desktop Configuration** wizard creates a visible Windows window.
5. Shut down the test process, silent uninstall, confirm executable removed.

This is a **real GUI launch** but NOT a replacement for manual user acceptance, signed SmartScreen checks, corporate proxies, DPAPI key recovery or upgrade tests against existing customer data. A packaging-only PASS without the smoke step PASS is not sufficient.

The preview artifact includes the installer + SHA-256 hash text. Compare the downloaded EXE with the hash in the same artifact before testing; don't mistake the hash of the uploaded ZIP for the EXE hash.

## 2. Authenticode-signed release (blocked until credentials exist)

Workflow: `.github/workflows/phase-m-windows-signed-release.yml`.

This workflow is **manual dispatch, `main` only**, bound to a protected GitHub Environment **`windows-release-signing`**. In repository settings, require deployment reviewers and disallow unprotected branches for this environment. Provision three *environment-scoped encrypted secrets*:

- `WIN_CSC_LINK`: base64-encoded authorized Windows `.pfx` / `.p12` certificate, or secure certificate location supported by electron-builder. Never put it in Git, Project files or user support chats.
- `WIN_CSC_KEY_PASSWORD`: certificate secret, only in the protected environment.
- `APEX_WINDOWS_SIGNER_SUBJECT`: expected genuine Authenticode signer subject substring, used for **independent** identity checks.

The workflow forces `electron-builder --config.forceCodeSigning=true`, verifies **both the app executable and NSIS installer** have Authenticode Status `Valid`, checks the expected publisher and certificate expiry, installs/launches/uninstalls the resulting signed EXE, and uploads the signed candidate plus `SHA256SUMS.txt`.

**If the certificate is missing, invalid or expired, the job MUST fail**, not publish an unsigned binary under a trusted release name. Build on a reviewed protected commit. Set signing-identity secrets only in the protected environment, not on PR workflows. Do not use self-signed certificates to bypass public SmartScreen trust. Authenticode alone does not guarantee immediate SmartScreen reputation.

**Not implemented:** auto-update distribution, trusted offline code-signing service/HSM for non-exportable certificates, automatic Windows release publication. Require an explicit new signed candidate release process if you add any of these later.

## 3. Hosted server production staging acceptance

Deploy from a reviewed commit with `NODE_ENV=production`, exact HTTPS `APP_URL`, fixed or dynamic PostgreSQL tenant scope, nonowner runtime `DATABASE_URL`, and secret `APEX_SETUP_TOKEN`. Never put `APEX_MIGRATION_DATABASE_URL` into web-app process env or `VITE_*` variables.

Run **before** opening public traffic:

```bash
npm run check:hosting
# Independently from a machine outside the hosting provider, AFTER HTTPS is ready:
node scripts/hostinger-acceptance.mjs https://staging.company.example
```

The public read-only probe verifies TLS certificate validity, Apex protocol handshake, health/DB status, HSTS/no-cache/security headers, no anonymous access to business data, cross-origin login rejection, and frontend delivery. It never sends credentials. The `phase-m-hostinger-acceptance.yml` workflow has a manual URL input and can collect evidence.

After public probes PASS, an authorized staging operator must also verify **real credentials and roles**, suspended tenants, invoice/stock histories, integration credentials, server restart, rate limits, backups and the Windows app's connection through the intended corporate proxy.

No deployment URL, plan or connected Hostinger account was provided in this coding turn: **live Hostinger acceptance is NOT RUN**.

## 4. PostgreSQL private source → disposable restore drill

For an operator with approved full-audit access to all tenants, install `pg_dump` and `pg_restore` matching the PostgreSQL server version. This tool is **read-only on the source**. It requires a separately created, absolutely **EMPTY**, **DISPOSABLE** destination whose database name begins `apex_restore_`. It NEVER creates/drops a database, runs `--clean`, or restores to the source database name.

```bash
# Create private ENCRYPTED scratch storage manually (sample Unix ACL):
mkdir -m 700 /encrypted/recovery-work
# Operators set these only in a private local shell or secret manager:
export APEX_RESTORE_SOURCE_URL='postgresql://auditor:...@source.example/apex?sslmode=verify-full'
export APEX_RESTORE_TARGET_URL='postgresql://operator:...@restore.example/apex_restore_rehearsal01?sslmode=verify-full'
export APEX_RESTORE_ENCRYPTED_DIR=/encrypted/recovery-work
export APEX_RESTORE_DRILL_ACK=I_HAVE_VERIFIED_THE_TARGET_IS_EMPTY_AND_DISPOSABLE
npm run rehearse:restore
```

The script preflights URL/TLS, two different database names, exact target prefix, human acknowledgement, private scratch and an empty database; requires a privileged offline role with complete BYPASSRLS visibility so *all* tenants can be compared. It writes a custom-format archive under that scratch directory (not under GitHub runner outputs), restores atomically to the empty target using `--single-transaction`, then checks hashes and row counts for membership, sessions, audit, schema migrations, products, finance, settlement and stock movements, plus `verifyCriticalLedger` for every tenant. Failure does not modify the source; temporary dump is removed on exit.

**Caveats:** The operator must have a genuinely encrypted scratch volume; the script can enforce private filesystem path/ACL on Unix but cannot prove full-disk encryption. PostgreSQL runtime roles/policies must already be available in the restore environment for policy recreation; use a controlled staging cluster. This tool limits each table to 100,000 rows for safe bounded verification and must be replaced by a streaming verifier for larger datasets. No production database was accessed automatically in this task.

**Rollback approval:** Compare tested restore duration (RTO) against business requirement and restore point/recovery lag (RPO); additionally rehearse DNS/service cutback, session revocation, payment ledger reconciliation and key rotation. Never assume PostgreSQL → legacy JSON rollback is lossless after new writes.

## 5. Explicit release decision

| Gate | What proves it |
|---|---|
| Source unit/security tests | Green Phase K/L/M CI on exact candidate SHA |
| Windows installer packaged + launched + removed | Windows preview/signed smoke steps on exact candidate SHA |
| Certificate signed for legitimate publisher | Protected manual signing workflow: installer + app Authenticode `Valid` |
| Website TLS, authenticated backend, public isolation | Actual staging URL + public acceptance job PASS |
| Corporate Windows app & login | Physical Windows workstation in intended network, signed installer; login/switch/logout/offline tests |
| Production data recovery | Encrypted source backup + scratch restore with real operator/audit role and RTO/RPO evidence |
| Security review / PR merges | Review PRs Phase K #2 → L Stage 1 #3 → L Stage 2 #4 → L Stage 3 #5 → M #6 → hosted #7 → release gates #8 |

**Not production approved until every applicable gate is backed by evidence.**

### Remaining product capability gaps (not claimed fixed)

Cross-workspace SSO, multi-tenant Telegram webhook/background worker routing, distributed throttle store, signed auto-updates, payment-provider settlement reconciliation, a real backup scheduler/retention policy, enterprise SSO/OAuth browser redirects, and direct account-level Hostinger deployment management remain independent future workstreams; none can be safely inferred from an unsigned installer build.
