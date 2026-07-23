-- Bootstrap objects that the generated schema migrations depend on.
--
-- Postgres marks the built-in `array_to_string` as STABLE, so it cannot appear
-- inside a STORED generated column. Joining a text[] with a constant delimiter
-- is genuinely deterministic, so we expose an IMMUTABLE wrapper and use that in
-- the search vectors on `agents` and `tools`.
CREATE OR REPLACE FUNCTION norien_text_array_to_string(text[])
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$ SELECT array_to_string($1, ' ') $$;
