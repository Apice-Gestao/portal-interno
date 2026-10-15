-- Existing users.manage holders already administer capabilities. Initialize the
-- new TV capabilities for them; no grant is inferred from a job title.
UPDATE portal.users
SET payload = jsonb_set(payload, '{permissions}', (
  SELECT jsonb_agg(permission ORDER BY permission)
  FROM (
    SELECT DISTINCT jsonb_array_elements_text(payload->'permissions') AS permission
    UNION
    SELECT unnest(ARRAY['tv.view', 'tv.manage', 'tv.configure'])
  ) grants
))
WHERE jsonb_typeof(payload->'permissions') = 'array'
  AND payload->'permissions' ? 'users.manage';
