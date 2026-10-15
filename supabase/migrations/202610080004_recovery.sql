-- Existing accounts may need their e-mail added by an administrator.
ALTER TABLE portal.credentials ADD COLUMN email text;
ALTER TABLE portal.credentials ADD COLUMN email_verified boolean NOT NULL DEFAULT false;
ALTER TABLE portal.credentials ADD CONSTRAINT credentials_verified_email_check
  CHECK (NOT email_verified OR email IS NOT NULL);
ALTER TABLE portal.credentials ADD CONSTRAINT credentials_email_check
  CHECK (email IS NULL OR (
    email = lower(email) AND length(email) BETWEEN 3 AND 254
    AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    AND email !~ '[[:cntrl:]]'
  ));
CREATE UNIQUE INDEX credentials_email_unique
  ON portal.credentials(tenant_id,email) WHERE email IS NOT NULL;

-- Only SHA-256 digests are retained. The secret is delivered through e-mail.
CREATE TABLE portal.password_reset_tokens (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  tenant_id text NOT NULL,
  user_id text NOT NULL,
  password_version bigint NOT NULL CHECK (password_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  FOREIGN KEY(tenant_id,user_id) REFERENCES portal.credentials(tenant_id,user_id),
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '30 minutes')
);
CREATE INDEX password_reset_account_idx
  ON portal.password_reset_tokens(tenant_id,user_id);
ALTER TABLE portal.password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal.password_reset_tokens FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON portal.password_reset_tokens
  USING (tenant_id=current_setting('portal.tenant_id',true))
  WITH CHECK (tenant_id=current_setting('portal.tenant_id',true));
REVOKE ALL ON portal.password_reset_tokens FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='apice_runtime') THEN
    GRANT SELECT,INSERT,UPDATE ON portal.password_reset_tokens TO apice_runtime;
  END IF;
END $$;
