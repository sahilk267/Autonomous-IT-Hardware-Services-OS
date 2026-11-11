-- Phase 10.5B — first normalized customer-bound service work-order slice.
-- Disposable PostgreSQL staging ONLY, no JSON runtime cutover or customer execution.
-- Install after migrations 001–006.
BEGIN;
INSERT INTO apex.schema_versions(version) VALUES ('10.5b-normalized-service');

CREATE TABLE apex.pilot_service_work_orders (
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 180),
  created_by_staff_id TEXT NOT NULL,
  assigned_staff_id TEXT,
  status TEXT NOT NULL DEFAULT 'SCHEDULED'
    CHECK (status IN ('SCHEDULED','EN_ROUTE','CHECKED_IN','DIAGNOSING')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,order_id),
  UNIQUE (tenant_id,customer_id,order_id),
  FOREIGN KEY (tenant_id,customer_id) REFERENCES apex.customers(tenant_id,customer_id),
  FOREIGN KEY (tenant_id,created_by_staff_id) REFERENCES apex.staff(tenant_id,staff_id),
  FOREIGN KEY (tenant_id,assigned_staff_id) REFERENCES apex.staff(tenant_id,staff_id)
);
CREATE INDEX pilot_service_work_orders_customer_index
  ON apex.pilot_service_work_orders(tenant_id,customer_id,status);
ALTER TABLE apex.pilot_service_work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE apex.pilot_service_work_orders FORCE ROW LEVEL SECURITY;
CREATE POLICY service_order_read ON apex.pilot_service_work_orders
FOR SELECT TO apex_pilot_writer USING (
  apex.can_see_customer(tenant_id,customer_id)
  AND (apex.active_role(tenant_id) IN ('BUSINESS_OWNER','ENTERPRISE_IT_HEAD')
    OR (apex.active_role(tenant_id)='FIELD_ENGINEER'
      AND assigned_staff_id=current_setting('apex.actor_id',true)))
);
CREATE POLICY service_order_insert ON apex.pilot_service_work_orders
FOR INSERT TO apex_pilot_writer WITH CHECK (
  apex.can_see_customer(tenant_id,customer_id)
  AND apex.active_role(tenant_id) IN ('BUSINESS_OWNER','ENTERPRISE_IT_HEAD')
  AND created_by_staff_id=current_setting('apex.actor_id',true)
  AND assigned_staff_id IS NULL AND status='SCHEDULED' AND revision=1
);
CREATE POLICY service_order_update ON apex.pilot_service_work_orders
FOR UPDATE TO apex_pilot_writer
USING (
  apex.can_see_customer(tenant_id,customer_id)
  AND (apex.active_role(tenant_id) IN ('BUSINESS_OWNER','ENTERPRISE_IT_HEAD')
    OR (apex.active_role(tenant_id)='FIELD_ENGINEER'
      AND assigned_staff_id=current_setting('apex.actor_id',true)))
)
WITH CHECK (
  apex.can_see_customer(tenant_id,customer_id)
  AND (apex.active_role(tenant_id) IN ('BUSINESS_OWNER','ENTERPRISE_IT_HEAD')
    OR (apex.active_role(tenant_id)='FIELD_ENGINEER'
      AND assigned_staff_id=current_setting('apex.actor_id',true)))
);
GRANT SELECT ON apex.pilot_service_work_orders TO apex_pilot_writer;
GRANT INSERT (tenant_id,customer_id,order_id,title,created_by_staff_id)
  ON apex.pilot_service_work_orders TO apex_pilot_writer;
GRANT UPDATE (status,assigned_staff_id)
  ON apex.pilot_service_work_orders TO apex_pilot_writer;

-- This is a normalized relational, append-only progress ledger, not the
-- external customer acceptance, parts consumption or legal work-signoff ledger.
CREATE TABLE apex.pilot_service_work_order_events (
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision>0),
  changed_by_staff_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK(operation IN ('CREATE','ASSIGN','PROGRESS')),
  previous_status TEXT,
  next_status TEXT NOT NULL
    CHECK(next_status IN ('SCHEDULED','EN_ROUTE','CHECKED_IN','DIAGNOSING')),
  assigned_staff_id TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,order_id,revision),
  FOREIGN KEY (tenant_id,customer_id,order_id)
    REFERENCES apex.pilot_service_work_orders(tenant_id,customer_id,order_id),
  FOREIGN KEY (tenant_id,changed_by_staff_id)
    REFERENCES apex.staff(tenant_id,staff_id)
);
ALTER TABLE apex.pilot_service_work_order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE apex.pilot_service_work_order_events FORCE ROW LEVEL SECURITY;
CREATE POLICY service_order_event_owner ON apex.pilot_service_work_order_events
FOR SELECT TO apex_pilot_writer USING (
  apex.active_role(tenant_id)='BUSINESS_OWNER'
  AND apex.can_see_customer(tenant_id,customer_id)
);
GRANT SELECT ON apex.pilot_service_work_order_events TO apex_pilot_writer;

