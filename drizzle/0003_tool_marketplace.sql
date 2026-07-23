ALTER TABLE "tool_versions" ADD COLUMN "runtime" varchar(16);--> statement-breakpoint
ALTER TABLE "tool_versions" ADD COLUMN "entrypoint" text;--> statement-breakpoint
ALTER TABLE "tool_versions" ADD COLUMN "environment_variables" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tool_versions" ADD COLUMN "permissions" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "tool_versions" ADD COLUMN "dependencies" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "tool_versions" ADD COLUMN "license" varchar(64);--> statement-breakpoint
ALTER TABLE "tool_versions" ADD COLUMN "homepage" text;--> statement-breakpoint
ALTER TABLE "tool_versions" ADD COLUMN "repository" text;--> statement-breakpoint
ALTER TABLE "tools" ADD COLUMN "runtime" varchar(16);--> statement-breakpoint
ALTER TABLE "tools" ADD COLUMN "entrypoint" text;--> statement-breakpoint
ALTER TABLE "tools" ADD COLUMN "environment_variables" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tools" ADD COLUMN "permissions" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "tools" ADD COLUMN "dependencies" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "tools" ADD COLUMN "license" varchar(64);--> statement-breakpoint
ALTER TABLE "tools" ADD COLUMN "homepage" text;--> statement-breakpoint
ALTER TABLE "tools" ADD COLUMN "repository" text;--> statement-breakpoint
CREATE INDEX "tools_runtime_idx" ON "tools" USING btree ("runtime");