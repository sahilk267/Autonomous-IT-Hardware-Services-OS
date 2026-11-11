-- Phase L Stage 3: tenant-owned normalized critical ledgers.
-- Apply as the separate schema owner. Runtime role MUST NOT own these tables.
-- This migration is intentionally additive. Existing workspace JSONB data
-- must be audited/backfilled before Stage 3 runtime can start.
BEGIN;

CREATE TABLE apex_catalog_products (
  tenant_id uuid NOT NULL REFERENCES apex_tenants(id) ON DELETE RESTRICT,
  product_id text NOT NULL CHECK (length(product_id) BETWEEN 1 AND 256),
  sku text NOT NULL CHECK (length(btrim(sku)) BETWEEN 1 AND 128),
  display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 256),
  stock_available bigint NOT NULL DEFAULT 0 CHECK (stock_available >= 0),
  stock_reserved bigint NOT NULL DEFAULT 0 CHECK (stock_reserved >= 0 AND stock_reserved <= stock_available),
  purchase_cost numeric(18,2) NOT NULL DEFAULT 0 CHECK (purchase_cost >= 0),
  selling_price numeric(18,2) NOT NULL DEFAULT 0 CHECK (selling_price >= 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, product_id),
  CONSTRAINT apex_catalog_tenant_payload CHECK (
    payload->>'tenantId' = tenant_id::text AND payload->>'id' = product_id
  )
);
CREATE UNIQUE INDEX apex_catalog_sku_unique ON apex_catalog_products(tenant_id, lower(sku));

CREATE TABLE apex_finance_invoices (
  tenant_id uuid NOT NULL REFERENCES apex_tenants(id) ON DELETE RESTRICT,
  invoice_no text NOT NULL CHECK (length(btrim(invoice_no)) BETWEEN 1 AND 128),
  invoice_id text CHECK (invoice_id IS NULL OR length(invoice_id) BETWEEN 1 AND 256),
  customer text NOT NULL CHECK (length(btrim(customer)) BETWEEN 1 AND 256),
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  status text NOT NULL CHECK (status IN ('ACTIVE', 'DUE_SOON', 'OVERDUE', 'SETTLED', 'CANCELLED')),
  settled_at timestamptz,
  payment_reference text,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, invoice_no),
  CONSTRAINT apex_invoice_settled_timestamp CHECK ((status = 'SETTLED') = (settled_at IS NOT NULL)),
  CONSTRAINT apex_invoice_payload_identity CHECK (
    payload->>'tenantId' = tenant_id::text AND payload->>'invoiceNo' = invoice_no
  )
);
CREATE UNIQUE INDEX apex_invoices_id_unique ON apex_finance_invoices(tenant_id, invoice_id)
  WHERE invoice_id IS NOT NULL;
CREATE UNIQUE INDEX apex_invoices_payment_reference_unique
  ON apex_finance_invoices(tenant_id, payment_reference)
  WHERE payment_reference IS NOT NULL;

CREATE OR REPLACE FUNCTION apex_invoice_settlement_immutability()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'SETTLED' AND (
    NEW.status <> 'SETTLED' OR NEW.amount <> OLD.amount OR NEW.customer <> OLD.customer OR
    NEW.invoice_no <> OLD.invoice_no OR NEW.settled_at IS DISTINCT FROM OLD.settled_at OR
    NEW.payment_reference IS DISTINCT FROM OLD.payment_reference
  ) THEN
    RAISE EXCEPTION 'Settled invoice financial details cannot be changed';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER apex_invoice_finality
BEFORE UPDATE ON apex_finance_invoices
FOR EACH ROW EXECUTE FUNCTION apex_invoice_settlement_immutability();

CREATE TABLE apex_invoice_settlements (
  tenant_id uuid NOT NULL,
  invoice_no text NOT NULL,
  settled_amount numeric(18,2) NOT NULL CHECK (settled_amount > 0),
  payment_reference text,
  settled_at timestamptz NOT NULL,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, invoice_no),
  FOREIGN KEY (tenant_id, invoice_no) REFERENCES apex_finance_invoices(tenant_id, invoice_no) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, actor_id) REFERENCES apex_memberships(tenant_id, user_id) ON DELETE SET NULL (actor_id)
);

CREATE TABLE apex_inventory_movements (
  tenant_id uuid NOT NULL,
  movement_id text NOT NULL CHECK (length(movement_id) BETWEEN 1 AND 256),
  product_id text NOT NULL,
  movement_type text NOT NULL CHECK (movement_type IN ('IN', 'OUT', 'RESERVE', 'RELEASE')),
  qty bigint NOT NULL CHECK (qty > 0),
  previous_stock bigint NOT NULL CHECK (previous_stock >= 0),
  new_stock bigint NOT NULL CHECK (new_stock >= 0),
  reference_id text,
  occurred_at timestamptz NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  PRIMARY KEY (tenant_id, movement_id),
  FOREIGN KEY (tenant_id, product_id) REFERENCES apex_catalog_products(tenant_id, product_id) ON DELETE RESTRICT,
  CONSTRAINT apex_movement_math CHECK (
    (movement_type = 'IN' AND new_stock = previous_stock + qty) OR
    (movement_type = 'OUT' AND new_stock = previous_stock - qty) OR
    (movement_type IN ('RESERVE', 'RELEASE') AND new_stock = previous_stock)
  ),
  CONSTRAINT apex_movement_payload_tenant CHECK (
    payload->>'tenantId' = tenant_id::text AND payload->>'id' = movement_id
  )
);
CREATE INDEX apex_inventory_movement_product_time
  ON apex_inventory_movements(tenant_id, product_id, occurred_at DESC);

