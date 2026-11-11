-- Phase 10.3B: customer-bound asset and field-job SQL repository staging increment.
-- ONLY after migrations 001, 002 and 003. Local staging; never a production cutover.
BEGIN;
INSERT INTO apex.schema_versions(version) VALUES('10.3b-field-assets');

-- Ensure the projected staff assignment cannot be rewritten independently of JSON.
-- Other collection rows must not acquire fabricated assignees through broad SQL column grants.
ALTER TABLE apex.customer_records ADD CONSTRAINT staged_assignment_projection CHECK (
  (kind IN ('assets','endpoints','jobs','tickets') AND
    (payload->>'assignedUserId' IS NOT DISTINCT FROM assigned_staff_id))
  OR
  (kind NOT IN ('assets','endpoints','jobs','tickets') AND assigned_staff_id IS NULL)
);
CREATE UNIQUE INDEX stage_asset_tag_unique
  ON apex.customer_records(tenant_id,upper(payload->>'assetTag'))
  WHERE kind='assets' AND payload->>'assetTag' IS NOT NULL;

-- RLS cannot rely on field engineer reading OTHER staff grants; use a small
-- SECURITY DEFINER boolean validator that never writes or returns PII.
CREATE FUNCTION apex.is_active_customer_field_staff(
  p_tenant TEXT,p_customer TEXT,p_staff TEXT
) RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,apex,pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM apex.customer_grants g
    JOIN apex.staff s ON s.tenant_id=g.tenant_id AND s.staff_id=g.staff_id
    WHERE g.tenant_id=p_tenant AND g.customer_id=p_customer
      AND g.staff_id=p_staff AND s.role='FIELD_ENGINEER' AND s.disabled_at IS NULL
  );
$$;
REVOKE ALL ON FUNCTION apex.is_active_customer_field_staff(TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apex.is_active_customer_field_staff(TEXT,TEXT,TEXT)
  TO apex_pilot_writer;

CREATE POLICY pilot_asset_insert ON apex.customer_records FOR INSERT TO apex_pilot_writer
WITH CHECK (
  kind='assets'
  AND apex.active_role(tenant_id) IN ('BUSINESS_OWNER','ENTERPRISE_IT_HEAD')
  AND apex.can_see_customer(tenant_id,customer_id)
  AND created_by_staff_id=current_setting('apex.actor_id',true)
  AND payload->>'id'=source_id AND payload->>'customerId'=customer_id
  AND assigned_staff_id IS NULL
  AND payload->>'assignedUserId' IS NULL
  AND payload->>'status'='AVAILABLE_IN_STOCK'
);
CREATE POLICY pilot_asset_update ON apex.customer_records FOR UPDATE TO apex_pilot_writer
USING (
  kind='assets'
  AND apex.can_see_customer(tenant_id,customer_id)
  AND (apex.active_role(tenant_id) IN ('BUSINESS_OWNER','ENTERPRISE_IT_HEAD')
    OR (apex.active_role(tenant_id)='FIELD_ENGINEER'
      AND assigned_staff_id=current_setting('apex.actor_id',true)))
)
WITH CHECK (
  kind='assets'
  AND apex.can_see_customer(tenant_id,customer_id)
  AND (apex.active_role(tenant_id) IN ('BUSINESS_OWNER','ENTERPRISE_IT_HEAD')
    OR (apex.active_role(tenant_id)='FIELD_ENGINEER'
      AND assigned_staff_id=current_setting('apex.actor_id',true)))
  AND payload->>'id'=source_id AND payload->>'customerId'=customer_id
  AND payload->>'status' IN ('IN_USE','AVAILABLE_IN_STOCK','UNDER_REPAIR','RETIRED')
  AND (assigned_staff_id IS NULL OR
    apex.is_active_customer_field_staff(tenant_id,customer_id,assigned_staff_id))
);

CREATE POLICY pilot_job_insert ON apex.customer_records FOR INSERT TO apex_pilot_writer
WITH CHECK (
  kind='jobs'
  AND apex.active_role(tenant_id) IN ('BUSINESS_OWNER','ENTERPRISE_IT_HEAD')
  AND apex.can_see_customer(tenant_id,customer_id)
  AND created_by_staff_id=current_setting('apex.actor_id',true)
  AND payload->>'id'=source_id AND payload->>'customerId'=customer_id
  AND assigned_staff_id IS NULL
  AND payload->>'assignedUserId' IS NULL
  AND payload->>'status'='SCHEDULED'
);
CREATE POLICY pilot_job_update ON apex.customer_records FOR UPDATE TO apex_pilot_writer
USING (
  kind='jobs'
  AND apex.can_see_customer(tenant_id,customer_id)
  AND (apex.active_role(tenant_id) IN ('BUSINESS_OWNER','ENTERPRISE_IT_HEAD')
    OR (apex.active_role(tenant_id)='FIELD_ENGINEER'
      AND assigned_staff_id=current_setting('apex.actor_id',true)))
)
WITH CHECK (
  kind='jobs'
  AND apex.can_see_customer(tenant_id,customer_id)
  AND (apex.active_role(tenant_id) IN ('BUSINESS_OWNER','ENTERPRISE_IT_HEAD')
    OR (apex.active_role(tenant_id)='FIELD_ENGINEER'
      AND assigned_staff_id=current_setting('apex.actor_id',true)))
  AND payload->>'id'=source_id AND payload->>'customerId'=customer_id
  -- Only unverified internal dispatch/progress states; not external completion claims.
  AND payload->>'status' IN ('SCHEDULED','EN_ROUTE','CHECKED_IN','DIAGNOSING')
  AND (assigned_staff_id IS NULL OR
    apex.is_active_customer_field_staff(tenant_id,customer_id,assigned_staff_id))
);

-- Assignment is a two-column atomic change that the ordinary manager-only API
-- performs within its authenticated, signed database transaction.
GRANT UPDATE(assigned_staff_id) ON apex.customer_records TO apex_pilot_writer;

-- Immutable class of customer business object is still bound by existing RLS
-- and immutable source PK. Extend existing same-transaction trigger audit to assets/jobs.
DROP TRIGGER pilot_domain_audit ON apex.customer_records;
CREATE TRIGGER pilot_domain_audit AFTER INSERT OR UPDATE ON apex.customer_records
  FOR EACH ROW WHEN (NEW.kind IN ('crmOpportunities','projects','tickets','assets','jobs'))
  EXECUTE FUNCTION apex.capture_pilot_audit();
COMMIT;
