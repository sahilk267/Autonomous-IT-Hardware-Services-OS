-- Phase 10.1: ISOLATED STAGING SCHEMA. NOT enabled in the Express runtime.
-- Run only in a dedicated staging PostgreSQL database; do not point at production.
-- Source IDs are TEXT because the existing JSON store uses prefixed UUID IDs and tenant-1.
BEGIN;

CREATE SCHEMA apex;
CREATE TABLE apex.schema_versions (
  version TEXT PRIMARY KEY,
  installed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  stage_only BOOLEAN NOT NULL DEFAULT TRUE CHECK (stage_only)
);
INSERT INTO apex.schema_versions(version) VALUES ('10.1-staging');

CREATE TABLE apex.tenants (
  tenant_id TEXT PRIMARY KEY CHECK (length(tenant_id) BETWEEN 1 AND 160),
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0)
);
CREATE TABLE apex.staff (
  tenant_id TEXT NOT NULL REFERENCES apex.tenants(tenant_id),
  staff_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('BUSINESS_OWNER','SALES_MANAGER','PROCUREMENT_LEAD','ENTERPRISE_IT_HEAD','FIELD_ENGINEER')),
  disabled_at TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, staff_id)
);
CREATE TABLE apex.customers (
  tenant_id TEXT NOT NULL REFERENCES apex.tenants(tenant_id),
  customer_id TEXT NOT NULL,
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 160),
  PRIMARY KEY (tenant_id,customer_id)
);
CREATE UNIQUE INDEX apex_customer_name_unique ON apex.customers(tenant_id,lower(trim(display_name)));
CREATE TABLE apex.customer_grants (
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,customer_id,staff_id),
  FOREIGN KEY (tenant_id,customer_id) REFERENCES apex.customers ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,staff_id) REFERENCES apex.staff
);

-- Business records must carry BOTH tenant and registered customer identity.
-- Cross-customer proposal -> project and RMA -> asset references are enforced at the DB.
CREATE TABLE apex.customer_records (
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN (
    'projects','proposals','assets','endpoints','rmaClaims','tickets','jobs',
    'amcs','crmOpportunities','quotes','leads')),
  source_id TEXT NOT NULL CHECK (length(source_id) > 0),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  created_by_staff_id TEXT,
  assigned_staff_id TEXT,
  reported_by_staff_id TEXT,
  related_kind TEXT,
  related_id TEXT,
  PRIMARY KEY (tenant_id,kind,source_id),
  UNIQUE (tenant_id,customer_id,kind,source_id),
  FOREIGN KEY (tenant_id,customer_id) REFERENCES apex.customers,
  FOREIGN KEY (tenant_id,created_by_staff_id) REFERENCES apex.staff(tenant_id,staff_id),
  FOREIGN KEY (tenant_id,assigned_staff_id) REFERENCES apex.staff(tenant_id,staff_id),
  FOREIGN KEY (tenant_id,reported_by_staff_id) REFERENCES apex.staff(tenant_id,staff_id),
  FOREIGN KEY (tenant_id,customer_id,related_kind,related_id)
    REFERENCES apex.customer_records(tenant_id,customer_id,kind,source_id)
    DEFERRABLE INITIALLY IMMEDIATE,
  CONSTRAINT required_customer_link CHECK (
    (kind='proposals' AND related_kind='projects' AND related_id IS NOT NULL) OR
    (kind='rmaClaims' AND related_kind='assets' AND related_id IS NOT NULL) OR
    (kind NOT IN ('proposals','rmaClaims') AND related_kind IS NULL AND related_id IS NULL)
  )
);

CREATE TABLE apex.project_shares (
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  project_kind TEXT NOT NULL DEFAULT 'projects' CHECK (project_kind='projects'),
  staff_id TEXT NOT NULL,
  PRIMARY KEY (tenant_id,customer_id,project_id,staff_id),
  FOREIGN KEY (tenant_id,customer_id,project_kind,project_id)
    REFERENCES apex.customer_records(tenant_id,customer_id,kind,source_id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,customer_id,staff_id)
    REFERENCES apex.customer_grants(tenant_id,customer_id,staff_id) ON DELETE CASCADE
);

-- Unreviewed cross-customer legacy collections are owner-only, not silently public.
-- No password hashes, salts, auth sessions or API tokens are imported into this table.
CREATE TABLE apex.owner_legacy_records (
  tenant_id TEXT NOT NULL REFERENCES apex.tenants,
  kind TEXT NOT NULL CHECK (kind IN (
    'invoices','marketplaceDisputes','knowledgeArticles','inventoryTransactions',
    'products','suppliers','rfqs','telegramMessages','licenses','providers',
    'workflows','connectors')),
  source_id TEXT NOT NULL,
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload)='object'),
  PRIMARY KEY (tenant_id,kind,source_id)
);

