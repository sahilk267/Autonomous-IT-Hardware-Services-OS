-- Phase L: proposed PostgreSQL tenancy core (schema-only, NOT yet wired to Express).
-- Apply once under a dedicated schema owner, then use a distinct non-owner
-- runtime role WITHOUT BYPASSRLS. This file is intentionally not auto-applied
-- to existing JSON deployments.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS apex_tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z][a-z0-9-]{2,62}$'),
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 256),
  created_at timestamptz NOT NULL DEFAULT now(),
  disabled_at timestamptz
);

CREATE TABLE IF NOT EXISTS apex_memberships (
  tenant_id uuid NOT NULL REFERENCES apex_tenants(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL DEFAULT gen_random_uuid(),
  username text NOT NULL CHECK (char_length(username) BETWEEN 3 AND 128),
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN (
    'BUSINESS_OWNER', 'SALES_MANAGER', 'ENTERPRISE_IT_HEAD',
    'FIELD_ENGINEER', 'PROCUREMENT_LEAD'
  )),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS apex_memberships_tenant_username
  ON apex_memberships (tenant_id, lower(username));

CREATE TABLE IF NOT EXISTS apex_sessions (
  tenant_id uuid NOT NULL,
  token_sha256 bytea NOT NULL CHECK (length(token_sha256) = 32),
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL CHECK (expires_at > created_at),
  revoked_at timestamptz,
  PRIMARY KEY (tenant_id, token_sha256),
  FOREIGN KEY (tenant_id, user_id)
    REFERENCES apex_memberships(tenant_id, user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS apex_sessions_user_expiry
  ON apex_sessions(tenant_id, user_id, expires_at DESC);

-- Interim generic entity storage; validated per-type adapters and
-- normalized finance/inventory tables are required before production use.
CREATE TABLE IF NOT EXISTS apex_records (
  tenant_id uuid NOT NULL REFERENCES apex_tenants(id) ON DELETE RESTRICT,
  record_type text NOT NULL CHECK (
    record_type ~ '^[a-z_]{2,64}$'
  ),
  record_id text NOT NULL CHECK (char_length(record_id) BETWEEN 1 AND 256),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, record_type, record_id),
  CONSTRAINT apex_payload_tenant_check CHECK (
    NOT (payload ? 'tenantId') OR payload->>'tenantId' = tenant_id::text
  )
);
CREATE INDEX IF NOT EXISTS apex_records_by_type
  ON apex_records (tenant_id, record_type, updated_at DESC);

CREATE TABLE IF NOT EXISTS apex_audit (
  tenant_id uuid NOT NULL REFERENCES apex_tenants(id) ON DELETE RESTRICT,
  event_id uuid NOT NULL DEFAULT gen_random_uuid(),
  actor_id uuid,
  action text NOT NULL CHECK (char_length(action) BETWEEN 1 AND 128),
  target_type text NOT NULL,
  target_id text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, event_id),
  FOREIGN KEY (tenant_id, actor_id)
    REFERENCES apex_memberships(tenant_id, user_id) ON DELETE SET NULL (actor_id)
);
CREATE INDEX IF NOT EXISTS apex_audit_tenant_time
  ON apex_audit (tenant_id, created_at DESC);

-- Every tenant-owned table enforces RLS even for table owner.
ALTER TABLE apex_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE apex_tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE apex_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE apex_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE apex_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE apex_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE apex_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE apex_records FORCE ROW LEVEL SECURITY;
ALTER TABLE apex_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE apex_audit FORCE ROW LEVEL SECURITY;

-- Fail closed unless each transaction has a server-verified tenant ID.
-- The application must SET LOCAL apex.tenant_id inside a DB transaction
-- after validating the current session and tenant membership.
CREATE POLICY apex_tenants_scope ON apex_tenants
  FOR ALL USING (id = NULLIF(current_setting('apex.tenant_id', true), '')::uuid)
  WITH CHECK (id = NULLIF(current_setting('apex.tenant_id', true), '')::uuid);

CREATE POLICY apex_memberships_scope ON apex_memberships
  FOR ALL USING (tenant_id = NULLIF(current_setting('apex.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('apex.tenant_id', true), '')::uuid);

CREATE POLICY apex_sessions_scope ON apex_sessions
  FOR ALL USING (tenant_id = NULLIF(current_setting('apex.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('apex.tenant_id', true), '')::uuid);

CREATE POLICY apex_records_scope ON apex_records
  FOR ALL USING (tenant_id = NULLIF(current_setting('apex.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('apex.tenant_id', true), '')::uuid);

CREATE POLICY apex_audit_read ON apex_audit
  FOR SELECT USING (tenant_id = NULLIF(current_setting('apex.tenant_id', true), '')::uuid);
CREATE POLICY apex_audit_append ON apex_audit
  FOR INSERT WITH CHECK (tenant_id = NULLIF(current_setting('apex.tenant_id', true), '')::uuid);

COMMIT;
