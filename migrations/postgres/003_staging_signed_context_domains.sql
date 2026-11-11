-- Phase 10.3A. Local staging-only transaction-attested SQL context and domain repositories.
-- Install AFTER migrations 001 and 002. Never enable for deployed customer databases.
BEGIN;
INSERT INTO apex.schema_versions(version) VALUES ('10.3a-context-domain');
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Secret is installed separately from a generated CI/operator value. It must never
-- be delivered to a SQL client or read by the NOLOGIN pilot writer. Rotate after restores.
CREATE TABLE apex.pilot_context_secrets (
  key_id TEXT PRIMARY KEY CHECK (key_id='active'),
  secret BYTEA NOT NULL CHECK (octet_length(secret)=32)
);
REVOKE ALL ON apex.pilot_context_secrets FROM PUBLIC;
REVOKE ALL ON apex.pilot_context_secrets FROM apex_pilot_writer;
REVOKE ALL ON apex.pilot_context_secrets FROM apex_stage_reader;

CREATE FUNCTION apex.pilot_context_is_attested(p_tenant TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,apex,pg_temp AS $$
DECLARE
  v_key BYTEA;
  v_tenant TEXT := nullif(current_setting('apex.tenant_id',true),'');
  v_actor TEXT := nullif(current_setting('apex.actor_id',true),'');
  v_sig TEXT := nullif(current_setting('apex.context_signature',true),'');
  v_payload TEXT;
BEGIN
  IF v_tenant IS NULL OR v_actor IS NULL OR v_sig IS NULL OR v_tenant IS DISTINCT FROM p_tenant
    OR v_sig !~ '^[0-9a-f]{64}$' THEN
    RETURN FALSE;
  END IF;
  SELECT secret INTO v_key FROM apex.pilot_context_secrets WHERE key_id='active';
  IF v_key IS NULL THEN RETURN FALSE; END IF;
  -- Bind this signature to the current DB transaction AND backend connection.
  -- Replaying a signed context in another transaction or connection fails.
  v_payload := v_tenant || E'\n' || v_actor || E'\n' ||
    txid_current()::text || E'\n' || pg_backend_pid()::text;
  RETURN v_sig=encode(hmac(convert_to(v_payload,'UTF8'),v_key,'sha256'),'hex');
END;
$$;
REVOKE ALL ON FUNCTION apex.pilot_context_is_attested(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apex.pilot_context_is_attested(TEXT)
  TO apex_pilot_writer, apex_stage_reader;

-- All existing read and mutation policies call active_role. Replacing it here
-- strengthens tenant/customer/role checks without a caller-controlled bypass.
CREATE OR REPLACE FUNCTION apex.active_role(p_tenant TEXT)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,apex,pg_temp AS $$
  SELECT u.role FROM apex.staff u
  WHERE u.tenant_id=p_tenant
    AND apex.pilot_context_is_attested(p_tenant)
    AND u.tenant_id=nullif(current_setting('apex.tenant_id',true),'')
    AND u.staff_id=nullif(current_setting('apex.actor_id',true),'')
    AND u.disabled_at IS NULL
  LIMIT 1;
$$;

-- Tenant/customer/project constraints are evaluated in both HTTP and DB RLS.
CREATE POLICY pilot_project_insert ON apex.customer_records
FOR INSERT TO apex_pilot_writer WITH CHECK (
  kind='projects'
  AND apex.active_role(tenant_id) IN ('BUSINESS_OWNER','ENTERPRISE_IT_HEAD')
  AND apex.can_see_customer(tenant_id,customer_id)
  AND created_by_staff_id=current_setting('apex.actor_id',true)
  AND payload->>'id'=source_id
  AND payload->>'customerId'=customer_id
  AND payload->>'createdByUserId'=created_by_staff_id
  AND jsonb_typeof(payload->'collaboratorUserIds')='array'
  AND jsonb_array_length(payload->'collaboratorUserIds')=0
);

CREATE POLICY pilot_ticket_insert ON apex.customer_records
FOR INSERT TO apex_pilot_writer WITH CHECK (
  kind='tickets'
  AND apex.active_role(tenant_id) IN ('BUSINESS_OWNER','ENTERPRISE_IT_HEAD')
  AND apex.can_see_customer(tenant_id,customer_id)
  AND created_by_staff_id=current_setting('apex.actor_id',true)
  AND payload->>'id'=source_id
  AND payload->>'customerId'=customer_id
  AND payload->>'reportedByUserId'=created_by_staff_id
  AND assigned_staff_id IS NULL
  AND payload->>'assignedUserId' IS NULL
  AND payload->>'status'='OPEN'
);
-- Stage-only status changes; immutable tenant/customer/creator/assignment columns
-- cannot be changed using this role's UPDATE(payload) grant.
CREATE POLICY pilot_ticket_update ON apex.customer_records
FOR UPDATE TO apex_pilot_writer
USING (
  kind='tickets'
  AND apex.active_role(tenant_id) IN ('BUSINESS_OWNER','ENTERPRISE_IT_HEAD')
  AND apex.can_see_customer(tenant_id,customer_id)
)
WITH CHECK (
  kind='tickets'
  AND apex.active_role(tenant_id) IN ('BUSINESS_OWNER','ENTERPRISE_IT_HEAD')
  AND apex.can_see_customer(tenant_id,customer_id)
  AND payload->>'id'=source_id
  AND payload->>'customerId'=customer_id
  AND payload->>'reportedByUserId'=created_by_staff_id
  AND payload->>'assignedUserId' IS NULL
  AND assigned_staff_id IS NULL
  AND payload->>'status' IN ('OPEN','IN_PROGRESS','RESOLVED','CLOSED')
);

-- Only owner can share/revoke project collaborator memberships. Existing composite
-- foreign keys ensure the project and staff grant are for this SAME customer and tenant.
CREATE POLICY pilot_share_insert ON apex.project_shares FOR INSERT TO apex_pilot_writer
WITH CHECK (apex.active_role(tenant_id)='BUSINESS_OWNER'
  AND apex.can_see_customer(tenant_id,customer_id));
CREATE POLICY pilot_share_delete ON apex.project_shares FOR DELETE TO apex_pilot_writer
USING (apex.active_role(tenant_id)='BUSINESS_OWNER'
  AND apex.can_see_customer(tenant_id,customer_id));
GRANT INSERT,DELETE ON apex.project_shares TO apex_pilot_writer;

-- Staging audit events are append-only to the unprivileged writer.
ALTER TABLE apex.pilot_audit_events
  DROP CONSTRAINT pilot_audit_events_entity_check;
ALTER TABLE apex.pilot_audit_events
  ADD CONSTRAINT pilot_audit_events_entity_check
  CHECK(entity IN ('customers','customer_grants','customer_records','project_shares'));

-- Replace the old record audit trigger with project/ticket/CRM coverage.
DROP TRIGGER pilot_crm_audit ON apex.customer_records;
CREATE TRIGGER pilot_domain_audit AFTER INSERT OR UPDATE ON apex.customer_records
  FOR EACH ROW
  WHEN (NEW.kind IN ('crmOpportunities','projects','tickets'))
  EXECUTE FUNCTION apex.capture_pilot_audit();

CREATE FUNCTION apex.capture_project_share_audit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,apex,pg_temp AS $$
DECLARE
  v_rec RECORD;
  v_actor TEXT := nullif(current_setting('apex.actor_id',true),'');
BEGIN
  IF TG_OP='DELETE' THEN v_rec := OLD; ELSE v_rec := NEW; END IF;
  IF apex.active_role(v_rec.tenant_id)<>'BUSINESS_OWNER' OR v_actor IS NULL THEN
    RAISE EXCEPTION 'Owner authorization required for project-share audit';
  END IF;
  INSERT INTO apex.pilot_audit_events
    (tenant_id,event_id,actor_staff_id,operation,entity,object_id,customer_id,kind)
  VALUES (
    v_rec.tenant_id,'pilot-'||gen_random_uuid()::text,v_actor,TG_OP,
    'project_shares',v_rec.project_id||':'||v_rec.staff_id,
    v_rec.customer_id,'project_access'
  );
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION apex.capture_project_share_audit() FROM PUBLIC;
CREATE TRIGGER pilot_project_share_audit AFTER INSERT OR DELETE ON apex.project_shares
  FOR EACH ROW EXECUTE FUNCTION apex.capture_project_share_audit();
COMMIT;
