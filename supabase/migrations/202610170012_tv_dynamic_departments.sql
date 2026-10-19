-- TV scopes follow the configurable department catalogue (up to 30 IDs).
-- Keep applied migrations immutable; replace only the legacy scope CHECK.
DO $$
DECLARE old_constraint record;
BEGIN
  FOR old_constraint IN
    SELECT conname FROM pg_constraint
    WHERE conrelid='portal.tv_devices'::regclass AND contype='c'
      AND pg_get_constraintdef(oid) LIKE '%departments%'
      AND pg_get_constraintdef(oid) LIKE '%jsonb_array_length%'
  LOOP
    EXECUTE format('ALTER TABLE portal.tv_devices DROP CONSTRAINT %I', old_constraint.conname);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION portal.tv_departments_valid(departments jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog AS $$
  SELECT COALESCE(CASE WHEN jsonb_typeof(departments)='array' THEN
    jsonb_array_length(departments) BETWEEN 1 AND 30
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(departments) AS entry(value)
      WHERE jsonb_typeof(value) IS DISTINCT FROM 'string'
        OR length(value #>> '{}') NOT BETWEEN 1 AND 80
        OR value #>> '{}' <> btrim(value #>> '{}')
        OR value #>> '{}' ~ ('[' || chr(1) || '-' || chr(31) || ']')
    )
    AND (SELECT count(DISTINCT value) FROM jsonb_array_elements(departments) AS entry(value))
      = jsonb_array_length(departments)
    ELSE false END, false);
$$;

ALTER TABLE portal.tv_devices DROP CONSTRAINT IF EXISTS tv_devices_departments_valid;
ALTER TABLE portal.tv_devices ADD CONSTRAINT tv_devices_departments_valid
  CHECK (portal.tv_departments_valid(payload->'departments'));
