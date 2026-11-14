# Phase 10.5K — release readiness hardening

Status: PARTIAL / NONPRODUCTION / NOT DEPLOYMENT-AUTHORIZED.

## Added on review branch
- `server/release-readiness-gate.ts`: defensive, pure evaluator for untrusted/malformed payloads.
- `tests/release-readiness-gate.test.ts`: negative cases for missing approval, invalid status, digest mismatch, self-approval, and failed checks.
- Existing `server/release-governance.ts` remains present and should be deprecated or replaced after review.

## Known limitations
- No trusted evidence provenance, custody, signature validation, or immutable storage.
- No human identity verification or operator authorization; caller-supplied IDs cannot be trusted.
- No API integration or production deployment gate.
- Tests are not yet wired into `npm test` (package.json still runs only zero_mock_data.test.ts).
- No CI/build/test execution verified.
- No PostgreSQL migration or outbox implementation verified on main.

## Acceptance criteria
1. Wire strict evaluator to trusted, authenticated evidence retrieval only.
2. Bind signatures and approval to immutable release ID, artifact digest, tenant, and expiration.
3. Enforce separate reviewer/operator identity from trusted authentication.
4. Add replay, cross-tenant, stale approval, and concurrent release tests.
5. Run both suites in CI and require review before merge.
6. Production cutover remains separately gated and explicitly disabled until independently authorized.
