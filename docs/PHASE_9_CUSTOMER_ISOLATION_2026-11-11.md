# Phase 9 — Customer-Bound Access, Chromium Acceptance and Migration Preflight

**Date:** 11 November 2026  
**Development branch:** \`fix/phase1-security-integrity-20261106\`  
**Scope:** Implemented application-level customer access increment. NOT production-certified multi-tenancy.

## Delivered source changes

1. **Internal registry:** \`CustomerAccount\` has stable server-generated \`id\`, the installation's \`tenantId\`, actual organization \`name\`, and explicit \`staffUserIds\`. Owner can create customer and grant/revoke active local staff IDs at \`GET/POST /api/customers\` and \`PATCH /api/customers/:id/access\`. Authoritative audit entries and grant changes share one JSON commit. No customer password, portal, external account or domain verification.
2. **Customer-bound records:** New project, asset, endpoint, ticket, field job, CRM, AMC and quotation writes require an authorized existing \`customerId\`. Project/CRM/AMC/quote \`clientName\` or \`customerName\` is server-derived or validated against registered identity. Forged IDs/names and self-assigned staff visibility are not trusted.
3. **Reads and mutations:** \`/api/state\`, direct lists and relevant mutation routes filter against both customer membership AND role/object permission. Projects/proposals preserve creator/collaborator checks, RMA links to actual asset ID, and field jobs/assets/endpoints/tickets enforce exact assignment. Quote direct reads and state are customer-filtered, and legacy leads are owner-only if unmapped.
4. **Revocation:** Customer membership removal immediately hides dependent records in both direct APIs and \`/api/state\`, and revokes linked project collaborator grants. It never deletes customer business records or deployed files.
5. **Frontend:** Owner's Account Security & Staff page supports real registry creation and explicit grant/revoke. New project/CRM, service asset/AMC, ticket/endpoint, field dispatch and BOM quote flows select a server-registered customer rather than relying on free-text identity.
6. **Verification:** Node20 isolated HTTP/role suites and production-build checks; separate Node22 Chromium Playwright tests with five roles, two customer fixtures and anonymous denial. New browser test exercises owner grant + project share + live revocation against an already-authenticated sales session. These tests use disposable file stores and do not contact external providers.
7. **Migration preflight:** \`scripts/customer_migration_preflight.mjs\` accepts \`--source /absolute/private/path.json\`, reads only, prints SHA256 and per-collection unmapped/orphan counts plus RMA/proposal/staff-grant checks, and exits nonzero on unsafe input. It never assigns customer IDs, copies, overwrites or writes a production store. CI tests read-only behavior and refusal on invalid fixtures.

## Access policy / compatibility

- **Owner:** All customers/legacy business records accessible within the single installation. Only owner creates customer identity and grants membership. The protected owner-only /api/state/reset remains disabled in production by default.
- **Granted staff:** Can only see customers they are granted and customer-bound records also permitted by role/record-specific assignment. Customer grant is necessary but not by itself sufficient for access to private projects or field jobs.
- **Unmapped legacy records:** The server does not infer \`customerId\` from display name, free-text \`companyName\` or serial. Missing ID is owner-only until explicitly planned migration. Existing deployed JSON remains unmodified by this work.
- **Scope exception:** Inventory SKU catalogs, suppliers, owner-only invoices/disputes, system events and some other auxiliary/legacy collections retain installation-wide or role-level behavior. They are **not** suitable for a multi-tenant deployment without separate data-model/route review.

## Verification matrix

| Gate | Evidence |
|---|---|
| Build and TypeScript | CI verifier; not a live Hostinger acceptance |
| HTTP and RBAC | Isolated production-mode Node20 suites with customer A/B negative assertions |
| Browser UI | Chromium Playwright on Node22; owner/sales/procurement/IT head/field + grant/revoke |
| Private data | Existing backup smoke + isolated migration preflight |
| Multi-tenant DB RLS | **Pending**; no PostgreSQL cluster or DB policies have been deployed |
| Customer portal, MFA, verified RMM and providers | **Pending** |
| Actual production migration/restore rehearsal | **Pending** |

## Operator-only migration preparation

1. Schedule a full maintenance window, stop all application writers and identify the actual deployed store; **do not use repository starter data** as customer data.
2. Follow [Deployment Data Safety](DEPLOYMENT_DATA_SAFETY.md) to make two private verified backups off the web root. Encrypt and protect backup material through an approved operator process.
3. Run the read-only preflight against the deployed file and preserve output and SHA256 independently. Nonzero exit means halt and investigate unmapped/orphan rows.
4. With an approved owner/customer mapping document, reconcile duplicate customer names, IDs, legacy invoices, quotes, leads, RMA and linked project/proposal rows. No guesses or name-only grants.
5. Only after implementing and testing the [PostgreSQL migration blueprint](POSTGRESQL_MIGRATION_BLUEPRINT.md), rehearse migration + rollback on an **isolated copy**. Compare complete record counts/checksums, tenant and grant invariants, and role-by-role customer isolation.
6. Sign off browser/API/security acceptance and restore drill before any production cutover. This phase did not perform any actual deployment, restore, schema migration or customer data modification.

**Current safety decision: keep PR #1 draft; main and live deployments unchanged.**

## Final isolated CI evidence — 11 November 2026

- [Push run #42902830813](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/42902830813) and [draft-PR run #42902844014](https://github.com/sahilk267/Autonomous-IT-Hardware-Services-OS/actions/runs/42902844014) both green on commit `bb01caf`.
- Node20 verification: TypeScript/build PASS; regression **16/16**, auth **7/7**, production-mode API **96/96**, role/customer API **133/133**, data safety **9/9**, customer migration read-only preflight **5/5**.
- Node22 real Chromium Playwright **7/7**: separate owner/sales/procurement/IT manager/field perspectives, anonymous access denial, owner customer grant + project collaboration, and immediate denial across an existing sales session after exact staff membership revocation.
- All fixtures are disposable local JSON files. No customer records, Hostinger instance, external credentials, real browser sessions or live provider APIs were accessed. Passing these checks is not a claim of production-ready multi-tenancy.
