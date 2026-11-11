-- Phase 10.5C — append-only staging service event outbox.
-- This migration installs NO dispatcher, external webhook, worker or provider API.
-- All records stay internal, delivery permanently disabled by schema CHECK.
BEGIN;
INSERT INTO apex.schema_versions(version) VALUES ('10.5c-shadow-outbox');

CREATE TABLE apex.pilot_service_outbox (
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision>0),
  event_type TEXT NOT NULL DEFAULT 'service.work_order.changed'
    CHECK(event_type='service.work_order.changed'),
  event_data JSONB NOT NULL CHECK (
    jsonb_typeof(event_data)='object'
    AND event_data ?& ARRAY['orderId','revision','operation','status']
    AND jsonb_object_length(event_data)=4
  ),
  delivery_state TEXT NOT NULL DEFAULT 'PENDING_REVIEW'
    CHECK(delivery_state='PENDING_REVIEW'),
  delivery_enabled BOOLEAN NOT NULL DEFAULT FALSE CHECK(NOT delivery_enabled),
  delivery_attempts INTEGER NOT NULL DEFAULT 0 CHECK(delivery_attempts=0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,order_id,revision),
  FOREIGN KEY (tenant_id,customer_id,order_id)
    REFERENCES apex.pilot_service_work_orders(tenant_id,customer_id,order_id),
  FOREIGN KEY (tenant_id,order_id,revision)
    REFERENCES apex.pilot_service_work_order_events(tenant_id,order_id,revision)
);
ALTER TABLE apex.pilot_service_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE apex.pilot_service_outbox FORCE ROW LEVEL SECURITY;
CREATE POLICY pilot_service_outbox_owner_read ON apex.pilot_service_outbox
FOR SELECT TO apex_pilot_writer USING (
  apex.active_role(tenant_id)='BUSINESS_OWNER'
  AND apex.can_see_customer(tenant_id,customer_id)
);
GRANT SELECT ON apex.pilot_service_outbox TO apex_pilot_writer;
-- No INSERT/UPDATE/DELETE grants for app writer. No EXTERNAL delivery ability.

CREATE FUNCTION apex.capture_pilot_service_outbox()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,apex,pg_temp AS $outbox$
BEGIN
  IF apex.active_role(NEW.tenant_id) IS NULL
     OR NEW.changed_by_staff_id IS DISTINCT FROM
       nullif(current_setting('apex.actor_id',true),'') THEN
    RAISE EXCEPTION 'Signed service outbox actor required' USING ERRCODE='42501';
  END IF;
  INSERT INTO apex.pilot_service_outbox
    (tenant_id,customer_id,order_id,revision,event_data)
  VALUES (NEW.tenant_id,NEW.customer_id,NEW.order_id,NEW.revision,
    jsonb_build_object(
      'orderId',NEW.order_id,'revision',NEW.revision,
      'operation',NEW.operation,'status',NEW.next_status
    ));
  RETURN NEW;
END;
$outbox$;
REVOKE ALL ON FUNCTION apex.capture_pilot_service_outbox() FROM PUBLIC;
CREATE TRIGGER service_event_outbox_capture
AFTER INSERT ON apex.pilot_service_work_order_events
FOR EACH ROW EXECUTE FUNCTION apex.capture_pilot_service_outbox();
COMMIT;
