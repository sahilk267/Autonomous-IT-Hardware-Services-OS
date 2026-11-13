-- Phase 10.5A: PostgreSQL staging-only transaction-safe request deduplication.
-- Never a payment, invoice, PO dispatch, external integration or production cutover.
-- Apply after staging migrations 001 through 005 in a disposable apex_stage_* DB.
BEGIN;
INSERT INTO apex.schema_versions(version) VALUES('10.5a-idempotent-drafts');

-- Immutable request claims make internal draft retries safe under lost HTTP replies.
-- Scope is (tenant, authenticated staff, request key), NOT client-provided actor identity.
-- Only an opaque digest is kept: no request body, secret or payment token is stored.
CREATE TABLE apex.pilot_request_keys (
  tenant_id TEXT NOT NULL,
  actor_staff_id TEXT NOT NULL,
  request_key TEXT NOT NULL
    CHECK(request_key ~ '^[A-Za-z0-9._-]{12,80}$'),
  operation TEXT NOT NULL CHECK(operation IN ('PROCUREMENT_DRAFT','FINANCE_PREVIEW')),
  customer_id TEXT NOT NULL,
  request_sha256 TEXT NOT NULL CHECK(request_sha256 ~ '^[0-9a-f]{64}$'),
  resource_id TEXT NOT NULL CHECK(length(resource_id) BETWEEN 5 AND 120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(tenant_id,actor_staff_id,request_key),
  FOREIGN KEY(tenant_id,actor_staff_id) REFERENCES apex.staff(tenant_id,staff_id),
  FOREIGN KEY(tenant_id,customer_id) REFERENCES apex.customers(tenant_id,customer_id)
);
CREATE INDEX pilot_request_keys_resource_idx
  ON apex.pilot_request_keys(tenant_id,operation,resource_id);
ALTER TABLE apex.pilot_request_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE apex.pilot_request_keys FORCE ROW LEVEL SECURITY;

CREATE POLICY request_key_read ON apex.pilot_request_keys
FOR SELECT TO apex_pilot_writer USING (
  actor_staff_id=current_setting('apex.actor_id',true)
  AND apex.can_see_customer(tenant_id,customer_id)
  AND (
    (operation='PROCUREMENT_DRAFT' AND
      apex.active_role(tenant_id) IN ('BUSINESS_OWNER','PROCUREMENT_LEAD'))
    OR (operation='FINANCE_PREVIEW' AND
      apex.active_role(tenant_id)='BUSINESS_OWNER')
  )
);
CREATE POLICY request_key_insert ON apex.pilot_request_keys
FOR INSERT TO apex_pilot_writer WITH CHECK (
  actor_staff_id=current_setting('apex.actor_id',true)
  AND apex.can_see_customer(tenant_id,customer_id)
  AND (
    (operation='PROCUREMENT_DRAFT' AND
      apex.active_role(tenant_id) IN ('BUSINESS_OWNER','PROCUREMENT_LEAD'))
    OR (operation='FINANCE_PREVIEW' AND
      apex.active_role(tenant_id)='BUSINESS_OWNER')
  )
);
GRANT SELECT,INSERT ON apex.pilot_request_keys TO apex_pilot_writer;
-- Deliberately no UPDATE/DELETE grant and no direct grant to public/read-only role.
COMMIT;
