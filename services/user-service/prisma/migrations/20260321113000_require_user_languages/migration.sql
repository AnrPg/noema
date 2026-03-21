-- Require at least one language for every user profile.
-- Backfill legacy profile.language into profile.languages and seed
-- development/mock users with explicit multi-language preferences.

UPDATE "users"
SET "profile" = jsonb_set(
  jsonb_set(
    COALESCE("profile", '{}'::jsonb),
    '{languages}',
    CASE
      WHEN jsonb_typeof(COALESCE("profile", '{}'::jsonb) -> 'languages') = 'array'
        AND jsonb_array_length(COALESCE("profile", '{}'::jsonb) -> 'languages') > 0
      THEN COALESCE("profile", '{}'::jsonb) -> 'languages'
      WHEN COALESCE("profile", '{}'::jsonb) ? 'language'
        AND COALESCE("profile", '{}'::jsonb) ->> 'language' <> ''
      THEN jsonb_build_array(COALESCE("profile", '{}'::jsonb) ->> 'language')
      ELSE '["en"]'::jsonb
    END,
    true
  ),
  '{language}',
  to_jsonb(
    CASE
      WHEN jsonb_typeof(COALESCE("profile", '{}'::jsonb) -> 'languages') = 'array'
        AND jsonb_array_length(COALESCE("profile", '{}'::jsonb) -> 'languages') > 0
      THEN COALESCE("profile", '{}'::jsonb) -> 'languages' ->> 0
      WHEN COALESCE("profile", '{}'::jsonb) ? 'language'
        AND COALESCE("profile", '{}'::jsonb) ->> 'language' <> ''
      THEN COALESCE("profile", '{}'::jsonb) ->> 'language'
      ELSE 'en'
    END
  ),
  true
);

-- Seed existing local/mock users with explicit language preferences.
UPDATE "users"
SET "profile" = jsonb_set(
  jsonb_set(COALESCE("profile", '{}'::jsonb), '{languages}', '["el","en"]'::jsonb, true),
  '{language}',
  '"el"'::jsonb,
  true
)
WHERE "username" = 'adawsd' OR "email" = 'adawsd@test.com';

UPDATE "users"
SET "profile" = jsonb_set(
  jsonb_set(COALESCE("profile", '{}'::jsonb), '{languages}', '["en","el"]'::jsonb, true),
  '{language}',
  '"en"'::jsonb,
  true
)
WHERE "username" = 'noema_admin' OR "email" = 'admin@noema.local';

UPDATE "users"
SET "profile" = jsonb_set(
  jsonb_set(COALESCE("profile", '{}'::jsonb), '{languages}', '["en","de"]'::jsonb, true),
  '{language}',
  '"en"'::jsonb,
  true
)
WHERE "username" = 'test2' OR "email" = 'test2@test.com';
