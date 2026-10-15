-- Reject missing JSON identities; CHECK expressions alone accept SQL NULL.
ALTER TABLE portal.users ADD CONSTRAINT user_payload_identity
CHECK (jsonb_typeof(payload)='object' AND payload @> jsonb_build_object('tenantId',tenant_id,'userId',id));
ALTER TABLE portal.companies ADD CONSTRAINT company_payload_identity
CHECK (jsonb_typeof(payload)='object' AND payload @> jsonb_build_object('tenantId',tenant_id,'id',id));
ALTER TABLE portal.templates ADD CONSTRAINT template_payload_identity
CHECK (jsonb_typeof(payload)='object' AND payload @> jsonb_build_object('tenantId',tenant_id,'id',id));
ALTER TABLE portal.tasks ADD CONSTRAINT task_payload_identity
CHECK (jsonb_typeof(payload)='object' AND payload @> jsonb_build_object('tenantId',tenant_id,'id',id));
ALTER TABLE portal.tasks ADD CONSTRAINT task_required_dates
CHECK (payload->>'internalDue' IS NOT NULL AND payload->>'internalDue' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND legal_due ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$');
ALTER TABLE portal.documents ADD CONSTRAINT document_payload_identity
CHECK (jsonb_typeof(payload)='object' AND payload @> jsonb_build_object('id',id) AND payload->>'hash' IS NOT NULL AND payload->>'kind' IS NOT NULL AND payload->>'validation' IS NOT NULL);
ALTER TABLE portal.audit ADD CONSTRAINT audit_payload_identity
CHECK (jsonb_typeof(payload)='object' AND payload @> jsonb_build_object('tenantId',tenant_id,'id',id) AND payload->>'actorId' IS NOT NULL AND payload->>'at' IS NOT NULL AND payload->>'action' IS NOT NULL);
