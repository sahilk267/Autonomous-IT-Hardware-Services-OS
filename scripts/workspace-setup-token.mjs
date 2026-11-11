#!/usr/bin/env node
/**
 * Operator-only command. Execute in a PRIVATE provisioning shell that has
 * APEX_SETUP_TOKEN configured to the same server-held deployment root key.
 * Outputs only the tenant-specific derived bootstrap authorization token.
 * Never commit, email, or log the root key in deployment CI.
 */
import crypto from 'node:crypto';

const uuid = process.argv[2];
const root = process.env.APEX_SETUP_TOKEN;
if (!root || root.length < 32 ||
    typeof uuid !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid)) {
  console.error('Usage: APEX_SETUP_TOKEN=<private-32+-character-root> node scripts/workspace-setup-token.mjs <provisioned-tenant-uuid>');
  process.exitCode = 1;
} else {
  const derived = crypto.createHmac('sha256', root)
    .update('apex-workspace-enrollment-v1:' + uuid.toLowerCase()).digest('hex');
  process.stdout.write(derived + '\n');
}
