-- Mandatory e-mail verification follows the password stage for every account.
CREATE TABLE portal.email_mfa_challenges (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  tenant_id text NOT NULL,
  user_id text NOT NULL,
  password_version bigint NOT NULL CHECK (password_version > 0),
  pending_email text,
  code_hash text CHECK (code_hash IS NULL OR code_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_sent_at timestamptz,
  sends integer NOT NULL DEFAULT 0 CHECK (sends BETWEEN 0 AND 3),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  delivery_pending boolean NOT NULL DEFAULT false,
  consumed_at timestamptz,
  FOREIGN KEY(tenant_id,user_id) REFERENCES portal.credentials(tenant_id,user_id),
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '5 minutes'),
  CHECK (pending_email IS NULL OR (
    pending_email=lower(pending_email) AND length(pending_email) BETWEEN 3 AND 254
    AND pending_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    AND pending_email !~ '[[:cntrl:]]'
  ))
);
CREATE INDEX email_mfa_account_idx ON portal.email_mfa_challenges(tenant_id,user_id,created_at DESC);
ALTER TABLE portal.email_mfa_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal.email_mfa_challenges FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON portal.email_mfa_challenges
  USING (tenant_id=current_setting('portal.tenant_id',true))
  WITH CHECK (tenant_id=current_setting('portal.tenant_id',true));
REVOKE ALL ON portal.email_mfa_challenges FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='apice_runtime') THEN
    GRANT SELECT,INSERT,UPDATE ON portal.email_mfa_challenges TO apice_runtime;
  END IF;
END $$;
