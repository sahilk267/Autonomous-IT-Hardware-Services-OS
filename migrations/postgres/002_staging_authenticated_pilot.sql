-- Phase 10.2: staging-only authenticated PostgreSQL pilot writes.
-- Run AFTER 001 and the isolated 10.1 staging import. This is NOT a production runtime cutover.
BEGIN;

INSERT INTO apex.schema_versions(version) VALUES ('10.2-pilot');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'apex_pilot_writer') THEN
    CREATE ROLE apex_pilot_writer NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'apex_pilot_writer'
    AND (rolsuper OR rolbypassrls OR rolcanlogin OR rolinherit)) THEN
    RAISE EXCEPTION 'Unsafe apex_pilot_writer privileges';
  END IF;
END $$;

-- The pilot login must be provisioned separately by an operator in a disposable local DB.
GRANT USAGE ON SCHEMA apex TO apex_pilot_writer;
GRANT SELECT ON apex.schema_versions, apex.tenants, apex.staff, apex.customers,
  apex.customer_grants, apex.customer_records, apex.project_shares,
  apex.owner_legacy_records, apex.audit_events, apex.staging_imports
  TO apex_pilot_writer;
GRANT EXECUTE ON FUNCTION apex.active_role(TEXT) TO apex_pilot_writer;
GRANT EXECUTE ON FUNCTION apex.can_see_customer(TEXT,TEXT) TO apex_pilot_writer;
GRANT EXECUTE ON FUNCTION apex.can_see_record(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO apex_pilot_writer;

CREATE POLICY pilot_customer_insert ON apex.customers FOR INSERT TO apex_pilot_writer
WITH CHECK (apex.active_role(tenant_id) = 'BUSINESS_OWNER');
GRANT INSERT ON apex.customers TO apex_pilot_writer;

CREATE POLICY pilot_grant_insert ON apex.customer_grants FOR INSERT TO apex_pilot_writer
WITH CHECK (
  apex.active_role(tenant_id) = 'BUSINESS_OWNER'
  AND EXISTS (
    SELECT 1 FROM apex.staff s WHERE s.tenant_id=customer_grants.tenant_id
      AND s.staff_id=customer_grants.staff_id AND s.disabled_at IS NULL
      AND s.role<>'BUSINESS_OWNER'
  )
);
CREATE POLICY pilot_grant_delete ON apex.customer_grants FOR DELETE TO apex_pilot_writer
USING (apex.active_role(tenant_id) = 'BUSINESS_OWNER');
GRANT INSERT, DELETE ON apex.customer_grants TO apex_pilot_writer;

-- Pilot writes are deliberately limited to CRM JSON documents. The columns representing
-- tenant/customer/record identity are not updatable through the pilot database role.
CREATE POLICY pilot_crm_insert ON apex.customer_records FOR INSERT TO apex_pilot_writer
WITH CHECK (
  kind='crmOpportunities'
  AND apex.active_role(tenant_id) IN ('BUSINESS_OWNER','SALES_MANAGER')
  AND apex.can_see_customer(tenant_id,customer_id)
  AND created_by_staff_id=current_setting('apex.actor_id',true)
  AND payload->>'id'=source_id
  AND payload->>'customerId'=customer_id
);
CREATE POLICY pilot_crm_update ON apex.customer_records FOR UPDATE TO apex_pilot_writer
USING (
  kind='crmOpportunities'
  AND apex.active_role(tenant_id) IN ('BUSINESS_OWNER','SALES_MANAGER')
  AND apex.can_see_customer(tenant_id,customer_id)
  AND (apex.active_role(tenant_id)='BUSINESS_OWNER'
       OR created_by_staff_id=current_setting('apex.actor_id',true))
)
WITH CHECK (
  kind='crmOpportunities'
  AND apex.active_role(tenant_id) IN ('BUSINESS_OWNER','SALES_MANAGER')
  AND apex.can_see_customer(tenant_id,customer_id)
  AND (apex.active_role(tenant_id)='BUSINESS_OWNER'
       OR created_by_staff_id=current_setting('apex.actor_id',true))
  AND payload->>'id'=source_id
  AND payload->>'customerId'=customer_id
);
GRANT INSERT, UPDATE(payload) ON apex.customer_records TO apex_pilot_writer;

-- Audit is DB-triggered, rather than an optional second HTTP operation. Writer cannot
-- insert/update/delete audit rows. Only owner can select; no passwords or names are copied.
CREATE TABLE apex.pilot_audit_events (
  tenant_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  actor_staff_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK(operation IN ('INSERT','UPDATE','DELETE')),
  entity TEXT NOT NULL CHECK(entity IN ('customers','customer_grants','customer_records')),
  object_id TEXT NOT NULL,
  customer_id TEXT,
  kind TEXT,
  txid BIGINT NOT NULL DEFAULT txid_current(),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,event_id),
  FOREIGN KEY (tenant_id,actor_staff_id) REFERENCES apex.staff(tenant_id,staff_id),
  FOREIGN KEY (tenant_id) REFERENCES apex.tenants(tenant_id)
);
ALTER TABLE apex.pilot_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE apex.pilot_audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY pilot_audit_owner_only ON apex.pilot_audit_events FOR SELECT
  USING (apex.active_role(tenant_id)='BUSINESS_OWNER');
GRANT SELECT ON apex.pilot_audit_events TO apex_pilot_writer;

CREATE FUNCTION apex.capture_pilot_audit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,apex,pg_temp AS $$
DECLARE
  rec RECORD;
  v_tenant TEXT;
  v_customer TEXT;
  v_kind TEXT;
  v_object TEXT;
  v_actor TEXT := nullif(current_setting('apex.actor_id',true),'');
BEGIN
  IF TG_OP='DELETE' THEN rec := OLD; ELSE rec := NEW; END IF;
  v_tenant := rec.tenant_id;
  IF v_actor IS NULL OR v_tenant IS DISTINCT FROM nullif(current_setting('apex.tenant_id',true),'')
    OR apex.active_role(v_tenant) IS NULL THEN
    RAISE EXCEPTION 'Authenticated tenant actor context required for pilot mutation';
  END IF;
  IF TG_TABLE_NAME='customer_records' THEN
    v_customer := rec.customer_id;
    v_kind := rec.kind;
    v_object := rec.source_id;
  ELSIF TG_TABLE_NAME='customer_grants' THEN
    v_customer := rec.customer_id;
    v_kind := 'membership';
    v_object := rec.customer_id || ':' || rec.staff_id;
  ELSE
    v_customer := rec.customer_id;
    v_kind := 'customer';
    v_object := rec.customer_id;
  END IF;
  INSERT INTO apex.pilot_audit_events
    (tenant_id,event_id,actor_staff_id,operation,entity,object_id,customer_id,kind)
  VALUES(v_tenant,'pilot-' || gen_random_uuid()::text,v_actor,TG_OP,
    TG_TABLE_NAME,v_object,v_customer,v_kind);
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION apex.capture_pilot_audit() FROM PUBLIC;
CREATE TRIGGER pilot_customer_audit AFTER INSERT ON apex.customers
  FOR EACH ROW EXECUTE FUNCTION apex.capture_pilot_audit();
CREATE TRIGGER pilot_grant_audit AFTER INSERT OR DELETE ON apex.customer_grants
  FOR EACH ROW EXECUTE FUNCTION apex.capture_pilot_audit();
CREATE TRIGGER pilot_crm_audit AFTER INSERT OR UPDATE ON apex.customer_records
  FOR EACH ROW WHEN (NEW.kind='crmOpportunities')
  EXECUTE FUNCTION apex.capture_pilot_audit();

COMMIT;
