-- Removal tokens: SHA-256 of a secret returned once to the creator of a roast.
-- NULL for roasts created before this migration (those can no longer be removed via the API).
ALTER TABLE roasts ADD COLUMN removeTokenHash TEXT;