CREATE FUNCTION apex.validate_pilot_service_order_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,apex,pg_temp AS $service$
DECLARE v_role TEXT;
BEGIN
  v_role:=apex.active_role(OLD.tenant_id);
  IF v_role IS NULL OR NOT apex.can_see_customer(OLD.tenant_id,OLD.customer_id) THEN
    RAISE EXCEPTION 'Signed service work-order context required' USING ERRCODE='42501';
  END IF;
  IF (NEW.tenant_id,NEW.customer_id,NEW.order_id,NEW.title,
      NEW.created_by_staff_id,NEW.created_at) IS DISTINCT FROM
     (OLD.tenant_id,OLD.customer_id,OLD.order_id,OLD.title,
      OLD.created_by_staff_id,OLD.created_at) THEN
    RAISE EXCEPTION 'Work-order identity fields are immutable' USING ERRCODE='42501';
  END IF;
  -- All updates increment exactly once inside the DB, never from the HTTP caller.
  IF NEW.revision<>OLD.revision THEN
    RAISE EXCEPTION 'Direct revision edits are forbidden' USING ERRCODE='42501';
  END IF;
  IF NEW.assigned_staff_id IS DISTINCT FROM OLD.assigned_staff_id THEN
    IF v_role NOT IN ('BUSINESS_OWNER','ENTERPRISE_IT_HEAD') THEN
      RAISE EXCEPTION 'Only managers assign field work orders' USING ERRCODE='42501';
    END IF;
    IF NEW.assigned_staff_id IS NOT NULL AND
       NOT apex.is_active_customer_field_staff(OLD.tenant_id,
         OLD.customer_id,NEW.assigned_staff_id) THEN
      RAISE EXCEPTION 'Engineer must have active customer grant' USING ERRCODE='42501';
    END IF;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.assigned_staff_id IS NULL THEN
      RAISE EXCEPTION 'Assign an engineer before recording progress'
        USING ERRCODE='23514';
    END IF;
    IF NOT (
      (OLD.status='SCHEDULED' AND NEW.status='EN_ROUTE') OR
      (OLD.status='EN_ROUTE' AND NEW.status='CHECKED_IN') OR
      (OLD.status='CHECKED_IN' AND NEW.status='DIAGNOSING')
    ) THEN
      RAISE EXCEPTION 'Unverified or out-of-order service transition'
        USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.status IS NOT DISTINCT FROM OLD.status AND
     NEW.assigned_staff_id IS NOT DISTINCT FROM OLD.assigned_staff_id THEN
    RAISE EXCEPTION 'No-op work-order update forbidden' USING ERRCODE='23514';
  END IF;
  NEW.revision:=OLD.revision+1;
  NEW.changed_at:=clock_timestamp();
  RETURN NEW;
END;
$service$;
REVOKE ALL ON FUNCTION apex.validate_pilot_service_order_update() FROM PUBLIC;
CREATE TRIGGER service_order_validate
BEFORE UPDATE ON apex.pilot_service_work_orders FOR EACH ROW
EXECUTE FUNCTION apex.validate_pilot_service_order_update();

ALTER TABLE apex.pilot_audit_events DROP CONSTRAINT pilot_audit_events_entity_check;
ALTER TABLE apex.pilot_audit_events ADD CONSTRAINT pilot_audit_events_entity_check
CHECK(entity IN ('customers','customer_grants','customer_records','project_shares',
  'pilot_procurement_drafts','pilot_finance_previews','pilot_service_work_orders'));

CREATE FUNCTION apex.capture_pilot_service_order_event()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,apex,pg_temp AS $event$
DECLARE
  v_actor TEXT := nullif(current_setting('apex.actor_id',true),'');
  v_operation TEXT;
BEGIN
  IF apex.active_role(NEW.tenant_id) IS NULL OR v_actor IS NULL THEN
    RAISE EXCEPTION 'Signed service event context required' USING ERRCODE='42501';
  END IF;
  IF TG_OP='INSERT' THEN
    v_operation:='CREATE';
  ELSIF NEW.assigned_staff_id IS DISTINCT FROM OLD.assigned_staff_id THEN
    v_operation:='ASSIGN';
  ELSE
    v_operation:='PROGRESS';
  END IF;
  INSERT INTO apex.pilot_service_work_order_events
    (tenant_id,customer_id,order_id,revision,changed_by_staff_id,operation,
      previous_status,next_status,assigned_staff_id)
  VALUES(NEW.tenant_id,NEW.customer_id,NEW.order_id,NEW.revision,v_actor,
    v_operation,CASE WHEN TG_OP='INSERT' THEN NULL ELSE OLD.status END,
    NEW.status,NEW.assigned_staff_id);
  INSERT INTO apex.pilot_audit_events
    (tenant_id,event_id,actor_staff_id,operation,entity,object_id,customer_id,kind)
  VALUES(NEW.tenant_id,'pilot-'||gen_random_uuid()::text,v_actor,TG_OP,
    'pilot_service_work_orders',NEW.order_id,NEW.customer_id,'normalized_service');
  RETURN NEW;
END;
$event$;
REVOKE ALL ON FUNCTION apex.capture_pilot_service_order_event() FROM PUBLIC;
CREATE TRIGGER service_order_event AFTER INSERT OR UPDATE
ON apex.pilot_service_work_orders FOR EACH ROW
EXECUTE FUNCTION apex.capture_pilot_service_order_event();
COMMIT;
