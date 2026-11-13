#!/usr/bin/env node
// Read-only customer ownership preflight; DOES NOT migrate, assign, overwrite or copy customer data.
import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--source' || !isAbsolute(args[1])) {
  console.error('Usage: node scripts/customer_migration_preflight.mjs --source /absolute/private/read-only/app-store.json');
  process.exit(2);
}
const source = resolve(args[1]);
let data, raw;
try {
  raw = readFileSync(source);
  data = JSON.parse(raw.toString('utf8'));
} catch (error) {
  console.error('Cannot read or parse source. No data was changed.');
  process.exit(2);
}
if (!data || typeof data !== 'object' || Array.isArray(data) ||
    typeof data.tenant?.id !== 'string') {
  console.error('Invalid JSON store schema; no data was changed.');
  process.exit(2);
}
const sha256 = createHash('sha256').update(raw).digest('hex');
const customers = Array.isArray(data.customers) ? data.customers : [];
const users = Array.isArray(data.users) ? data.users : [];
const customerIds = new Set();
const duplicateCustomerIds = [];
let invalidCustomerTenantIds = 0;
let invalidStaffGrants = 0;
for (const customer of customers) {
  if (!customer || typeof customer.id !== 'string' || customerIds.has(customer.id)) {
    duplicateCustomerIds.push(typeof customer?.id === 'string' ? customer.id : '(invalid)');
  }
  if (typeof customer?.id === 'string') customerIds.add(customer.id);
  if (customer?.tenantId !== data.tenant.id) invalidCustomerTenantIds++;
  for (const id of Array.isArray(customer?.staffUserIds) ? customer.staffUserIds : []) {
    if (!users.some(u => u.id === id && u.tenantId === data.tenant.id && !u.disabledAt)) invalidStaffGrants++;
  }
}
const targetCollections = ['projects','assets','endpoints','tickets','jobs','amcs','crmOpportunities','quotes','leads'];
const bindings = {};
let unmapped = 0, orphaned = 0;
for (const name of targetCollections) {
  const rows = Array.isArray(data[name]) ? data[name] : [];
  const missing = rows.filter(row => !row?.customerId).length;
  const invalid = rows.filter(row => row?.customerId && !customerIds.has(row.customerId)).length;
  bindings[name] = { total: rows.length, unmapped: missing, invalidCustomerId: invalid };
  unmapped += missing; orphaned += invalid;
}
const assets = Array.isArray(data.assets) ? data.assets : [];
const claims = Array.isArray(data.rmaClaims) ? data.rmaClaims : [];
const rmaIssues = claims.filter(claim => {
  const asset = assets.find(a => a?.id === claim?.assetId);
  return !asset || !claim.customerId || asset.customerId !== claim.customerId;
}).length;
const projects = Array.isArray(data.projects) ? data.projects : [];
const proposalIssues = (Array.isArray(data.proposals) ? data.proposals : [])
  .filter(proposal => !projects.some(project => project?.id === proposal?.projectId)).length;
const customerPairs = customers.map(c => typeof c?.name === 'string' ? c.name.trim().toLowerCase() : '');
const duplicateNames = customerPairs.filter((name,i) => name && customerPairs.indexOf(name) < i).length;
const issues = unmapped + orphaned + rmaIssues + proposalIssues + invalidCustomerTenantIds +
  invalidStaffGrants + duplicateCustomerIds.length + duplicateNames;
const result = {
  kind: 'CUSTOMER_MIGRATION_READ_ONLY_PREFLIGHT',
  sourceSha256: sha256,
  currentTenantId: data.tenant.id,
  customerCount: customers.length,
  bindings,
  integrity: {
    duplicateCustomerIds: duplicateCustomerIds.length,
    duplicateCustomerNames: duplicateNames,
    invalidCustomerTenantIds,
    invalidStaffGrants,
    invalidRmaAssetCustomerLinks: rmaIssues,
    orphanProposals: proposalIssues
  },
  customerMigrationReady: issues === 0 && customers.length > 0,
  missingOrInvalidMappings: issues,
  warning: 'No data was modified. This is a structural preflight, not proof of restore or DB cutover safety.'
};
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
if (!result.customerMigrationReady) process.exitCode = 1;