CREATE TABLE apex.audit_events (
  tenant_id TEXT NOT NULL REFERENCES apex.tenants,
  event_id TEXT NOT NULL,
  event_data JSONB NOT NULL CHECK (jsonb_typeof(event_data)='object'),
  PRIMARY KEY (tenant_id,event_id)
);

CREATE TABLE apex.staging_imports (
  tenant_id TEXT PRIMARY KEY REFERENCES apex.tenants,
  sha256 TEXT NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  snapshot_counts JSONB NOT NULL CHECK (jsonb_typeof(snapshot_counts)='object'),
  imported_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  staging_only BOOLEAN NOT NULL DEFAULT TRUE CHECK (staging_only)
);

-- Database login is a separate NOLOGIN, non-bypass role. Production runtime NOT wired to it.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='apex_stage_reader') THEN
    CREATE ROLE apex_stage_reader NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles
             WHERE rolname='apex_stage_reader' AND (rolsuper OR rolbypassrls OR rolinherit)) THEN
    RAISE EXCEPTION 'Unsafe apex_stage_reader privileges';
  END IF;
END $$;

-- RLS identity context is set transaction-locally by a trusted backend after checking
-- its existing authenticated session. These GUCs are NOT client authentication:
-- never pass request-provided tenant/user IDs, expose raw SQL or allow SQL injection.
CREATE FUNCTION apex.active_role(p_tenant TEXT)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,apex,pg_temp AS $$
  SELECT u.role FROM apex.staff u
  WHERE u.tenant_id=p_tenant
    AND u.tenant_id=nullif(current_setting('apex.tenant_id',true),'')
    AND u.staff_id=nullif(current_setting('apex.actor_id',true),'')
    AND u.disabled_at IS NULL
  LIMIT 1;
$$;

