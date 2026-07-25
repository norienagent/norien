CREATE TYPE "public"."skill_data_source" AS ENUM('none', 'markets', 'portfolio', 'token', 'registry');--> statement-breakpoint
CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" varchar(500) NOT NULL,
	"version" varchar(64) DEFAULT '1.0.0' NOT NULL,
	"category" varchar(64) DEFAULT 'other' NOT NULL,
	"author_id" uuid,
	"author_handle" varchar(64) NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"instructions" text NOT NULL,
	"data_source" "skill_data_source" DEFAULT 'none' NOT NULL,
	"input_hint" varchar(200),
	"examples" jsonb DEFAULT '[]'::jsonb NOT NULL,
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
ALTER TABLE "skills" ADD CONSTRAINT "skills_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "skills_slug_unique" ON "skills" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "skills_category_idx" ON "skills" USING btree ("category");--> statement-breakpoint
CREATE INDEX "skills_visibility_idx" ON "skills" USING btree ("visibility");--> statement-breakpoint
CREATE INDEX "skills_author_idx" ON "skills" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "skills_created_at_idx" ON "skills" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "skills_tags_gin" ON "skills" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "skills_search_gin" ON "skills" USING gin ("search_vector");