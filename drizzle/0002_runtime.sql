ALTER TABLE "agent_versions" ADD COLUMN "runtime" varchar(32);--> statement-breakpoint
ALTER TABLE "agent_versions" ADD COLUMN "commands" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "runtime" varchar(32);--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "commands" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX "agents_runtime_idx" ON "agents" USING btree ("runtime");--> statement-breakpoint

-- Backfill agents published before `runtime` existed. The manifest is the
-- first source of truth; otherwise the entrypoint extension decides. Rows that
-- match neither stay NULL and are resolved by the runtime service at read time.
UPDATE "agents" SET "runtime" = COALESCE(
  NULLIF("manifest" ->> 'runtime', ''),
  CASE
    WHEN "entrypoint" ~* '\.(js|mjs|cjs|ts|mts)$' THEN 'node'
    WHEN "entrypoint" ~* '\.py$'                  THEN 'python'
  END
) WHERE "runtime" IS NULL;--> statement-breakpoint

UPDATE "agent_versions" SET "runtime" = COALESCE(
  NULLIF("manifest" ->> 'runtime', ''),
  CASE
    WHEN "entrypoint" ~* '\.(js|mjs|cjs|ts|mts)$' THEN 'node'
    WHEN "entrypoint" ~* '\.py$'                  THEN 'python'
  END
) WHERE "runtime" IS NULL;
