-- Ordered company onboarding. Definitions are versioned; running instances
-- retain their own immutable copy of each stage and its assigned operator.
CREATE TABLE portal.department_flows (
  tenant_id text NOT NULL REFERENCES portal.tenants(id),
  id text NOT NULL,
  payload jsonb NOT NULL,
  PRIMARY KEY(tenant_id,id),
  CHECK (payload ?& ARRAY['id','tenantId','title','version','active','stages']),
  CHECK (payload->>'tenantId'=tenant_id AND payload->>'id'=id),
  CHECK (length(payload->>'title') BETWEEN 3 AND 100),
  CHECK (jsonb_typeof(payload->'active')='boolean'),
  CHECK ((payload->>'version')::integer > 0),
  CHECK (jsonb_typeof(payload->'stages')='array' AND jsonb_array_length(payload->'stages') BETWEEN 1 AND 30)
);
CREATE TABLE portal.company_onboardings (
  tenant_id text NOT NULL REFERENCES portal.tenants(id),
  id text NOT NULL,
  payload jsonb NOT NULL,
  company_id text GENERATED ALWAYS AS (payload->>'companyId') STORED NOT NULL,
  flow_id text GENERATED ALWAYS AS (payload->>'flowId') STORED NOT NULL,
  PRIMARY KEY(tenant_id,id),
  UNIQUE(tenant_id,company_id),
  FOREIGN KEY(tenant_id,company_id) REFERENCES portal.companies(tenant_id,id),
  FOREIGN KEY(tenant_id,flow_id) REFERENCES portal.department_flows(tenant_id,id),
  CHECK (payload ?& ARRAY['id','tenantId','companyId','flowId','flowVersion','flowTitle','competence','blockRecurring','status','startedAt','revision','stages']),
  CHECK (payload->>'tenantId'=tenant_id AND payload->>'id'=id),
  CHECK ((payload->>'flowVersion')::integer > 0 AND (payload->>'revision')::integer > 0),
  CHECK (payload->>'competence' ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND payload->>'competence'>='0001-01'),
  CHECK (jsonb_typeof(payload->'blockRecurring')='boolean'),
  CHECK (payload->>'status' IN ('active','completed')),
  CHECK (jsonb_typeof(payload->'stages')='array' AND jsonb_array_length(payload->'stages') BETWEEN 1 AND 30)
);
ALTER TABLE portal.tasks ADD COLUMN onboarding_id text GENERATED ALWAYS AS (payload->>'onboardingId') STORED;
ALTER TABLE portal.tasks ADD CONSTRAINT task_onboarding_scope FOREIGN KEY(tenant_id,onboarding_id) REFERENCES portal.company_onboardings(tenant_id,id);
CREATE UNIQUE INDEX task_onboarding_stage ON portal.tasks(tenant_id,onboarding_id,(payload->>'onboardingStageId')) WHERE onboarding_id IS NOT NULL;
ALTER TABLE portal.tasks ADD CONSTRAINT task_onboarding_link CHECK (
  (NOT payload ? 'onboardingId' AND NOT payload ? 'onboardingStageId')
  OR (payload ?& ARRAY['onboardingId','onboardingStageId','evidenceRequired']
    AND jsonb_typeof(payload->'onboardingId')='string'
    AND jsonb_typeof(payload->'onboardingStageId')='string'
    AND length(payload->>'onboardingId')>0 AND length(payload->>'onboardingStageId')>0
    AND jsonb_typeof(payload->'evidenceRequired')='boolean'
    AND payload->>'templateId'='avulsa')
);
DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['department_flows','company_onboardings'] LOOP
    EXECUTE format('ALTER TABLE portal.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE portal.%I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY tenant_scope ON portal.%I USING (tenant_id = current_setting(''portal.tenant_id'',true)) WITH CHECK (tenant_id = current_setting(''portal.tenant_id'',true))',table_name);
    EXECUTE format('REVOKE ALL ON portal.%I FROM PUBLIC',table_name);
  END LOOP;
END $$;
