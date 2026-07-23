CREATE TYPE "public"."visibility" AS ENUM('public', 'private');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"handle" varchar(64) NOT NULL,
	"display_name" text,
	"email" varchar(320),
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agent_tool_dependencies" (
	"agent_id" uuid NOT NULL,
	"tool_slug" varchar(64) NOT NULL,
	"tool_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_tool_dependencies_agent_id_tool_slug_pk" PRIMARY KEY("agent_id","tool_slug")
);
--> statement-breakpoint
CREATE TABLE "agent_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"version" varchar(64) NOT NULL,
	"version_sort_key" varchar(128) NOT NULL,
	"description" varchar(500) NOT NULL,
	"readme" text,
	"manifest" jsonb NOT NULL,
	"permissions" text[] DEFAULT '{}'::text[] NOT NULL,
	"required_tools" text[] DEFAULT '{}'::text[] NOT NULL,
	"environment_variables" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"entrypoint" text,
	"api_endpoint" text,
	"published_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" varchar(500) NOT NULL,
	"latest_version" varchar(64) NOT NULL,
	"author_id" uuid,
	"author_handle" varchar(64) NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"icon" text,
	"readme" text,
	"permissions" text[] DEFAULT '{}'::text[] NOT NULL,
	"required_tools" text[] DEFAULT '{}'::text[] NOT NULL,
	"environment_variables" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"entrypoint" text,
	"install_command" text,
	"api_endpoint" text,
	"visibility" "visibility" DEFAULT 'public' NOT NULL,
	"manifest" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce("name", '')), 'A') ||
          setweight(to_tsvector('english', coalesce("slug", '')), 'A') ||
          setweight(to_tsvector('english', coalesce(norien_text_array_to_string("tags"), '')), 'B') ||
          setweight(to_tsvector('english', coalesce("description", '')), 'C')) STORED
);
--> statement-breakpoint
CREATE TABLE "tool_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tool_id" uuid NOT NULL,
	"version" varchar(64) NOT NULL,
	"version_sort_key" varchar(128) NOT NULL,
	"description" varchar(500) NOT NULL,
	"input_schema" jsonb NOT NULL,
	"output_schema" jsonb NOT NULL,
	"authentication" jsonb DEFAULT '{"type":"none"}'::jsonb NOT NULL,
	"documentation" text,
	"published_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" varchar(500) NOT NULL,
	"latest_version" varchar(64) NOT NULL,
	"category" varchar(64) DEFAULT 'other' NOT NULL,
	"author_id" uuid,
	"author_handle" varchar(64) NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"input_schema" jsonb NOT NULL,
	"output_schema" jsonb NOT NULL,
	"authentication" jsonb DEFAULT '{"type":"none"}'::jsonb NOT NULL,
	"documentation" text,
	"visibility" "visibility" DEFAULT 'public' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce("name", '')), 'A') ||
          setweight(to_tsvector('english', coalesce("slug", '')), 'A') ||
          setweight(to_tsvector('english', coalesce("category", '')), 'B') ||
          setweight(to_tsvector('english', coalesce(norien_text_array_to_string("tags"), '')), 'B') ||
          setweight(to_tsvector('english', coalesce("description", '')), 'C')) STORED
);
--> statement-breakpoint
CREATE TABLE "installations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"installed_version" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"uninstalled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "agent_tool_dependencies" ADD CONSTRAINT "agent_tool_dependencies_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tool_dependencies" ADD CONSTRAINT "agent_tool_dependencies_tool_id_tools_id_fk" FOREIGN KEY ("tool_id") REFERENCES "public"."tools"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_versions" ADD CONSTRAINT "tool_versions_tool_id_tools_id_fk" FOREIGN KEY ("tool_id") REFERENCES "public"."tools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_versions" ADD CONSTRAINT "tool_versions_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tools" ADD CONSTRAINT "tools_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installations" ADD CONSTRAINT "installations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installations" ADD CONSTRAINT "installations_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "users_handle_unique" ON "users" USING btree ("handle");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "agent_tool_dependencies_tool_idx" ON "agent_tool_dependencies" USING btree ("tool_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_versions_agent_version_unique" ON "agent_versions" USING btree ("agent_id","version");--> statement-breakpoint
CREATE INDEX "agent_versions_sort_idx" ON "agent_versions" USING btree ("agent_id","version_sort_key");--> statement-breakpoint
CREATE UNIQUE INDEX "agents_slug_unique" ON "agents" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "agents_visibility_idx" ON "agents" USING btree ("visibility");--> statement-breakpoint
CREATE INDEX "agents_author_idx" ON "agents" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "agents_created_at_idx" ON "agents" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "agents_updated_at_idx" ON "agents" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "agents_tags_gin" ON "agents" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "agents_search_gin" ON "agents" USING gin ("search_vector");--> statement-breakpoint
CREATE UNIQUE INDEX "tool_versions_tool_version_unique" ON "tool_versions" USING btree ("tool_id","version");--> statement-breakpoint
CREATE INDEX "tool_versions_sort_idx" ON "tool_versions" USING btree ("tool_id","version_sort_key");--> statement-breakpoint
CREATE UNIQUE INDEX "tools_slug_unique" ON "tools" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "tools_category_idx" ON "tools" USING btree ("category");--> statement-breakpoint
CREATE INDEX "tools_visibility_idx" ON "tools" USING btree ("visibility");--> statement-breakpoint
CREATE INDEX "tools_author_idx" ON "tools" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "tools_created_at_idx" ON "tools" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "tools_tags_gin" ON "tools" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "tools_search_gin" ON "tools" USING gin ("search_vector");--> statement-breakpoint
CREATE UNIQUE INDEX "installations_active_unique" ON "installations" USING btree ("user_id","agent_id") WHERE "installations"."uninstalled_at" is null;--> statement-breakpoint
CREATE INDEX "installations_user_idx" ON "installations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "installations_agent_idx" ON "installations" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "installations_installed_at_idx" ON "installations" USING btree ("created_at");