CREATE TABLE apex_finance_quotes (
  tenant_id uuid NOT NULL REFERENCES apex_tenants(id) ON DELETE RESTRICT,
  quote_id text NOT NULL CHECK (length(quote_id) BETWEEN 1 AND 256),
  quote_no text NOT NULL CHECK (length(btrim(quote_no)) BETWEEN 1 AND 128),
  customer_name text NOT NULL CHECK (length(btrim(customer_name)) BETWEEN 1 AND 256),
  status text NOT NULL CHECK (status IN (
    'DRAFT', 'PENDING_OWNER_APPROVAL', 'APPROVED', 'SENT_TO_CUSTOMER',
    'ACCEPTED', 'REJECTED', 'PENDING_APPROVAL'
  )),
  grand_total numeric(18,2) NOT NULL CHECK (grand_total >= 0),
  margin_percent numeric(8,3) NOT NULL CHECK (margin_percent BETWEEN -1000 AND 100),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, quote_id),
  CONSTRAINT apex_quote_payload_tenant CHECK (
    payload->>'tenantId' = tenant_id::text AND payload->>'id' = quote_id
  )
);
CREATE UNIQUE INDEX apex_quote_number_unique ON apex_finance_quotes(tenant_id, quote_no);

-- A tenant must be explicitly marked as backfilled before normalized ledgers
-- become authoritative for the Stage 3 Express runtime.
CREATE TABLE apex_critical_ledger_ready (
  tenant_id uuid PRIMARY KEY REFERENCES apex_tenants(id) ON DELETE RESTRICT,
  schema_version smallint NOT NULL CHECK (schema_version = 3),
  verified_at timestamptz NOT NULL DEFAULT now(),
  source_revision bigint NOT NULL DEFAULT 0 CHECK (source_revision >= 0)
);

ALTER TABLE apex_catalog_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE apex_catalog_products FORCE ROW LEVEL SECURITY;
ALTER TABLE apex_finance_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE apex_finance_invoices FORCE ROW LEVEL SECURITY;
ALTER TABLE apex_invoice_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE apex_invoice_settlements FORCE ROW LEVEL SECURITY;
ALTER TABLE apex_inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE apex_inventory_movements FORCE ROW LEVEL SECURITY;
ALTER TABLE apex_finance_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE apex_finance_quotes FORCE ROW LEVEL SECURITY;
ALTER TABLE apex_critical_ledger_ready ENABLE ROW LEVEL SECURITY;
ALTER TABLE apex_critical_ledger_ready FORCE ROW LEVEL SECURITY;

CREATE POLICY apex_catalog_scope ON apex_catalog_products FOR ALL
  USING (tenant_id = NULLIF(current_setting('apex.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('apex.tenant_id', true), '')::uuid);
CREATE POLICY apex_invoices_scope ON apex_finance_invoices FOR ALL
  USING (tenant_id = NULLIF(current_setting('apex.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('apex.tenant_id', true), '')::uuid);
CREATE POLICY apex_settlement_read ON apex_invoice_settlements FOR SELECT
  USING (tenant_id = NULLIF(current_setting('apex.tenant_id', true), '')::uuid);
CREATE POLICY apex_settlement_append ON apex_invoice_settlements FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('apex.tenant_id', true), '')::uuid);
CREATE POLICY apex_movements_read ON apex_inventory_movements FOR SELECT
  USING (tenant_id = NULLIF(current_setting('apex.tenant_id', true), '')::uuid);
CREATE POLICY apex_movements_append ON apex_inventory_movements FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('apex.tenant_id', true), '')::uuid);
CREATE POLICY apex_quotes_scope ON apex_finance_quotes FOR ALL
  USING (tenant_id = NULLIF(current_setting('apex.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('apex.tenant_id', true), '')::uuid);
CREATE POLICY apex_ledger_ready_scope ON apex_critical_ledger_ready FOR SELECT
  USING (tenant_id = NULLIF(current_setting('apex.tenant_id', true), '')::uuid);
CREATE POLICY apex_ledger_ready_initial ON apex_critical_ledger_ready FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('apex.tenant_id', true), '')::uuid);

-- A database-level guard forbids incorrectly marking a legacy business
-- workspace as normalized merely because the runtime role can INSERT.
CREATE OR REPLACE FUNCTION apex_guard_initial_ledger_ready()
RETURNS trigger LANGUAGE plpgsql AS $
DECLARE old_workspace jsonb;
BEGIN
  SELECT payload INTO old_workspace FROM apex_records
    WHERE tenant_id=NEW.tenant_id AND record_type='workspace_state' AND record_id='current';
  IF old_workspace IS NOT NULL AND (
      coalesce(jsonb_array_length(old_workspace->'products'),0) > 0 OR
      coalesce(jsonb_array_length(old_workspace->'invoices'),0) > 0 OR
      coalesce(jsonb_array_length(old_workspace->'inventoryTransactions'),0) > 0 OR
      coalesce(jsonb_array_length(old_workspace->'quotes'),0) > 0
  ) THEN
    RAISE EXCEPTION 'Legacy workspace contains unbackfilled critical records';
  END IF;
  RETURN NEW;
END $;
CREATE TRIGGER apex_guard_initial_ledger_ready
BEFORE INSERT ON apex_critical_ledger_ready
FOR EACH ROW EXECUTE FUNCTION apex_guard_initial_ledger_ready();

-- Even a misconfigured app grant should fail to rewrite settled transactions
-- and movements: no UPDATE or DELETE policies on append-only tables.
COMMIT;
