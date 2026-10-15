-- Local password identity. Private to NestJS; never exposed through the Data API.
ALTER TABLE portal.users DROP CONSTRAINT users_role_check;
ALTER TABLE portal.users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin','supervisor','coordinator','operator','viewer'));
CREATE TABLE portal.credentials (
  tenant_id text NOT NULL, user_id text NOT NULL,
  login text NOT NULL, password_hash text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  must_change_password boolean NOT NULL DEFAULT true,
  password_version bigint NOT NULL DEFAULT 1 CHECK (password_version > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,user_id),
  FOREIGN KEY(tenant_id,user_id) REFERENCES portal.users(tenant_id,id),
  CHECK (login = lower(login) AND login ~ '^[a-z0-9][a-z0-9._@-]{2,79}$'),
  CHECK (password_hash ~ '^scrypt\$32768\$8\$3\$[0-9a-f]{64}\$[0-9a-f]{128}$'),
  UNIQUE(tenant_id,login)
);
ALTER TABLE portal.credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal.credentials FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON portal.credentials
  USING (tenant_id = current_setting('portal.tenant_id',true))
  WITH CHECK (tenant_id = current_setting('portal.tenant_id',true));
REVOKE ALL ON portal.credentials FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'apice_runtime') THEN
    GRANT SELECT, INSERT, UPDATE ON portal.credentials TO apice_runtime;
  END IF;
END $$;
