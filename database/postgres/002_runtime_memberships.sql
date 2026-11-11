-- Phase L Stage 2: profile fields required by the existing React auth UI.
-- Applied by an operator/schema owner before switching APEX_STORAGE_MODE.
BEGIN;
ALTER TABLE apex_memberships
  ADD COLUMN IF NOT EXISTS display_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '';
ALTER TABLE apex_memberships
  ADD CONSTRAINT apex_memberships_username_nonblank CHECK (char_length(trim(username)) >= 3);
COMMIT;
