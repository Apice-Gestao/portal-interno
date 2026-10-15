-- Team work in TV is an explicit capability, independent of job title.
-- Initialize it only for existing capability administrators.
UPDATE portal.users
SET payload = jsonb_set(payload, '{permissions}', (
  SELECT jsonb_agg(permission ORDER BY permission)
  FROM (
    SELECT DISTINCT jsonb_array_elements_text(payload->'permissions') AS permission
    UNION SELECT 'tv.team.view'
  ) grants
))
WHERE jsonb_typeof(payload->'permissions') = 'array'
  AND payload->'permissions' ? 'users.manage';
