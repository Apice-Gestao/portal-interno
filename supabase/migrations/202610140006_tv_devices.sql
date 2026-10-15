-- TV identities are independent from personal accounts. Opaque credentials
-- are stored only as hashes, never in the configuration payload or audit.
CREATE TABLE portal.tv_devices (
  tenant_id text NOT NULL REFERENCES portal.tenants(id),
  id uuid NOT NULL,
  payload jsonb NOT NULL,
  pair_hash text UNIQUE CHECK (pair_hash IS NULL OR pair_hash ~ '^[0-9a-f]{64}$'),
  pair_expires_at timestamptz,
  token_hash text UNIQUE CHECK (token_hash IS NULL OR token_hash ~ '^[0-9a-f]{64}$'),
  token_expires_at timestamptz,
  paired_at timestamptz,
  PRIMARY KEY(tenant_id,id),
  CHECK (payload->>'tenantId'=tenant_id AND payload->>'id'=id::text),
  CHECK (length(payload->>'name') BETWEEN 2 AND 60),
  CHECK (payload ?& ARRAY['id','tenantId','name','departments','competence','active','showNames','blocks','rotationSeconds','version','createdAt','updatedAt']),
  CHECK (jsonb_typeof(payload->'departments')='array'
    AND jsonb_array_length(payload->'departments') BETWEEN 1 AND 3
    AND payload->'departments' <@ '["Fiscal","Contábil","Pessoal"]'::jsonb),
  CHECK (payload->>'competence' ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CHECK (jsonb_typeof(payload->'active')='boolean'
    AND jsonb_typeof(payload->'showNames')='boolean'),
  CHECK (jsonb_typeof(payload->'blocks')='array'
    AND jsonb_array_length(payload->'blocks') BETWEEN 1 AND 5
    AND payload->'blocks' <@ '["progress","deadlines","obligations","deliveries","upcoming"]'::jsonb),
  CHECK ((payload->>'rotationSeconds')::integer BETWEEN 5 AND 60),
  CHECK ((payload->>'version')::integer > 0),
  CHECK ((pair_hash IS NULL) = (pair_expires_at IS NULL)),
  CHECK ((token_hash IS NULL) = (token_expires_at IS NULL)),
  CHECK (pair_hash IS NULL OR token_hash IS NULL)
);
ALTER TABLE portal.tv_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal.tv_devices FORCE ROW LEVEL SECURITY;
-- Public endpoints can resolve precisely one presented credential. They do not
-- supply tenant/device IDs, and all mutations require the resolved tenant.
CREATE POLICY tv_read ON portal.tv_devices FOR SELECT USING (
  tenant_id=current_setting('portal.tenant_id',true)
  OR pair_hash=current_setting('portal.tv_pair_hash',true)
  OR token_hash=current_setting('portal.tv_token_hash',true)
);
CREATE POLICY tv_insert ON portal.tv_devices FOR INSERT
  WITH CHECK (tenant_id=current_setting('portal.tenant_id',true));
CREATE POLICY tv_update ON portal.tv_devices FOR UPDATE
  USING (tenant_id=current_setting('portal.tenant_id',true))
  WITH CHECK (tenant_id=current_setting('portal.tenant_id',true));
REVOKE ALL ON portal.tv_devices FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='apice_runtime') THEN
    GRANT SELECT,INSERT,UPDATE ON portal.tv_devices TO apice_runtime;
  END IF;
END $$;
