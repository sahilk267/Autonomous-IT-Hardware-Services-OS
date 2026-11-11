-- Phase 10.4A — local staging-only: quote/proposal/RMA links and procurement/finance drafts.
-- Never issues invoices, settles money, dispatches POs or confirms external provider/OEM work.
-- Apply only after PostgreSQL staging migrations 001-004.
BEGIN;
INSERT INTO apex.schema_versions(version) VALUES('10.4a-commerce-drafts');

CREATE POLICY pilot_quote_insert ON apex.customer_records
FOR INSERT TO apex_pilot_writer WITH CHECK (
  kind='quotes' AND
  apex.active_role(tenant_id) IN ('BUSINESS_OWNER','SALES_MANAGER','PROCUREMENT_LEAD')
  AND apex.can_see_customer(tenant_id,customer_id)
  AND created_by_staff_id=current_setting('apex.actor_id',true)
  AND payload->>'id'=source_id AND payload->>'customerId'=customer_id
  AND payload->>'status'='DRAFT'
  AND payload->>'taxStatus'='PENDING_CLASSIFICATION'
  AND payload->>'externalDispatch' IS NULL
  AND jsonb_typeof(payload->'subtotal')='number'
  AND (payload->>'subtotal')::numeric BETWEEN 0 AND 1000000000000
);

-- SECURITY DEFINER predicates avoid self-referential RLS on customer_records,
-- while checking the authenticated signed actor and actual linked-record permission.
CREATE FUNCTION apex.can_submit_linked_project(
  p_tenant TEXT,p_customer TEXT,p_project TEXT
) RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,apex,pg_temp AS $predicate$
DECLARE p apex.customer_records%ROWTYPE;
BEGIN
  IF NOT apex.can_see_customer(p_tenant,p_customer) THEN RETURN FALSE; END IF;
  SELECT * INTO p FROM apex.customer_records
  WHERE tenant_id=p_tenant AND customer_id=p_customer
    AND kind='projects' AND source_id=p_project;
  IF NOT FOUND OR p.payload->>'status'<>'PROPOSALS_OPEN' THEN RETURN FALSE; END IF;
  RETURN apex.can_see_record(p.tenant_id,p.customer_id,p.kind,p.source_id,
    p.created_by_staff_id,p.assigned_staff_id,p.reported_by_staff_id,
    p.related_kind,p.related_id);