CREATE FUNCTION apex.can_see_customer(p_tenant TEXT,p_customer TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,apex,pg_temp AS $$
DECLARE v_role TEXT;
BEGIN
  v_role := apex.active_role(p_tenant);
  IF v_role IS NULL OR p_customer IS NULL THEN RETURN FALSE; END IF;
  IF v_role='BUSINESS_OWNER' THEN RETURN TRUE; END IF;
  RETURN EXISTS (
    SELECT 1 FROM apex.customer_grants g
    WHERE g.tenant_id=p_tenant AND g.customer_id=p_customer
      AND g.staff_id=current_setting('apex.actor_id',true)
  );
END;
$$;

CREATE FUNCTION apex.can_see_record(
  p_tenant TEXT, p_customer TEXT, p_kind TEXT, p_source_id TEXT,
  p_creator TEXT, p_assignee TEXT, p_reporter TEXT, p_related_kind TEXT, p_related_id TEXT
) RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,apex,pg_temp AS $$
DECLARE v_role TEXT; v_actor TEXT; v_project apex.customer_records%ROWTYPE;
BEGIN
  IF NOT apex.can_see_customer(p_tenant,p_customer) THEN RETURN FALSE; END IF;
  v_role := apex.active_role(p_tenant);
  v_actor := current_setting('apex.actor_id',true);
  IF v_role='BUSINESS_OWNER' THEN RETURN TRUE; END IF;

  IF p_kind='projects' THEN
    RETURN v_role IN ('SALES_MANAGER','PROCUREMENT_LEAD','ENTERPRISE_IT_HEAD') AND (
      p_creator=v_actor OR EXISTS (
        SELECT 1 FROM apex.project_shares ps
        WHERE ps.tenant_id=p_tenant AND ps.customer_id=p_customer
          AND ps.project_id=p_source_id AND ps.staff_id=v_actor
      )
    );
  END IF;
  IF p_kind='proposals' THEN
    IF v_role NOT IN ('SALES_MANAGER','PROCUREMENT_LEAD','ENTERPRISE_IT_HEAD') THEN RETURN FALSE; END IF;
    SELECT * INTO v_project FROM apex.customer_records p
    WHERE p.tenant_id=p_tenant AND p.customer_id=p_customer
      AND p.kind='projects' AND p.source_id=p_related_id;
    IF NOT FOUND THEN RETURN FALSE; END IF;
    RETURN v_project.created_by_staff_id=v_actor OR EXISTS (
      SELECT 1 FROM apex.project_shares ps
      WHERE ps.tenant_id=p_tenant AND ps.customer_id=p_customer
        AND ps.project_id=p_related_id AND ps.staff_id=v_actor
    );
  END IF;
  IF p_kind IN ('crmOpportunities','leads') THEN RETURN v_role='SALES_MANAGER'; END IF;
  IF p_kind='quotes' THEN RETURN v_role IN ('SALES_MANAGER','PROCUREMENT_LEAD'); END IF;
  IF p_kind='amcs' THEN RETURN v_role='ENTERPRISE_IT_HEAD'; END IF;
  IF p_kind='assets' THEN
    RETURN v_role IN ('ENTERPRISE_IT_HEAD','PROCUREMENT_LEAD') OR
      (v_role='FIELD_ENGINEER' AND p_assignee=v_actor);
  END IF;
  IF p_kind='endpoints' OR p_kind='jobs' THEN
    RETURN v_role='ENTERPRISE_IT_HEAD' OR
      (v_role='FIELD_ENGINEER' AND p_assignee=v_actor);
  END IF;
  IF p_kind='tickets' THEN
    RETURN v_role='ENTERPRISE_IT_HEAD' OR
      (v_role='FIELD_ENGINEER' AND (p_assignee=v_actor OR p_reporter=v_actor));
  END IF;
  IF p_kind='rmaClaims' THEN
    IF v_role='ENTERPRISE_IT_HEAD' THEN RETURN TRUE; END IF;
    IF v_role<>'FIELD_ENGINEER' THEN RETURN FALSE; END IF;
    RETURN EXISTS (
      SELECT 1 FROM apex.customer_records a
      WHERE a.tenant_id=p_tenant AND a.customer_id=p_customer
        AND a.kind='assets' AND a.source_id=p_related_id AND a.assigned_staff_id=v_actor
    );
  END IF;
  RETURN FALSE;
END;
$$;

REVOKE ALL ON FUNCTION apex.active_role(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION apex.can_see_customer(TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION apex.can_see_record(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;

ALTER TABLE apex.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE apex.tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_view ON apex.tenants FOR SELECT
  USING (apex.active_role(tenant_id) IS NOT NULL);

ALTER TABLE apex.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE apex.staff FORCE ROW LEVEL SECURITY;
CREATE POLICY staff_view ON apex.staff FOR SELECT
  USING (apex.active_role(tenant_id)='BUSINESS_OWNER'
    OR (apex.active_role(tenant_id) IS NOT NULL
      AND staff_id=current_setting('apex.actor_id',true)));

ALTER TABLE apex.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE apex.customers FORCE ROW LEVEL SECURITY;
CREATE POLICY customer_view ON apex.customers FOR SELECT
  USING (apex.can_see_customer(tenant_id,customer_id));

ALTER TABLE apex.customer_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE apex.customer_grants FORCE ROW LEVEL SECURITY;
CREATE POLICY grant_view ON apex.customer_grants FOR SELECT
  USING (apex.active_role(tenant_id)='BUSINESS_OWNER'
    OR (apex.active_role(tenant_id) IS NOT NULL
        AND staff_id=current_setting('apex.actor_id',true)
        AND apex.can_see_customer(tenant_id,customer_id)));

ALTER TABLE apex.customer_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE apex.customer_records FORCE ROW LEVEL SECURITY;
CREATE POLICY record_view ON apex.customer_records FOR SELECT USING (
  apex.can_see_record(tenant_id,customer_id,kind,source_id,
    created_by_staff_id,assigned_staff_id,reported_by_staff_id,related_kind,related_id)
);

ALTER TABLE apex.project_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE apex.project_shares FORCE ROW LEVEL SECURITY;
CREATE POLICY shares_view ON apex.project_shares FOR SELECT USING (
  apex.active_role(tenant_id)='BUSINESS_OWNER' OR
  (apex.can_see_customer(tenant_id,customer_id) AND
    staff_id=current_setting('apex.actor_id',true))
);

ALTER TABLE apex.owner_legacy_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE apex.owner_legacy_records FORCE ROW LEVEL SECURITY;
CREATE POLICY legacy_owner_only ON apex.owner_legacy_records FOR SELECT USING (
  apex.active_role(tenant_id)='BUSINESS_OWNER'
);

ALTER TABLE apex.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE apex.audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_owner_only ON apex.audit_events FOR SELECT USING (
  apex.active_role(tenant_id)='BUSINESS_OWNER'
);

ALTER TABLE apex.staging_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE apex.staging_imports FORCE ROW LEVEL SECURITY;
CREATE POLICY imports_owner_only ON apex.staging_imports FOR SELECT USING (
  apex.active_role(tenant_id)='BUSINESS_OWNER'
);

GRANT USAGE ON SCHEMA apex TO apex_stage_reader;
GRANT EXECUTE ON FUNCTION apex.active_role(TEXT) TO apex_stage_reader;
GRANT EXECUTE ON FUNCTION apex.can_see_customer(TEXT,TEXT) TO apex_stage_reader;
GRANT EXECUTE ON FUNCTION apex.can_see_record(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO apex_stage_reader;
GRANT SELECT ON apex.tenants,apex.staff,apex.customers,apex.customer_grants,
  apex.customer_records,apex.project_shares,apex.owner_legacy_records,
  apex.audit_events,apex.staging_imports TO apex_stage_reader;

COMMIT;
