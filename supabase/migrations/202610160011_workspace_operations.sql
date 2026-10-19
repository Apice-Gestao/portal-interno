-- Configuração por grupo e evolução operacional; sem dados ou credenciais reais.
ALTER TABLE portal.users DROP CONSTRAINT users_role_check;
ALTER TABLE portal.users ADD CONSTRAINT users_role_check CHECK (role IN ('admin','supervisor','coordinator','manager','director','operator','viewer'));
DO $$ DECLARE entry record; BEGIN
  FOR entry IN SELECT conrelid::regclass AS table_name,conname FROM pg_constraint
    WHERE conrelid IN ('portal.tasks'::regclass,'portal.templates'::regclass) AND contype='c'
      AND pg_get_constraintdef(oid) LIKE '%department%' LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',entry.table_name,entry.conname);
  END LOOP;
END $$;
ALTER TABLE portal.tasks ADD CONSTRAINT task_department_valid CHECK (length(department) BETWEEN 1 AND 80 AND revision>0);
ALTER TABLE portal.templates ADD CONSTRAINT template_department_valid CHECK (length(department) BETWEEN 1 AND 80);
ALTER TABLE portal.tasks DROP CONSTRAINT tasks_tenant_id_assignee_id_fkey;
ALTER TABLE portal.tasks ADD COLUMN assignee_user_ref text GENERATED ALWAYS AS
  (CASE WHEN payload->>'assigneeId' LIKE 'department:%' THEN NULL ELSE payload->>'assigneeId' END) STORED;
ALTER TABLE portal.tasks ADD CONSTRAINT task_assignee_user_fk FOREIGN KEY (tenant_id,assignee_user_ref) REFERENCES portal.users(tenant_id,id);
ALTER TABLE portal.tasks ADD CONSTRAINT task_queue_department_match CHECK (assignee_id NOT LIKE 'department:%' OR assignee_id='department:'||department);
CREATE TABLE portal.workspace_settings (
  tenant_id text NOT NULL REFERENCES portal.tenants(id), id text NOT NULL DEFAULT 'settings', payload jsonb NOT NULL,
  PRIMARY KEY(tenant_id,id), CHECK(id='settings'),
  CHECK(payload->>'tenantId'=tenant_id AND payload->>'id'=id AND (payload->>'revision')::integer>0),
  CHECK(jsonb_typeof(payload->'departments')='array' AND jsonb_typeof(payload->'accessProfiles')='array' AND jsonb_typeof(payload->'documentTypes')='array' AND jsonb_typeof(payload->'documentRules')='array')
);
CREATE TABLE portal.company_change_proposals (
  tenant_id text NOT NULL REFERENCES portal.tenants(id), id text NOT NULL, payload jsonb NOT NULL,
  company_id text GENERATED ALWAYS AS (payload->>'companyId') STORED NOT NULL,
  PRIMARY KEY(tenant_id,id), FOREIGN KEY(tenant_id,company_id) REFERENCES portal.companies(tenant_id,id),
  CHECK(payload->>'tenantId'=tenant_id AND payload->>'id'=id AND (payload->>'revision')::integer>0),
  CHECK(payload->>'status' IN ('pending','approved','rejected'))
);
DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['workspace_settings','company_change_proposals'] LOOP
    EXECUTE format('ALTER TABLE portal.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE portal.%I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY tenant_scope ON portal.%I USING (tenant_id=current_setting(''portal.tenant_id'',true)) WITH CHECK (tenant_id=current_setting(''portal.tenant_id'',true))',table_name);
    EXECUTE format('REVOKE ALL ON portal.%I FROM PUBLIC',table_name);
  END LOOP;
END $$;
-- Generic process executions may repeat; initial onboarding remains unique per company.
ALTER TABLE portal.company_onboardings DROP CONSTRAINT company_onboardings_tenant_id_company_id_key;
CREATE UNIQUE INDEX company_initial_onboarding_unique ON portal.company_onboardings(tenant_id,company_id) WHERE COALESCE(payload->>'kind','onboarding')='onboarding';
-- Existing user administrators may manage the newly introduced modules. No role inference.
UPDATE portal.users SET payload=jsonb_set(payload,'{permissions}',
  (SELECT jsonb_agg(DISTINCT permission) FROM jsonb_array_elements_text(COALESCE(payload->'permissions','[]'::jsonb) || '["processes.view","processes.manage","documents.view","documents.manage","changes.manage","reports.view","reports.performance.view","tasks.assign","tasks.dispense","tasks.reopen","tasks.cancel","tasks.comment"]'::jsonb) AS permission))
  WHERE payload->'permissions' ? 'users.manage';
UPDATE portal.users SET payload=jsonb_set(payload,'{permissions}',payload->'permissions'||'"tasks.comment"'::jsonb)
  WHERE payload->'permissions' ? 'tasks.execute' AND NOT payload->'permissions' ? 'tasks.comment';
