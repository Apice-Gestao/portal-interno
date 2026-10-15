-- PostgreSQL 15+; portable to Supabase. The portal schema is private to NestJS.
CREATE SCHEMA IF NOT EXISTS portal;
REVOKE ALL ON SCHEMA portal FROM PUBLIC;
CREATE TABLE portal.tenants (id text PRIMARY KEY, name text NOT NULL);
CREATE TABLE portal.users (
  tenant_id text NOT NULL REFERENCES portal.tenants(id), id text NOT NULL,
  payload jsonb NOT NULL,
  role text GENERATED ALWAYS AS (payload->>'role') STORED NOT NULL,
  PRIMARY KEY(tenant_id,id),
  CHECK (role IN ('admin','coordinator','operator','viewer')),
  CHECK (payload->>'tenantId' = tenant_id AND payload->>'userId' = id),
  CHECK (jsonb_typeof(payload->'departments') = 'array')
);
CREATE TABLE portal.companies (
  tenant_id text NOT NULL REFERENCES portal.tenants(id), id text NOT NULL,
  payload jsonb NOT NULL,
  code text GENERATED ALWAYS AS (payload->>'code') STORED NOT NULL,
  cnpj text GENERATED ALWAYS AS (payload->>'cnpj') STORED NOT NULL,
  owner_id text GENERATED ALWAYS AS (payload->>'ownerId') STORED NOT NULL,
  PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,code), UNIQUE(tenant_id,cnpj),
  FOREIGN KEY(tenant_id,owner_id) REFERENCES portal.users(tenant_id,id),
  CHECK (payload->>'tenantId' = tenant_id AND payload->>'id' = id)
);
CREATE TABLE portal.templates (
  tenant_id text NOT NULL REFERENCES portal.tenants(id), id text NOT NULL,
  payload jsonb NOT NULL,
  department text GENERATED ALWAYS AS (payload->>'department') STORED NOT NULL,
  PRIMARY KEY(tenant_id,id),
  CHECK (payload->>'tenantId' = tenant_id AND payload->>'id' = id),
  CHECK (department IN ('Fiscal','Contábil','Pessoal'))
);
CREATE TABLE portal.tasks (
  tenant_id text NOT NULL REFERENCES portal.tenants(id), id text NOT NULL,
  payload jsonb NOT NULL,
  company_id text GENERATED ALWAYS AS (payload->>'companyId') STORED NOT NULL,
  template_id text GENERATED ALWAYS AS (nullif(payload->>'templateId','avulsa')) STORED,
  department text GENERATED ALWAYS AS (payload->>'department') STORED NOT NULL,
  competence text GENERATED ALWAYS AS (payload->>'competence') STORED NOT NULL,
  assignee_id text GENERATED ALWAYS AS (payload->>'assigneeId') STORED NOT NULL,
  status text GENERATED ALWAYS AS (payload->>'status') STORED NOT NULL,
  legal_due text GENERATED ALWAYS AS (payload->>'legalDue') STORED NOT NULL,
  revision integer GENERATED ALWAYS AS ((payload->>'revision')::integer) STORED NOT NULL,
  PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,company_id,template_id,competence),
  FOREIGN KEY(tenant_id,company_id) REFERENCES portal.companies(tenant_id,id),
  FOREIGN KEY(tenant_id,template_id) REFERENCES portal.templates(tenant_id,id),
  FOREIGN KEY(tenant_id,assignee_id) REFERENCES portal.users(tenant_id,id),
  CHECK (payload->>'tenantId' = tenant_id AND payload->>'id' = id),
  CHECK (revision > 0 AND department IN ('Fiscal','Contábil','Pessoal')),
  CHECK (status IN ('todo','in_progress','in_review','returned','waiting','done','dispensed')),
  CHECK (competence ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CHECK (payload->>'internalDue' <= payload->>'legalDue'),
  CHECK (jsonb_typeof(payload->'steps') = 'array'),
  CHECK (NOT payload ? 'documents')
);
CREATE INDEX tasks_scope ON portal.tasks(tenant_id,department,competence,status,legal_due);
CREATE INDEX tasks_owner ON portal.tasks(tenant_id,assignee_id,competence);
CREATE TABLE portal.documents (
  tenant_id text NOT NULL, id text NOT NULL, task_id text NOT NULL,
  payload jsonb NOT NULL, content bytea NOT NULL,
  version integer GENERATED ALWAYS AS ((payload->>'version')::integer) STORED NOT NULL,
  declared_bytes integer GENERATED ALWAYS AS ((payload->>'bytes')::integer) STORED NOT NULL,
  author_id text GENERATED ALWAYS AS (payload->>'authorId') STORED NOT NULL,
  PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,task_id,version),
  FOREIGN KEY(tenant_id,task_id) REFERENCES portal.tasks(tenant_id,id),
  FOREIGN KEY(tenant_id,author_id) REFERENCES portal.users(tenant_id,id),
  CHECK (version > 0 AND octet_length(content) BETWEEN 1 AND 5242880),
  CHECK (declared_bytes = octet_length(content)),
  CHECK (payload->>'id' = id),
  CHECK (payload->>'kind' IN ('PDF','XML')),
  CHECK (payload->>'validation' IN ('accepted','rejected')),
  CHECK (payload->>'hash' ~ '^[0-9a-f]{64}$')
);
CREATE TABLE portal.audit (
  sequence bigint GENERATED ALWAYS AS IDENTITY,
  tenant_id text NOT NULL REFERENCES portal.tenants(id), id text NOT NULL,
  payload jsonb NOT NULL,
  PRIMARY KEY(tenant_id,id),
  CHECK (payload->>'tenantId' = tenant_id AND payload->>'id' = id)
);
CREATE INDEX audit_order ON portal.audit(tenant_id,sequence DESC);
CREATE FUNCTION portal.reject_mutation() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog AS $$ BEGIN RAISE EXCEPTION 'Append-only record'; END $$;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON portal.audit
FOR EACH ROW EXECUTE FUNCTION portal.reject_mutation();
CREATE TRIGGER document_append_only BEFORE UPDATE OR DELETE ON portal.documents
FOR EACH ROW EXECUTE FUNCTION portal.reject_mutation();
DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['users','companies','templates','tasks','documents','audit'] LOOP
    EXECUTE format('ALTER TABLE portal.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE portal.%I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY tenant_scope ON portal.%I USING (tenant_id = current_setting(''portal.tenant_id'',true)) WITH CHECK (tenant_id = current_setting(''portal.tenant_id'',true))',table_name);
  END LOOP;
END $$;
