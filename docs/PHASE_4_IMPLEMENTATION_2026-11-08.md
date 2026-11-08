# Phase 4 — Identity Lifecycle and Deployment Data Safety

**Date:** 8 November 2026
**Working branch:** `fix/phase1-security-integrity-20261106`
**Baseline:** `8176fb2c4506c7f93a64aa03b416bd54b23881e3`
**Pull request:** [#1 (Draft)](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/pull/1)

## Implemented (source)

### Staff identity management (local only)
- Added authenticated, owner-only `GET /api/admin/staff`, `POST /api/admin/staff` and `PATCH /api/admin/staff/:id/disable`.
- Four assignable non-owner roles: sales, procurement, enterprise IT and field engineer. Client-supplied IDs, tenant IDs, role bypass attempts and forged disable timestamps are ignored or rejected. Password hashes/salts never returned.
- Case-insensitive uniqueness checks for usernames and emails inside a single atomic store commit.
- Disabling any non-owner revokes every locally persisted session. A disabled account cannot log in. Owner self-disable and owner disable via staff API are blocked.
- `POST /api/auth/change-password` requires old password and a different 12–128-character replacement. Server rotates the scrypt salt/hash, revokes all sessions and clears its session cookie. UI immediately discards cached business state and requires reauthentication.
- Account create, disable and password rotation each emit a server-authored audit event **inside the same state commit**. Events are not cryptographically tamper-evident and cannot prove external provider revocation.
- Added account security UI accessible as a new navigation tab. Staff can update their password; only an authenticated business owner can create/list/disable other users.

### Critical deployment storage guard
- `NODE_ENV=production` now fails startup unless `APEX_DATA_FILE` is explicitly set and points **outside the application checkout**. This prevents a source deploy from silently using/overwriting the tracked `data/app-store.json`.
- Existing installs still using the default tracked JSON location require a **planned maintenance migration before applying this change**. The server does NOT automatically move or modify customer data.
- Added `scripts/backup_data.mjs` (offline operator action): requires explicit absolute source/output paths, validates Apex store structure, refuses overwrites, refuses placing backup inside checkout, applies `0600` and prints SHA256. No restore or live backup is offered.
- Added `npm run backup:data` and `npm run smoke:data` CI fixture for production startup and backup failure/success checks.
- See [deployment migration checklist](DEPLOYMENT_DATA_SAFETY.md) before enabling Phase 4 on a production host.

## Acceptance criteria

Run `npm run lint`, `npm run build`, `npm test`, `npm run smoke`, `npm run smoke:roles` and `npm run smoke:data`. All write tests must use throwaway files. Validate staff account creation, forbidden role escalation, duplicate identity conflicts, deactivation/revocation, password rotation and backup fail-closed behavior. Record real Actions run results after execution rather than anticipating success.

## Incomplete / not claimed
- **Not production-ready**: no true multi-tenancy, per-object ownership isolation, MFA, email invitation verification, SSO/M365 identity sync, account recovery flow, rate-limited login, or password change-at-first-login requirement.
- Native JSON store remains single-process, lacking a scalable transactional RDBMS, tamper-proof audit chain, encrypted at-rest backup service, remote backups and verified restore procedure.
- Live provider integrations (NIC/GST filing, supplier PO delivery, payment reconciliation, Intune/RMM and M365 provisioning) remain unverified or unimplemented.
- Hostinger migration and real browser role acceptance require authorized operator access and must not be called completed from isolated CI.

**Release gate:** Keep [Draft PR #1](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/pull/1) open; do not modify `main` or deploy a production data path until the private-store migration is complete.