END;
$predicate$;
REVOKE ALL ON FUNCTION apex.can_submit_linked_project(TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apex.can_submit_linked_project(TEXT,TEXT,TEXT) TO apex_pilot_writer;

CREATE FUNCTION apex.can_open_asset_rma(
  p_tenant TEXT,p_customer TEXT,p_asset TEXT
) RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,apex,pg_temp AS $predicate$
DECLARE a apex.customer_records%ROWTYPE; v_role TEXT;
BEGIN
  IF NOT apex.can_see_customer(p_tenant,p_customer) THEN RETURN FALSE; END IF;
  v_role:=apex.active_role(p_tenant);
  SELECT * INTO a FROM apex.customer_records
  WHERE tenant_id=p_tenant AND customer_id=p_customer
    AND kind='assets' AND source_id=p_asset;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  RETURN v_role IN ('BUSINESS_OWNER','ENTERPRISE_IT_HEAD') OR
    (v_role='FIELD_ENGINEER' AND a.assigned_staff_id=current_setting('apex.actor_id',true));
END;
$predicate$;
REVOKE ALL ON FUNCTION apex.can_open_asset_rma(TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apex.can_open_asset_rma(TEXT,TEXT,TEXT) TO apex_pilot_writer;

-- Linked proposal is not a verified external provider bid. Permission to submit
-- depends on actual access to the SAME customer project; FK in migration 001
-- enforces (tenant,customer,projects,projectId) integrity.
CREATE POLICY pilot_proposal_insert ON apex.customer_records
FOR INSERT TO apex_pilot_writer WITH CHECK (
  kind='proposals'
  AND apex.active_role(tenant_id) IN
    ('BUSINESS_OWNER','ENTERPRISE_IT_HEAD','SALES_MANAGER','PROCUREMENT_LEAD')
  AND apex.can_see_customer(tenant_id,customer_id)
  AND created_by_staff_id=current_setting('apex.actor_id',true)
  AND related_kind='projects' AND related_id IS NOT NULL
  AND payload->>'id'=source_id
  AND payload->>'customerId'=customer_id
  AND payload->>'projectId'=related_id
  AND payload->>'submittedByUserId'=created_by_staff_id
  AND payload->>'status'='SUBMITTED'
  AND payload->>'providerVerified'='false'
  AND apex.can_submit_linked_project(tenant_id,customer_id,related_id)
);

-- RMA intake is linked to an actual asset. External OEM approval, warranty
-- validity and replacement return are deliberately not self-assertable.
CREATE POLICY pilot_rma_insert ON apex.customer_records
FOR INSERT TO apex_pilot_writer WITH CHECK (
  kind='rmaClaims'
  AND apex.active_role(tenant_id) IN
    ('BUSINESS_OWNER','ENTERPRISE_IT_HEAD','FIELD_ENGINEER')
  AND apex.can_see_customer(tenant_id,customer_id)
  AND created_by_staff_id=current_setting('apex.actor_id',true)
  AND related_kind='assets' AND related_id IS NOT NULL
  AND payload->>'id'=source_id
  AND payload->>'customerId'=customer_id
  AND payload->>'assetId'=related_id
  AND payload->>'stage'='FAULT_LOGGED'
  AND payload->>'warrantyStatus'='UNVERIFIED'
  AND payload->>'oemCaseNumber'=''
  AND apex.can_open_asset_rma(tenant_id,customer_id,related_id)
);

-- Explicit internal procurement intake: not a purchase order and never dispatched.
CREATE TABLE apex.pilot_procurement_drafts (
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  draft_id TEXT NOT NULL,
  created_by_staff_id TEXT NOT NULL,
  product_name TEXT NOT NULL CHECK (length(trim(product_name)) BETWEEN 1 AND 180),
  required_qty INTEGER NOT NULL CHECK (required_qty BETWEEN 1 AND 100000),
  estimated_unit_cost NUMERIC(18,2) NOT NULL CHECK
    (estimated_unit_cost BETWEEN 0 AND 1000000000000),
  status TEXT NOT NULL DEFAULT 'REQUEST_DRAFT' CHECK (status='REQUEST_DRAFT'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,draft_id),
  FOREIGN KEY (tenant_id,customer_id) REFERENCES apex.customers,
  FOREIGN KEY (tenant_id,created_by_staff_id) REFERENCES apex.staff(tenant_id,staff_id)
);
ALTER TABLE apex.pilot_procurement_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE apex.pilot_procurement_drafts FORCE ROW LEVEL SECURITY;
CREATE POLICY procurement_draft_select ON apex.pilot_procurement_drafts
FOR SELECT TO apex_pilot_writer
USING (apex.active_role(tenant_id) IN ('BUSINESS_OWNER','PROCUREMENT_LEAD')
  AND apex.can_see_customer(tenant_id,customer_id));
CREATE POLICY procurement_draft_insert ON apex.pilot_procurement_drafts
FOR INSERT TO apex_pilot_writer
WITH CHECK (apex.active_role(tenant_id) IN ('BUSINESS_OWNER','PROCUREMENT_LEAD')
  AND apex.can_see_customer(tenant_id,customer_id)
  AND created_by_staff_id=current_setting('apex.actor_id',true));
GRANT SELECT,INSERT ON apex.pilot_procurement_drafts TO apex_pilot_writer;

-- Non-issuable finance preview references an actual same-customer DRAFT quote.
-- Not a tax invoice, payment request, bank instruction or settlement record.
CREATE TABLE apex.pilot_finance_previews (
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  preview_id TEXT NOT NULL,
  created_by_staff_id TEXT NOT NULL,
  quote_kind TEXT NOT NULL DEFAULT 'quotes' CHECK(quote_kind='quotes'),
  quote_id TEXT NOT NULL,
  subtotal NUMERIC(18,2) NOT NULL CHECK (subtotal BETWEEN 0 AND 1000000000000),
  status TEXT NOT NULL DEFAULT 'PREVIEW_UNISSUED' CHECK(status='PREVIEW_UNISSUED'),
  tax_status TEXT NOT NULL DEFAULT 'PENDING_CLASSIFICATION'
    CHECK(tax_status='PENDING_CLASSIFICATION'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,preview_id),
  UNIQUE (tenant_id,customer_id,quote_id),
  FOREIGN KEY (tenant_id,customer_id) REFERENCES apex.customers,
  FOREIGN KEY (tenant_id,created_by_staff_id) REFERENCES apex.staff(tenant_id,staff_id),
  FOREIGN KEY (tenant_id,customer_id,quote_kind,quote_id)
    REFERENCES apex.customer_records(tenant_id,customer_id,kind,source_id)
);
ALTER TABLE apex.pilot_finance_previews ENABLE ROW LEVEL SECURITY;
ALTER TABLE apex.pilot_finance_previews FORCE ROW LEVEL SECURITY;
CREATE POLICY finance_preview_select ON apex.pilot_finance_previews
FOR SELECT TO apex_pilot_writer
USING (apex.active_role(tenant_id)='BUSINESS_OWNER'
  AND apex.can_see_customer(tenant_id,customer_id));
CREATE POLICY finance_preview_insert ON apex.pilot_finance_previews
FOR INSERT TO apex_pilot_writer
WITH CHECK (apex.active_role(tenant_id)='BUSINESS_OWNER'
  AND apex.can_see_customer(tenant_id,customer_id)
  AND created_by_staff_id=current_setting('apex.actor_id',true));
GRANT SELECT,INSERT ON apex.pilot_finance_previews TO apex_pilot_writer;

-- Prevent an SQL caller from inventing an amount or relying on accepted/sent quotes.
CREATE FUNCTION apex.validate_finance_preview()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,apex,pg_temp AS $$
DECLARE v_quote JSONB;
BEGIN
  IF apex.active_role(NEW.tenant_id)<>'BUSINESS_OWNER' THEN
    RAISE EXCEPTION 'Authenticated owner context required';
  END IF;
  SELECT payload INTO v_quote FROM apex.customer_records
    WHERE tenant_id=NEW.tenant_id AND customer_id=NEW.customer_id
      AND kind='quotes' AND source_id=NEW.quote_id;
  IF v_quote IS NULL OR v_quote->>'status'<>'DRAFT'
     OR v_quote->>'taxStatus'<>'PENDING_CLASSIFICATION'
     OR jsonb_typeof(v_quote->'subtotal')<>'number'
     OR round((v_quote->>'subtotal')::numeric,2)<>NEW.subtotal THEN
    RAISE EXCEPTION 'Preview requires exact current unverified draft quotation subtotal';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION apex.validate_finance_preview() FROM PUBLIC;
CREATE TRIGGER finance_preview_validate
BEFORE INSERT ON apex.pilot_finance_previews FOR EACH ROW
EXECUTE FUNCTION apex.validate_finance_preview();

ALTER TABLE apex.pilot_audit_events
DROP CONSTRAINT pilot_audit_events_entity_check;
ALTER TABLE apex.pilot_audit_events
ADD CONSTRAINT pilot_audit_events_entity_check CHECK (
  entity IN ('customers','customer_grants','customer_records','project_shares',
             'pilot_procurement_drafts','pilot_finance_previews')
);

CREATE FUNCTION apex.capture_draft_audit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,apex,pg_temp AS $$
DECLARE v_id TEXT;
BEGIN
  IF apex.active_role(NEW.tenant_id) IS NULL
     OR NEW.created_by_staff_id IS DISTINCT FROM current_setting('apex.actor_id',true) THEN
    RAISE EXCEPTION 'Authenticated draft author mismatch';
  END IF;
  IF TG_TABLE_NAME='pilot_procurement_drafts' THEN
    v_id:=NEW.draft_id;
  ELSIF TG_TABLE_NAME='pilot_finance_previews' THEN
    v_id:=NEW.preview_id;
  ELSE
    RAISE EXCEPTION 'Unknown draft ledger';
  END IF;
  INSERT INTO apex.pilot_audit_events
    (tenant_id,event_id,actor_staff_id,operation,entity,object_id,customer_id,kind)
  VALUES (NEW.tenant_id,'pilot-'||gen_random_uuid()::text,
    NEW.created_by_staff_id,'INSERT',TG_TABLE_NAME,v_id,NEW.customer_id,'internal_draft');
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION apex.capture_draft_audit() FROM PUBLIC;
CREATE TRIGGER procurement_draft_audit AFTER INSERT ON apex.pilot_procurement_drafts
FOR EACH ROW EXECUTE FUNCTION apex.capture_draft_audit();
CREATE TRIGGER finance_preview_audit AFTER INSERT ON apex.pilot_finance_previews
FOR EACH ROW EXECUTE FUNCTION apex.capture_draft_audit();

-- Existing records now audited for proposal, RMA and quote INSERT as well;
-- no artificial OEM approval or payment settlement update route is granted.
DROP TRIGGER pilot_domain_audit ON apex.customer_records;
CREATE TRIGGER pilot_domain_audit AFTER INSERT OR UPDATE ON apex.customer_records
FOR EACH ROW WHEN (NEW.kind IN (
  'crmOpportunities','projects','tickets','assets','jobs','quotes','proposals','rmaClaims'))
EXECUTE FUNCTION apex.capture_pilot_audit();
COMMIT;
