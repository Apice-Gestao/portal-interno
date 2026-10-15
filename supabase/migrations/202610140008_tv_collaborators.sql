-- Extend the configuration catalogue without expanding persisted device scopes.
DO $$
DECLARE old_constraint text;
BEGIN
  SELECT conname INTO STRICT old_constraint
    FROM pg_constraint
    WHERE conrelid='portal.tv_devices'::regclass AND contype='c'
      AND pg_get_constraintdef(oid) LIKE '%blocks%'
      AND pg_get_constraintdef(oid) LIKE '%jsonb_array_length%';
  EXECUTE format('ALTER TABLE portal.tv_devices DROP CONSTRAINT %I', old_constraint);
END $$;
ALTER TABLE portal.tv_devices ADD CONSTRAINT tv_devices_blocks_check CHECK (
  jsonb_typeof(payload->'blocks')='array'
  AND jsonb_array_length(payload->'blocks') BETWEEN 1 AND 6
  AND payload->'blocks' <@ '["progress","deadlines","obligations","deliveries","upcoming","collaborators"]'::jsonb
);
