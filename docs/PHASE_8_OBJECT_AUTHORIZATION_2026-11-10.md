# Phase 8 — Internal Object Authorization

**Date:** 10 November 2026  
**Branch:** `fix/phase1-security-integrity-20261106`  
**Status:** Implementation candidate; full CI acceptance pending.

## Internal staff authorization
- Field engineers can access only explicitly assigned asset and endpoint records through both direct list APIs and /api/state. RMA permission derives strictly from linked asset ID; display names do not grant access.
- Owner/IT head may assign/unassign active local FIELD_ENGINEER identities through the new dedicated endpoint and asset assignment APIs. Assignment plus internal audit are committed together.
- Project creator user IDs are assigned by server; new project records start with no collaborators. Owner grants/revokes other local staff via /api/projects/:id/access; grants are never client-authored through project create/edit.
- Direct project/proposal reads and /api/state use the same scope; proposal submission requires project visibility, award requires owner or creator IT-head authority. Submitted bid records save authenticated local submitter ID.
- Legacy rows without trusted creator/assignee IDs are not inferred from names; owner can explicitly assign/share them. Internal procurement lead intentionally retains warehouse asset read access.
- Frontend has manager service-assignment selectors and owner project access controls. RMM remote-shell preview explicitly states it is disconnected.

## Remaining
This is **not** customer/tenant row-level isolation, external SSO, consent validation, live RMM telemetry or remote command execution. Actual browser E2E tests, database migration, Hostinger production checks and provider integrations remain pending. Run only disposable CI test stores; never overwrite production data.
